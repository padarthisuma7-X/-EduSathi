/**
 * AI/NLP contracts for Module 2.
 *
 * Every capability the platform uses is described here and nowhere else. The
 * web app and the API both depend on `AiAdapter`, never on a vendor SDK, so:
 *   - swapping OpenAI for a self-hosted model is a one-file change;
 *   - the offline fallback is a first-class implementation, not an error path;
 *   - every result carries `degraded`, letting the UI tell a teacher when output
 *     came from the rule-based engine instead of a model.
 */

import type { ReadabilityMetrics } from '../nlp/readability';

/** Capabilities an implementation may or may not support. */
export const AI_CAPABILITIES = [
  'simplify-text',
  'extract-keywords',
  'speech-to-text',
  'text-to-speech',
  'translate',
] as const;

export type AiCapability = (typeof AI_CAPABILITIES)[number];

export type AiProviderId = 'local' | 'huggingface' | 'openai' | 'custom';

/** Provenance attached to every result, surfaced in the teacher dashboard. */
export interface AiProvenance {
  provider: AiProviderId;
  model: string;
  /**
   * True when the result did not come from a model — either because the device
   * is offline, the provider failed and we recovered, or no key is configured.
   * The UI must render this as a visible, non-blocking notice.
   */
  degraded: boolean;
  /** Present when `degraded` is true. Human-readable, safe to log. */
  degradedReason?: string;
  /** Wall-clock latency in ms; feeds the latency budget on low-end devices. */
  latencyMs: number;
}

// --- Text simplification ---------------------------------------------------

export interface SimplifyTextRequest {
  text: string;
  /** Target reading grade, e.g. 2 for Class 2. Bounded 1–12. */
  targetGrade: number;
  /** BCP-47 tag, e.g. 'en', 'hi', 'kn'. */
  language: string;
  /**
   * Terms that must survive simplification (the lesson's actual vocabulary).
   * The pipeline is allowed to define them, never to drop them.
   */
  preserveTerms?: readonly string[];
  /** Keep the result under this many words when possible. */
  maxWords?: number;
  /** Abort the provider call after this many ms. */
  timeoutMs?: number;
}

export interface GlossaryEntry {
  term: string;
  /** Child-friendly definition, at most one sentence. */
  definition: string;
  /** Where the term first appears in the simplified text. */
  firstIndex: number;
}

export interface SimplifyTextResult {
  simplifiedText: string;
  /** Sentence-level pairing so the reader can offer "show original". */
  segments: SimplifiedSegment[];
  glossary: GlossaryEntry[];
  readabilityBefore: ReadabilityMetrics;
  readabilityAfter: ReadabilityMetrics;
  provenance: AiProvenance;
}

export interface SimplifiedSegment {
  original: string;
  simplified: string;
}

// --- Keyword / concept extraction -----------------------------------------

export interface ExtractKeywordsRequest {
  text: string;
  language: string;
  limit?: number;
  /** Grade the output should be readable at; drives the hint text. */
  targetGrade?: number;
}

export interface Keyword {
  term: string;
  /** 0–1, higher = more central to the passage. */
  weight: number;
  /** Number of occurrences in the source text. */
  occurrences: number;
}

export interface ExtractKeywordsResult {
  keywords: Keyword[];
  /** Suggested question stems a teacher can turn into a quiz instantly. */
  suggestedQuestions: string[];
  provenance: AiProvenance;
}

// --- Speech to text --------------------------------------------------------

export interface TranscribeRequest {
  /** Raw audio bytes. Kept as bytes so this type works in Node and the browser. */
  audio: Uint8Array;
  mimeType: string;
  language: string;
  /**
   * Enables error tolerance for child speech, dysarthria and regional accents:
   * the adapter should prefer recall over precision, return multiple
   * hypotheses, and never hard-fail on low confidence.
   */
  tolerance?: 'child' | 'dysarthria' | 'regional-accent' | 'none';
  /** Words/phrases from the current lesson, used as a decoding bias. */
  expectedPhrases?: readonly string[];
  /** Prompt for the learner to answer; helps disambiguate homophones. */
  questionContext?: string;
}

export interface TranscribedWord {
  word: string;
  startMs: number;
  endMs: number;
  /** 0–1 */
  confidence: number;
}

export interface TranscribeResult {
  /** Best hypothesis, normalised and punctuation-restored. */
  text: string;
  /** 0–1 overall confidence. */
  confidence: number;
  /** Alternative hypotheses, best-first (max 3). */
  alternatives: string[];
  words: TranscribedWord[];
  /** True when the adapter matched `expectedPhrases` fuzzy-wise. */
  matchedExpectedPhrase?: string;
  provenance: AiProvenance;
}

// --- Text to speech -------------------------------------------------------

export interface SynthesizeRequest {
  text: string;
  language: string;
  /** 0.5–1.25 — the platform never exposes faster than 1.25. */
  rate: number;
  pitch?: number;
  /** Preferred voice id, if the device exposes one. */
  voiceId?: string;
  /**
   * Ask the engine to emit per-word timings. Required for karaoke highlighting;
   * adapters that cannot provide them must return `wordTimings: []` and the UI
   * degrades to sentence-level highlighting.
   */
  returnWordTimings?: boolean;
}

export interface WordTiming {
  word: string;
  /** Character offset in `request.text` where this word starts. */
  charIndex: number;
  startMs: number;
  endMs: number;
}

export interface SynthesizeResult {
  /** Encoded audio (e.g. audio/mpeg). Empty when the caller should use the
   *  on-device SpeechSynthesis API instead. */
  audio: Uint8Array;
  mimeType: string;
  wordTimings: WordTiming[];
  durationMs: number;
  provenance: AiProvenance;
}

// --- Adapter surface -------------------------------------------------------

export interface AiAdapter {
  readonly id: AiProviderId;
  /** Capabilities this implementation can serve right now (allowing for
   *  missing keys or a dropped connection). */
  capabilities(): readonly AiCapability[];
  supports(capability: AiCapability): boolean;
  /** Whether the adapter can run with zero network access. */
  readonly offline: boolean;

  simplifyText(request: SimplifyTextRequest): Promise<SimplifyTextResult>;
  extractKeywords(request: ExtractKeywordsRequest): Promise<ExtractKeywordsResult>;
  transcribe(request: TranscribeRequest): Promise<TranscribeResult>;
  synthesize(request: SynthesizeRequest): Promise<SynthesizeResult>;
}

/** Error subclasses adapters throw so the HTTP layer can map status codes. */
export class AiError extends Error {
  /** Machine-readable code. The HTTP status mapping lives in `AI_ERROR_STATUS`. */
  readonly code: AiErrorCode;

  constructor(message: string, code: AiErrorCode, cause?: unknown) {
    super(message);
    this.name = 'AiError';
    this.code = code;
    // Assigned rather than declared as a parameter property: `Error.cause`
    // already exists, and re-declaring it needs `override`, which reads as if we
    // were replacing the base behaviour when we are only populating it.
    if (cause !== undefined) this.cause = cause;
  }
}

export type AiErrorCode =
  | 'offline'
  | 'timeout'
  | 'rate-limited'
  | 'unauthorized'
  | 'invalid-request'
  | 'unsupported-capability'
  | 'provider-error';

/** HTTP status mapping lives in one place so it cannot drift per route. */
export const AI_ERROR_STATUS: Readonly<Record<AiErrorCode, number>> = {
  offline: 503,
  timeout: 504,
  'rate-limited': 429,
  unauthorized: 502,
  'invalid-request': 400,
  'unsupported-capability': 501,
  'provider-error': 502,
};

/** Hard limits that keep a large paste from exhausting a school server. */
export const AI_LIMITS = {
  maxTextLength: 20_000,
  maxAudioBytes: 8 * 1024 * 1024,
  minGrade: 1,
  maxGrade: 12,
  maxKeywords: 40,
} as const;
