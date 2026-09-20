/**
 * Domain types for Modules 3–5.
 *
 * These are the contract between the service worker's offline queue, the API,
 * and the dashboards. Two rules are load-bearing:
 *
 * 1. **No PII in sync payloads.** A learner is identified by an opaque
 *    `learnerId` (UUID) everywhere except the `learners` table. Names, photos
 *    and disability diagnoses never travel through the queue, because a shared
 *    tablet in a government school is a public device.
 * 2. **Everything is idempotent.** Offline clients retry aggressively, so every
 *    record carries a client-generated `clientId` that the server treats as a
 *    natural key (INSERT ... ON CONFLICT DO NOTHING).
 */

import type { AccessibilitySettings } from '../a11y/settings';

// --- Assessment (Module 3) -------------------------------------------------

export const QUESTION_KINDS = [
  'visual-choice',
  'audio-prompt',
  'voice-answer',
  'picture-match',
  'sequence',
] as const;

export type QuestionKind = (typeof QUESTION_KINDS)[number];

export interface QuizOption {
  id: string;
  /** Text label — optional, because visual-first questions may be icon-only.
   *  An option with no label MUST supply `iconName` and `altText`. */
  label?: string;
  /** Key into the app's icon set. */
  iconName?: string;
  /** Required whenever the option conveys meaning without a text label. */
  altText?: string;
  isCorrect: boolean;
}

export interface QuizQuestion {
  id: string;
  /** Position within the quiz, 0-based. */
  index: number;
  kind: QuestionKind;
  /** Child-facing prompt. Always rendered AND announced via aria-live. */
  prompt: string;
  /** Optional audio asset URL for `audio-prompt` questions. */
  audioUrl?: string;
  /** Optional illustration. */
  imageUrl?: string;
  options: QuizOption[];
  /**
   * A gentle nudge revealed only on request (or after two attempts). Never a
   * different question — a nudge toward how to think about this one.
   */
  hint?: string;
  /** Concept tags, joined to the mastery tracker. */
  concepts: string[];
  /** Reading grade of the prompt, so we can flag questions that are too hard. */
  promptGrade?: number;
  /**
   * Deliberately NOT a countdown. Present only so the analytics layer can
   * compute pacing; nothing in the UI may display it as a limit.
   */
  suggestedPaceMs?: number;
}

export interface Quiz {
  id: string;
  lessonId: string;
  title: string;
  /** Instructions shown before the first question. */
  instructions: string;
  questions: QuizQuestion[];
  /** Only 'practice' | 'check-in' — there is no graded/exam mode by design. */
  mode: 'practice' | 'check-in';
}

export interface QuizResponseInput {
  questionId: string;
  /** Chosen option id, for choice questions. */
  optionId?: string;
  /** Transcript, for voice answers. */
  transcript?: string;
  /** 0–1, from the STT layer. Low confidence triggers a gentle re-prompt. */
  transcriptConfidence?: number;
  /** Milliseconds from prompt display to answer. Feeds adaptive difficulty. */
  responseLatencyMs: number;
  /** True when the learner asked for the prompt to be read again. */
  repeatedPrompt: boolean;
  /** True when a hint (or the answer read aloud a second time) was revealed. */
  hinted: boolean;
  /**
   * Whether the learner answered correctly, as judged on the device against the
   * question it already holds.
   *
   * The server re-derives this from the stored quiz whenever it can. It is
   * carried here so that a tablet which never sees the server again still
   * contributes to a learner's progress instead of losing a week of work.
   */
  correct?: boolean;
  /**
   * Concept tags copied from the question. Optional for the same reason as
   * `correct`: it is what makes offline mastery tracking possible before the
   * question bank itself is cached.
   */
  concepts?: readonly string[];
}

export interface QuizAttemptSubmission {
  /** Client-generated UUID — the idempotency key. */
  clientId: string;
  quizId: string;
  learnerId: string;
  /** ISO-8601, captured on the device at answer time (may be offline). */
  startedAt: string;
  completedAt: string;
  responses: QuizResponseInput[];
  /** Accessibility settings in force during the attempt; lets the analytics
   *  layer separate "hard question" from "learner had the ruler switched on". */
  settingsSnapshot?: Partial<AccessibilitySettings>;
  /** Device clock offset in ms, so server-side latency stats stay honest. */
  clientClockSkewMs?: number;
}

// --- Offline sync (Module 4) ----------------------------------------------

export const SYNC_ENTITY_TYPES = ['quiz-attempt', 'progress-event', 'settings-change'] as const;
export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number];

export interface SyncQueueItem<T = unknown> {
  clientId: string;
  entityType: SyncEntityType;
  /** Monotonic per-device counter; the server uses it to detect gaps. */
  sequence: number;
  createdAt: string;
  payload: T;
  /** Failed upload attempts, for exponential backoff. */
  attempts: number;
  lastAttemptAt?: string;
  /** Set when the server permanently rejected the item (4xx, not 409). */
  rejected?: { reason: string; at: string };
}

export interface SyncBatchRequest {
  deviceId: string;
  /** Highest contiguous sequence the client has durably stored. */
  cursor: number;
  items: SyncQueueItem[];
}

export interface SyncItemResult {
  clientId: string;
  status: 'accepted' | 'duplicate' | 'rejected';
  /** Human-readable, safe to show a teacher. */
  message?: string;
}

export interface SyncBatchResponse {
  results: SyncItemResult[];
  /** Sequence number the client may delete from its queue. */
  acknowledgedCursor: number;
  /** Server time, letting the client correct clock skew without NTP. */
  serverTime: string;
}

// --- Progress & analytics (Module 5) --------------------------------------

/**
 * The badge catalog, in one place, because the API computes badges and the web
 * renders them: two copies of this list *will* drift, and a badge the learner
 * earned but the UI cannot name is worse than no badge.
 */
export const BADGE_CATALOG: readonly { id: string; label: string; description: string }[] = [
  {
    id: 'first-steps',
    label: 'First steps',
    description: 'Finished a first practice round',
  },
  {
    id: 'five-days',
    label: 'Five good days',
    description: 'Did a little something on five different days',
  },
  {
    id: 'in-a-row',
    label: 'Three in a row',
    description: 'Got three answers right in a row',
  },
  {
    id: 'brave-reader',
    label: 'Brave reader',
    description: 'Kept practising for twenty rounds',
  },
  {
    id: 'voice-user',
    label: 'Used my voice',
    description: 'Answered a question by speaking',
  },
] as const;

export function badgeById(id: string): { id: string; label: string; description: string } | undefined {
  return BADGE_CATALOG.find((badge) => badge.id === id);
}

export interface ConceptMastery {
  concept: string;
  /** 0–1 exponential moving average of correctness. */
  mastery: number;
  /** Number of attempts contributing to `mastery`. */
  attempts: number;
  /** Direction over the last week: -1 declining, 0 flat, 1 improving. */
  trend: -1 | 0 | 1;
}

export interface ProgressSnapshot {
  learnerId: string;
  generatedAt: string;
  /** Streak in days of any learning activity. */
  streakDays: number;
  /** Total minutes of on-task reading/listening, device-measured. */
  minutesEngaged: number;
  /** Badge ids already awarded; never revoked (that is the whole point). */
  badges: string[];
  concepts: ConceptMastery[];
  /** Median response latency, ms — a pacing signal, not a score. */
  medianLatencyMs: number;
  /** Median STT confidence; below 0.55 flags an adaptation need, not a failure. */
  medianTranscriptConfidence: number;
}

export const INTERVENTION_REASONS = [
  'stalled-progress',
  'high-hint-dependence',
  'stt-misrecognition',
  'accessibility-mismatch',
  'long-absence',
] as const;

export type InterventionReason = (typeof INTERVENTION_REASONS)[number];

/**
 * A prompt for a *teacher*, never a label for a child. Every flag carries the
 * concrete evidence behind it so a teacher can judge it in seconds.
 */
export interface InterventionFlag {
  learnerId: string;
  reason: InterventionReason;
  /** 0–1 urgency, for sorting only. */
  severity: number;
  /** Plain-language explanation, e.g. "3 of 5 answers needed a re-prompt". */
  evidence: string;
  /** Concrete suggested action. */
  suggestedAction: string;
  detectedAt: string;
}

export interface ComprehensionHeatmapCell {
  lessonId: string;
  concept: string;
  /** 0–1 comprehension rate. */
  rate: number;
  sampleSize: number;
}

/**
 * Everything the teacher dashboard needs in one response, so a teacher on a 2G
 * connection makes one request, not four. Suppressing small samples is a
 * *display* rule and belongs to the client, which owns its own minimum.
 */
export interface TeacherOverview {
  generatedAt: string;
  heatmap: ComprehensionHeatmapCell[];
  /** Per-lesson speech-input quality; low confidence is an accessibility signal. */
  speech: { lessonId: string; voiceAnswers: number; medianTranscriptConfidence: number }[];
  /** Per-lesson pacing; medians, so one long think never skews the picture. */
  pacing: { lessonId: string; attempts: number; medianLatencyMs: number }[];
}

/** Learner record. Deliberately minimal — see the PII note at the top. */
export interface LearnerProfile {
  id: string;
  /** Only ever shown to the teacher who owns the class. */
  displayName: string;
  /** Class/grade level, not a diagnosis. */
  gradeLevel: number;
  preferredLanguage: string;
  /** School-assigned pseudonymous code used on printed worksheets. */
  rollCode: string;
  createdAt: string;
}
