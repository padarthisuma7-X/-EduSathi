/**
 * Voice command grammar.
 *
 * Design constraints that come from the actual users:
 *  - Children with speech impairments (dysarthria, apraxia) and children with
 *    strong regional accents get *approximate* transcripts. Exact string
 *    matching would make voice control unusable for the learners who need it
 *    most, so every phrase is matched fuzzily.
 *  - Recognition runs on-device and offline where the browser supports it, so
 *    audio never has to leave a shared school tablet.
 *  - Every command has a keyboard equivalent with the same id, so nothing is
 *    voice-only (WCAG 2.1.1). The ids are intentionally the same tokens used by
 *    `AccessibilityCommandId`.
 */

import type { AccessibilityCommandId } from '../a11y/hotkeys';

/** Voice-only commands with no keyboard/settings equivalent. */
export type VoiceOnlyCommandId = 'speak-current' | 'stop-speaking' | 'help' | 'close-panel';

export type VoiceCommandId = AccessibilityCommandId | VoiceOnlyCommandId;

export interface VoiceCommandDefinition {
  id: VoiceCommandId;
  /** Phrases a learner is likely to say. Order does not matter. */
  phrases: readonly string[];
  /** Shown in the always-visible help list; written at a grade-2 reading level. */
  example: string;
}

export const VOICE_COMMANDS: readonly VoiceCommandDefinition[] = [
  {
    id: 'toggle-panel',
    phrases: ['open settings', 'open accessibility', 'accessibility settings', 'show settings', 'settings'],
    example: '“Open settings”',
  },
  {
    id: 'close-panel',
    phrases: ['close settings', 'hide settings', 'go back', 'close this'],
    example: '“Close settings”',
  },
  {
    id: 'toggle-ruler',
    phrases: ['reading ruler', 'show ruler', 'hide ruler', 'ruler'],
    example: '“Reading ruler”',
  },
  {
    id: 'toggle-focus',
    phrases: ['focus mode', 'quiet mode', 'hide the rest', 'just the lesson'],
    example: '“Focus mode”',
  },
  {
    id: 'toggle-speech',
    phrases: ['read aloud', 'read to me', 'stop reading', 'read automatically'],
    example: '“Read aloud”',
  },
  {
    id: 'speak-current',
    phrases: ['read this', 'read it', 'read again', 'say that again', 'repeat'],
    example: '“Read this”',
  },
  {
    id: 'stop-speaking',
    phrases: ['stop', 'stop talking', 'be quiet', 'silence', 'pause'],
    example: '“Stop”',
  },
  {
    id: 'cycle-theme',
    phrases: ['new colours', 'change colours', 'next theme', 'different colours', 'black and yellow'],
    example: '“Change colours”',
  },
  {
    id: 'increase-text',
    // Aliases are listed explicitly rather than relying on fuzzy matching:
    // "big text" differs from "bigger text" by enough edits that raising the
    // threshold to catch it would also start matching unrelated phrases. Listing
    // what children actually say is both safer and easier to maintain.
    phrases: [
      'bigger text',
      'big text',
      'big words',
      'make it bigger',
      'make text big',
      'bigger',
      'larger letters',
      'zoom in',
    ],
    example: '“Bigger text”',
  },
  {
    id: 'decrease-text',
    phrases: [
      'smaller text',
      'small text',
      'little text',
      'make it smaller',
      'smaller',
      'zoom out',
    ],
    example: '“Smaller text”',
  },
  {
    id: 'toggle-voice',
    phrases: [
      'voice off',
      'turn off voice',
      'stop listening',
      'voice on',
      'turn on voice',
      'voice control',
    ],
    example: '“Voice off”',
  },
  {
    id: 'reset-settings',
    phrases: ['reset', 'start over', 'put it back', 'default settings'],
    example: '“Reset”',
  },
  {
    id: 'help',
    phrases: ['help', 'what can i say', 'commands'],
    example: '“Help”',
  },
];

export interface VoiceCommandMatch {
  id: VoiceCommandId;
  /** The phrase that matched, for the on-screen "I heard …" confirmation. */
  matchedPhrase: string;
  /** 0–1. */
  score: number;
}

/** Lowercase, strip punctuation, collapse whitespace. Keeps letters/numbers. */
export function normalizeSpeech(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Levenshtein distance with a two-row buffer (O(min(a,b)) memory). Used on whole
 * phrases so that a mis-recognised word costs one edit, not a whole mismatch.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = new Array<number>(b.length + 1);
  let current = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) previous[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (previous[j] ?? 0) + 1, // deletion
        (current[j - 1] ?? 0) + 1, // insertion
        (previous[j - 1] ?? 0) + cost, // substitution
      );
    }
    const swap = previous;
    previous = current;
    current = swap;
  }
  return previous[b.length] ?? 0;
}

/** 1 for identical strings, 0 for completely different. */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - levenshteinDistance(a, b) / longest;
}

/**
 * Minimum similarity for a fuzzy match.
 *
 * 0.74 is deliberate and was tuned against real mis-transcriptions. It accepts
 * "reed this" for "read this" (0.89) while rejecting near-misses that a lower
 * threshold would wrongly act on: "bread" against "read this" scores 0.44, and
 * an unrelated sentence scores below 0.3.
 *
 * Common alternative phrasings are handled by listing them as aliases in
 * `VOICE_COMMANDS` rather than by loosening this number — an over-eager matcher
 * that fires on ordinary speech is far worse for a learner than a nudge asking
 * them to say it again.
 */
export const VOICE_MATCH_THRESHOLD = 0.74;

/**
 * Resolves a transcript to a command.
 *
 * Order of preference:
 *  1. exact phrase containment (a learner who says a full command sentence
 *     should never lose to a coincidental fuzzy match);
 *  2. fuzzy match above the threshold, longest phrase first so "bigger text"
 *     beats the shorter, weaker "text".
 */
export function parseVoiceCommand(
  transcript: string,
  options: { threshold?: number } = {},
): VoiceCommandMatch | null {
  const threshold = options.threshold ?? VOICE_MATCH_THRESHOLD;
  const normalized = normalizeSpeech(transcript);
  if (normalized.length === 0) return null;

  let best: VoiceCommandMatch | null = null;
  /**
   * Ranking, in two tiers:
   *   2.x — the transcript contains this phrase. Ranked by phrase length, so a
   *         more specific phrase wins: "stop reading" (read-aloud) beats the bare
   *         "stop" (stop speaking) that it also contains.
   *   1.x — a fuzzy match above the threshold, ranked by similarity.
   * Tier two always beats tier one: a learner who says a real command phrase
   * must never lose to a coincidental near-match elsewhere in the grammar.
   */
  let bestRank = -1;

  for (const command of VOICE_COMMANDS) {
    for (const phrase of command.phrases) {
      if (normalized === phrase || normalized.includes(phrase)) {
        const rank = 2 + phrase.length / 1000;
        if (rank > bestRank) {
          bestRank = rank;
          best = { id: command.id, matchedPhrase: phrase, score: 1 };
        }
        continue;
      }

      const score = similarity(normalized, phrase);
      if (score >= threshold) {
        const rank = 1 + score;
        if (rank > bestRank) {
          bestRank = rank;
          best = { id: command.id, matchedPhrase: phrase, score: Number(score.toFixed(3)) };
        }
      }
    }
  }

  return best;
}

/** Commands to show in the voice help list, ordered by usefulness. */
export const VOICE_HELP_COMMANDS: readonly VoiceCommandDefinition[] = [
  'speak-current',
  'stop-speaking',
  'increase-text',
  'decrease-text',
  'toggle-ruler',
  'cycle-theme',
  'toggle-focus',
  'toggle-panel',
  'help',
]
  .map((id) => VOICE_COMMANDS.find((command) => command.id === id))
  .filter((command): command is VoiceCommandDefinition => command !== undefined);
