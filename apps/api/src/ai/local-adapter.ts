/**
 * The offline adapter.
 *
 * Two capabilities are implemented for real here, because both can be done
 * deterministically and both are needed when there is no network:
 *  - text simplification (see `local-simplifier.ts`)
 *  - keyword / concept extraction
 *
 * Speech is intentionally *not* implemented: the browser's own
 * `SpeechSynthesis` and `SpeechRecognition` run on the device, need no
 * bandwidth, and beat any server round-trip on a 2G connection. The API exposes
 * the capability as unsupported rather than faking it, so a caller knows to use
 * the device API instead of waiting for a response that will never be useful.
 */

import {
  AiError,
  AI_LIMITS,
  type AiAdapter,
  type AiCapability,
  type AiProvenance,
  type ExtractKeywordsRequest,
  type ExtractKeywordsResult,
  type Keyword,
  type SimplifyTextRequest,
  type SimplifyTextResult,
  type SynthesizeRequest,
  type SynthesizeResult,
  type TranscribeRequest,
  type TranscribeResult,
} from '@sahaj/shared/ai';
import { splitWords } from '@sahaj/shared/nlp';

import { simplifyTextOffline } from './local-simplifier';

const LOCAL_MODEL_ID = 'rule-based-v1';

/**
 * Function words carry no topic information, and leaving them in makes every
 * passage's top keyword "the". Kept as a flat set rather than an array because
 * this lookup runs once per token.
 */
const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'about', 'after', 'again', 'all', 'also', 'an', 'and', 'another', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'between', 'both', 'but', 'by', 'can', 'could',
  'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had',
  'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'may', 'me', 'might', 'more',
  'most', 'must', 'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only',
  'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she', 'should', 'so',
  'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there',
  'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was',
  'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with',
  'would', 'you', 'your', 'yours', 'yourself', 'yourselves',
]);

const SUPPORTED: readonly AiCapability[] = ['simplify-text', 'extract-keywords'];

function degradedProvenance(reason: string, startedAt: number): AiProvenance {
  return {
    provider: 'local',
    model: LOCAL_MODEL_ID,
    degraded: true,
    degradedReason: reason,
    latencyMs: Date.now() - startedAt,
  };
}

export function createLocalAdapter(): AiAdapter {
  return {
    id: 'local',
    offline: true,
    capabilities: () => SUPPORTED,
    supports: (capability) => SUPPORTED.includes(capability),

    async simplifyText(request: SimplifyTextRequest): Promise<SimplifyTextResult> {
      const startedAt = Date.now();
      const text = requireText(request.text);

      const result = simplifyTextOffline(text, {
        targetGrade: clampGrade(request.targetGrade),
        preserveTerms: request.preserveTerms ?? [],
        ...(request.maxWords !== undefined ? { maxWords: request.maxWords } : {}),
      });

      return {
        simplifiedText: result.simplifiedText,
        segments: result.segments,
        glossary: result.glossary,
        readabilityBefore: result.readabilityBefore,
        readabilityAfter: result.readabilityAfter,
        provenance: degradedProvenance(
          'No AI provider is available, so this text was simplified by the offline rule-based engine on the school server.',
          startedAt,
        ),
      };
    },

    async extractKeywords(request: ExtractKeywordsRequest): Promise<ExtractKeywordsResult> {
      const startedAt = Date.now();
      const text = requireText(request.text);
      const limit = Math.min(Math.max(request.limit ?? 12, 1), AI_LIMITS.maxKeywords);
      const keywords = extractKeywords(text, limit);

      return {
        keywords,
        // Question stems come from the top three concepts: more would be noise a
        // teacher has to delete, fewer would miss the point of the passage.
        suggestedQuestions: buildQuestions(keywords.slice(0, 3)),
        provenance: degradedProvenance(
          'Keywords were extracted by the offline frequency engine, not by a language model.',
          startedAt,
        ),
      };
    },

    async transcribe(_request: TranscribeRequest): Promise<TranscribeResult> {
      throw new AiError(
        'Speech-to-text runs in the browser (Web Speech API) and is not implemented server-side in offline mode.',
        'unsupported-capability',
      );
    },

    async synthesize(_request: SynthesizeRequest): Promise<SynthesizeResult> {
      throw new AiError(
        'Text-to-speech runs in the browser (SpeechSynthesis) and is not implemented server-side in offline mode.',
        'unsupported-capability',
      );
    },
  };
}

/**
 * Frequency-based keyword extraction.
 *
 * Scoring: occurrences × a mild length bonus, normalised to 0–1 across the
 * result set. The length bonus exists because in school text the longer word in
 * a pair ("evaporation" / "water") is almost always the concept being taught.
 * Bigrams are kept when they repeat, since "water cycle" means more than either
 * word alone.
 */
export function extractKeywords(text: string, limit: number): Keyword[] {
  const words = splitWords(text).map((word) => word.toLowerCase());
  const counts = new Map<string, number>();
  let tokenCount = 0;

  for (const word of words) {
    if (word.length < 3 || STOPWORDS.has(word) || /^\d+$/.test(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
    tokenCount += 1;
  }

  // Repeated bigrams: "water cycle", "food chain".
  const bigramCounts = new Map<string, number>();
  const lowered = text.toLowerCase();
  for (let i = 0; i < words.length - 1; i += 1) {
    const first = words[i]!;
    const second = words[i + 1]!;
    if (STOPWORDS.has(first) || STOPWORDS.has(second)) continue;
    if (first.length < 3 || second.length < 3) continue;
    const phrase = `${first} ${second}`;
    // Guard against tokens that were never adjacent in the source (punctuation).
    if (!lowered.includes(phrase)) continue;
    bigramCounts.set(phrase, (bigramCounts.get(phrase) ?? 0) + 1);
  }

  const scored: Keyword[] = [];
  for (const [term, occurrences] of counts) {
    if (occurrences < 1) continue;
    scored.push({
      term,
      occurrences,
      weight: occurrences * (1 + term.length / 12) * (tokenCount > 0 ? 1 / Math.sqrt(tokenCount) : 1),
    });
  }
  for (const [term, occurrences] of bigramCounts) {
    // Require repetition: a single bigram is usually an accident of phrasing.
    if (occurrences < 2) continue;
    scored.push({ term, occurrences, weight: occurrences * 1.6 });
  }

  scored.sort((a, b) => b.weight - a.weight || a.term.localeCompare(b.term));
  const top = scored.slice(0, limit);
  const highest = top[0]?.weight ?? 1;

  return top.map((keyword) => ({
    ...keyword,
    weight: Number((keyword.weight / highest).toFixed(3)),
  }));
}

/** Question stems a teacher can turn into a quiz without writing anything. */
function buildQuestions(keywords: readonly Keyword[]): string[] {
  return keywords.map((keyword) => {
    const term = keyword.term;
    if (/\s/.test(term)) return `What happens during the ${term}?`;
    return `What does “${term}” mean?`;
  });
}

function requireText(text: string): string {
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new AiError('The text is empty.', 'invalid-request');
  }
  if (text.length > AI_LIMITS.maxTextLength) {
    throw new AiError(
      `The text is longer than the ${AI_LIMITS.maxTextLength} character limit.`,
      'invalid-request',
    );
  }
  return text;
}

function clampGrade(grade: number): number {
  if (!Number.isFinite(grade)) return 3;
  return Math.min(Math.max(Math.round(grade), AI_LIMITS.minGrade), AI_LIMITS.maxGrade);
}
