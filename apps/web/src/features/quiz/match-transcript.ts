import { normalizeForSpeech } from '@sahaj/shared/nlp';

/**
 * Tolerant matching between what a child said and the answer options.
 *
 * This is deliberately *recall-biased* (the STT contract calls for the same):
 * a wrong match sends a child into an unfair retry loop, while a missed match
 * just costs one gentle re-prompt. Rules, in order:
 *  1. normalise both sides the way the speech pipeline does (so "The Sun" and
 *     "the sun" and "sun." agree);
 *  2. exact containment either way ("sun" inside "the sun is bright");
 *  3. token overlap — every meaningful token of the shorter side appears in the
 *     other ("the moon" vs "moon the" — word order is often scrambled by STT).
 *
 * Nothing here is voice-only: the same helper judges typed answers, so a child
 * with an unusable microphone gets an identical experience from the keyboard.
 */

export function matchTranscriptToOptions(
  transcript: string,
  labels: readonly string[],
): { matchedIndex: number; matchedLabel: string | null } {
  const said = normalizeForSpeech(transcript);
  if (said.length === 0) return { matchedIndex: -1, matchedLabel: null };

  for (let index = 0; index < labels.length; index += 1) {
    const candidate = normalizeForSpeech(labels[index] ?? '');
    if (candidate.length === 0) continue;
    if (said === candidate || said.includes(candidate) || candidate.includes(said)) {
      return { matchedIndex: index, matchedLabel: labels[index] ?? null };
    }
  }

  const saidTokens = new Set(said.split(/\s+/).filter((token) => token.length > 1));
  let bestIndex = -1;
  let bestOverlap = 0;
  for (let index = 0; index < labels.length; index += 1) {
    const candidate = normalizeForSpeech(labels[index] ?? '');
    const candidateTokens = candidate.split(/\s+/).filter((token) => token.length > 1);
    if (candidateTokens.length === 0) continue;
    const overlap = candidateTokens.filter((token) => saidTokens.has(token)).length;
    if (overlap === candidateTokens.length && overlap > bestOverlap) {
      bestIndex = index;
      bestOverlap = overlap;
    }
  }
  return { matchedIndex: bestIndex, matchedLabel: bestIndex >= 0 ? labels[bestIndex] ?? null : null };
}
