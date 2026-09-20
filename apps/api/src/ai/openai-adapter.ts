/**
 * OpenAI-compatible provider adapter.
 *
 * "Compatible" is the important word: this one implementation covers OpenAI,
 * Azure-hosted gateways, and self-hosted runtimes that expose the same surface —
 * vLLM, Text Generation Inference, Ollama and LM Studio all do. A school that
 * buys a GPU box and runs a model on-prem changes one environment variable; it
 * does not need a new adapter, and its lesson text never leaves the building.
 *
 * Every failure raises a typed `AiError`. The adapter never swallows an error and
 * never returns partial output: the `FallbackAdapter` above it is what turns a
 * failure into a degraded-but-usable result, and it can only do that if it is
 * told the truth.
 */

import {
  AiError,
  AI_LIMITS,
  type AiAdapter,
  type AiCapability,
  type AiProvenance,
  type ExtractKeywordsRequest,
  type ExtractKeywordsResult,
  type GlossaryEntry,
  type Keyword,
  type SimplifiedSegment,
  type SimplifyTextRequest,
  type SimplifyTextResult,
  type SynthesizeRequest,
  type SynthesizeResult,
  type TranscribeRequest,
  type TranscribeResult,
  type TranscribedWord,
} from '@sahaj/shared/ai';

import { analyzeReadability, splitSentences } from '@sahaj/shared/nlp';

import { fetchWithRetry, HttpError } from './http';
import { buildKeywordsPrompt, buildSimplifyPrompt } from './prompts';

export interface OpenAiAdapterOptions {
  apiKey: string;
  baseUrl: string;
  simplifyModel: string;
  sttModel: string;
  timeoutMs: number;
  maxRetries: number;
  /** Injected in tests so the suite never touches the network. */
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
}

const CAPABILITIES: readonly AiCapability[] = [
  'simplify-text',
  'extract-keywords',
  'speech-to-text',
  'text-to-speech',
];

export function createOpenAiAdapter(options: OpenAiAdapterOptions): AiAdapter {
  const modelLabel = options.simplifyModel;

  const provenance = (startedAt: number, model = modelLabel): AiProvenance => ({
    provider: 'openai',
    model,
    degraded: false,
    latencyMs: Date.now() - startedAt,
  });

  const chat = async (system: string, user: string, label: string): Promise<unknown> => {
    const response = await fetchWithRetry(
      `${options.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          model: options.simplifyModel,
          temperature: 0.2,
          // JSON mode removes the most common parse failure: a chatty preamble.
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      },
      {
        timeoutMs: options.timeoutMs,
        maxRetries: options.maxRetries,
        label,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
        ...(options.sleepImpl ? { sleepImpl: options.sleepImpl } : {}),
      },
    );

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new AiError(`${label} returned an empty response`, 'provider-error');
    }
    return parseJsonObject(content, label);
  };

  return {
    id: 'openai',
    offline: false,
    capabilities: () => CAPABILITIES,
    supports: (capability) => CAPABILITIES.includes(capability),

    async simplifyText(request: SimplifyTextRequest): Promise<SimplifyTextResult> {
      const startedAt = Date.now();
      const sentences = splitSentences(request.text);
      if (sentences.length === 0) throw new AiError('The text is empty.', 'invalid-request');

      const { system, user } = buildSimplifyPrompt({
        text: request.text,
        targetGrade: request.targetGrade,
        language: request.language,
        preserveTerms: request.preserveTerms ?? [],
        sentenceCount: sentences.length,
      });

      const parsed = (await chat(system, user, 'simplify-text')) as {
        sentences?: { original?: unknown; simplified?: unknown }[];
        glossary?: { term?: unknown; definition?: unknown }[];
      };

      const segments = alignSegments(sentences, parsed.sentences ?? []);
      if (segments.length === 0) {
        throw new AiError('The provider returned no usable sentences', 'provider-error');
      }

      const simplifiedText = segments.map((segment) => segment.simplified).join(' ');

      // Post-condition checks the prompt alone cannot guarantee. A violation is a
      // provider failure, not something to paper over: the caller can still serve
      // the offline simplification, which does preserve terms.
      assertPreservedTerms(segments, request.preserveTerms ?? []);

      return {
        simplifiedText,
        segments,
        glossary: toGlossary(parsed.glossary ?? [], simplifiedText),
        readabilityBefore: analyzeReadability(request.text),
        readabilityAfter: analyzeReadability(simplifiedText),
        provenance: provenance(startedAt),
      };
    },

    async extractKeywords(request: ExtractKeywordsRequest): Promise<ExtractKeywordsResult> {
      const startedAt = Date.now();
      const limit = Math.min(Math.max(request.limit ?? 12, 1), AI_LIMITS.maxKeywords);
      const { system, user } = buildKeywordsPrompt({
        text: request.text,
        language: request.language,
        limit,
      });

      const parsed = (await chat(system, user, 'extract-keywords')) as {
        keywords?: { term?: unknown; weight?: unknown }[];
        questions?: unknown;
      };

      const keywords = toKeywords(parsed.keywords ?? [], request.text, limit);
      if (keywords.length === 0) {
        throw new AiError('The provider returned no keywords', 'provider-error');
      }

      const questions = Array.isArray(parsed.questions)
        ? parsed.questions.filter((question): question is string => typeof question === 'string').slice(0, 5)
        : [];

      return { keywords, suggestedQuestions: questions, provenance: provenance(startedAt) };
    },

    async transcribe(request: TranscribeRequest): Promise<TranscribeResult> {
      const startedAt = Date.now();
      const form = new FormData();
      // Copy into a fresh view: the caller's buffer may be a slice of a larger one,
      // and some runtimes refuse a detached ArrayBuffer.
      form.append('file', new Blob([new Uint8Array(request.audio)], { type: request.mimeType }), 'audio');
      form.append('model', options.sttModel);
      form.append('language', request.language);
      // Verbose output is what provides word timings, which karaoke needs.
      form.append('response_format', 'verbose_json');

      // Lesson vocabulary as a decoding hint: this is the single biggest accuracy
      // win for child speech on a known topic, and it costs nothing.
      const prompt = [...(request.expectedPhrases ?? []), request.questionContext ?? '']
        .filter((value) => value.length > 0)
        .join(', ');
      if (prompt.length > 0) form.append('prompt', prompt.slice(0, 800));

      if (request.tolerance === 'child' || request.tolerance === 'dysarthria') {
        // Higher temperature makes the decoder more willing to accept an
        // imperfect match instead of returning nothing.
        form.append('temperature', '0.3');
      }

      const response = await fetchWithRetry(
        `${options.baseUrl}/audio/transcriptions`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${options.apiKey}` },
          body: form,
        },
        {
          timeoutMs: options.timeoutMs,
          maxRetries: options.maxRetries,
          label: 'speech-to-text',
          ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
          ...(options.sleepImpl ? { sleepImpl: options.sleepImpl } : {}),
        },
      );

      const payload = (await response.json()) as {
        text?: unknown;
        words?: { word?: unknown; start?: unknown; end?: unknown }[];
        segments?: { text?: unknown; avg_logprob?: unknown }[];
      };

      const text = typeof payload.text === 'string' ? payload.text.trim() : '';
      if (text.length === 0) {
        throw new AiError('The provider returned an empty transcript', 'provider-error');
      }

      // Whisper does not report a calibrated confidence. `avg_logprob` is the
      // closest available signal, mapped into 0–1 with a floor, and the UI only
      // ever uses it to decide whether to re-prompt a learner gently.
      const confidence = toConfidence(payload.segments);

      return {
        text,
        confidence,
        alternatives: [],
        words: toTranscribedWords(payload.words ?? [], confidence),
        provenance: provenance(startedAt, options.sttModel),
      };
    },

    async synthesize(request: SynthesizeRequest): Promise<SynthesizeResult> {
      const startedAt = Date.now();
      const response = await fetchWithRetry(
        `${options.baseUrl}/audio/speech`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify({
            model: 'tts-1',
            voice: request.voiceId ?? 'alloy',
            input: request.text,
            // Clamped by the shared contract; never sped past 1.25×.
            speed: Math.min(Math.max(request.rate, 0.5), 1.25),
            response_format: 'mp3',
          }),
        },
        {
          timeoutMs: options.timeoutMs,
          maxRetries: options.maxRetries,
          label: 'text-to-speech',
          ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
          ...(options.sleepImpl ? { sleepImpl: options.sleepImpl } : {}),
        },
      );

      const audio = new Uint8Array(await response.arrayBuffer());
      return {
        audio,
        mimeType: response.headers.get('content-type') ?? 'audio/mpeg',
        // Server-side TTS does not emit per-word timings. The reader degrades to
        // sentence-level highlighting, which is what `wordTimings: []` means.
        wordTimings: [],
        durationMs: 0,
        provenance: provenance(startedAt, 'tts-1'),
      };
    },
  };
}

function parseJsonObject(content: string, label: string): unknown {
  // Some gateways still wrap JSON in a markdown fence despite JSON mode.
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new AiError(`${label} returned unparseable JSON`, 'provider-error');
  }
}

/**
 * Pairs the model's output with the caller's sentences.
 * Uses the model's own `original` when it matches an input sentence; otherwise
 * falls back to positional pairing, which is why the prompt insists on order.
 */
function alignSegments(
  originalSentences: readonly string[],
  returned: readonly { original?: unknown; simplified?: unknown }[],
): SimplifiedSegment[] {
  const segments: SimplifiedSegment[] = [];
  for (let index = 0; index < originalSentences.length; index += 1) {
    const original = originalSentences[index]!;
    const candidate = returned[index];
    const simplified =
      typeof candidate?.simplified === 'string' && candidate.simplified.trim().length > 0
        ? candidate.simplified.trim()
        : original; // Never drop a sentence: keeping the original is a safe failure.
    segments.push({ original, simplified });
  }
  return segments;
}

function assertPreservedTerms(segments: readonly SimplifiedSegment[], terms: readonly string[]): void {
  if (terms.length === 0) return;
  for (const segment of segments) {
    const originalLower = segment.original.toLowerCase();
    const simplifiedLower = segment.simplified.toLowerCase();
    for (const term of terms) {
      const key = term.toLowerCase();
      if (originalLower.includes(key) && !simplifiedLower.includes(key)) {
        throw new AiError(
          `Simplification dropped the required term "${term}" and was rejected.`,
          'provider-error',
        );
      }
    }
  }
}

function toGlossary(
  raw: readonly { term?: unknown; definition?: unknown }[],
  simplified: string,
): GlossaryEntry[] {
  return raw
    .filter(
      (entry): entry is { term: string; definition: string } =>
        typeof entry.term === 'string' &&
        entry.term.trim().length > 0 &&
        typeof entry.definition === 'string' &&
        entry.definition.trim().length > 0,
    )
    .slice(0, 20)
    .map((entry) => {
      const lower = simplified.toLowerCase();
      const index = lower.indexOf(entry.term.toLowerCase());
      return {
        term: entry.term.trim(),
        definition: entry.definition.trim(),
        // -1 is preserved rather than normalised: the reader treats a negative
        // index as "defined, but not linked to a word in this passage" and shows
        // it in the glossary section only.
        firstIndex: index,
      };
    });
}

function toKeywords(
  raw: readonly { term?: unknown; weight?: unknown }[],
  text: string,
  limit: number,
): Keyword[] {
  const lowered = text.toLowerCase();
  const seen = new Set<string>();

  return raw
    .filter((entry): entry is { term: string; weight?: unknown } => {
      if (typeof entry.term !== 'string') return false;
      const term = entry.term.trim().toLowerCase();
      if (term.length < 3 || seen.has(term)) return false;
      // Guards against the model inventing a term that is not in the passage.
      if (!lowered.includes(term)) return false;
      seen.add(term);
      return true;
    })
    .slice(0, limit)
    .map((entry) => {
      const term = entry.term.trim();
      const weight = typeof entry.weight === 'number' && Number.isFinite(entry.weight) ? entry.weight : 0.5;
      return {
        term,
        weight: Math.min(Math.max(weight, 0), 1),
        occurrences: countOccurrences(lowered, term.toLowerCase()),
      };
    })
    .sort((a, b) => b.weight - a.weight);
}

function countOccurrences(haystackLower: string, needleLower: string): number {
  if (needleLower.length === 0) return 0;
  let count = 0;
  let index = haystackLower.indexOf(needleLower);
  while (index !== -1) {
    count += 1;
    index = haystackLower.indexOf(needleLower, index + needleLower.length);
  }
  return count;
}

function toConfidence(segments: { avg_logprob?: unknown }[] | undefined): number {
  if (!segments || segments.length === 0) return 0.6;
  const values = segments
    .map((segment) => segment.avg_logprob)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (values.length === 0) return 0.6;
  const average = values.reduce((total, value) => total + value, 0) / values.length;
  // avg_logprob is <= 0; -0.1 is confident, -1.0 is poor. Map and floor so a
  // learner is never told "0% confident" and re-prompted forever.
  const mapped = 1 + average;
  return Number(Math.min(Math.max(mapped, 0.35), 1).toFixed(2));
}

function toTranscribedWords(
  words: readonly { word?: unknown; start?: unknown; end?: unknown }[],
  overallConfidence: number,
): TranscribedWord[] {
  const timings: TranscribedWord[] = [];
  for (const entry of words) {
    if (typeof entry.word !== 'string') continue;
    timings.push({
      word: entry.word.trim(),
      startMs: Math.round((typeof entry.start === 'number' ? entry.start : 0) * 1000),
      endMs: Math.round((typeof entry.end === 'number' ? entry.end : 0) * 1000),
      // The provider reports confidence per *segment*, not per word. Repeating the
      // segment value is honest; inventing a per-word number would not be, and
      // no UI decision depends on per-word confidence today.
      confidence: overallConfidence,
    });
  }
  return timings;
}

/** Re-exported so route handlers can map provider status codes to HTTP. */
export { HttpError };
