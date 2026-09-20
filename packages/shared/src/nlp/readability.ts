/**
 * Readability scoring — deterministic, dependency-free, runs anywhere.
 *
 * The offline fallback simplifier and the "did the AI actually help?" checks in
 * Module 2 both need a *reproducible* complexity number. Flesch–Kincaid is crude
 * but stable, auditable, and computable offline, which matters far more here
 * than linguistic sophistication: a school with no connectivity must still be
 * able to tell that a passage went from grade 9 to grade 4.
 *
 * Note for maintainers: these formulas are validated for English only. For other
 * languages rely on the provider adapter's own metric and treat this as a
 * word/sentence-length proxy.
 */

export interface ReadabilityMetrics {
  words: number;
  sentences: number;
  syllables: number;
  /** Average words per sentence. */
  avgWordsPerSentence: number;
  /** Average syllables per word. */
  avgSyllablesPerWord: number;
  /** Flesch reading ease, 0 (unreadable) – 100 (very easy). */
  fleschReadingEase: number;
  /** Flesch–Kincaid grade level. Negative scores are clamped to 0. */
  fleschKincaidGrade: number;
  /** Rough count of words longer than 7 characters. */
  longWordRatio: number;
}

/** Splits on sentence terminators, keeping abbreviations from over-splitting. */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z"'(\u2018\u201C])/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

export function splitWords(text: string): string[] {
  return text
    .split(/[^\p{L}\p{N}'\u2019-]+/u)
    .map((word) => word.replace(/^['\u2019-]+|['\u2019-]+$/g, ''))
    .filter((word) => word.length > 0);
}

/**
 * Syllable estimate: count vowel groups, then apply the usual English
 * corrections. Good to within a few percent on school-age text, and identical
 * on every machine — which is what we need for before/after comparisons.
 */
export function countSyllables(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (clean.length === 0) return 0;
  if (clean.length <= 3) return 1;

  const trimmed = clean
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '');

  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  const count = groups ? groups.length : 1;
  // Silent-final-e words we did not trim (e.g. "table") still need a floor.
  return Math.max(1, count);
}

export function analyzeReadability(text: string): ReadabilityMetrics {
  const sentences = splitSentences(text);
  const words = splitWords(text);
  const sentenceCount = Math.max(1, sentences.length);
  const wordCount = Math.max(1, words.length);

  let syllables = 0;
  let longWords = 0;
  for (const word of words) {
    syllables += countSyllables(word);
    if (word.length > 7) longWords += 1;
  }

  const avgWordsPerSentence = wordCount / sentenceCount;
  const avgSyllablesPerWord = syllables / wordCount;

  // Flesch reading ease and Flesch–Kincaid grade level (Kincaid et al. 1975).
  const fleschReadingEase = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;
  const fleschKincaidGrade = 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59;

  return {
    words: words.length,
    sentences: sentences.length,
    syllables,
    avgWordsPerSentence: round2(avgWordsPerSentence),
    avgSyllablesPerWord: round2(avgSyllablesPerWord),
    fleschReadingEase: round2(clampScore(fleschReadingEase)),
    fleschKincaidGrade: round2(Math.max(0, fleschKincaidGrade)),
    longWordRatio: round2(longWords / wordCount),
  };
}

/** Flattens line breaks so the TTS layer speaks whole sentences, not fragments. */
export function normalizeForSpeech(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
