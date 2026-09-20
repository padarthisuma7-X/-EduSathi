/**
 * In-memory store for sync and progress.
 *
 * This is deliberately a real, working implementation rather than a stub that
 * returns empty objects: the offline sync contract (idempotency, ordering,
 * acknowledged cursors) and the progress derivation are the parts most likely to
 * be wrong, and they can be fully exercised and unit-tested before Postgres is
 * wired in.
 *
 * Replacing it with Postgres is a drop-in swap behind the `SyncStore` interface.
 * The SQL it maps to is specified in `docs/DATA-MODEL.md`; the two invariants it
 * depends on are:
 *   - `UNIQUE (device_id, client_id)` gives idempotent replay for free;
 *   - `UNIQUE (device_id, sequence)` lets the server detect gaps and refuse to
 *     advance a cursor past missing work.
 *
 * Everything here is single-process. That is honest for a pilot: it is also why
 * the process must not be run with more than one replica until the Postgres
 * implementation lands (see docs/ARCHITECTURE.md).
 */

import {
  INTERVENTION_REASONS,
  badgeById,
  type ConceptMastery,
  type InterventionFlag,
  type ProgressSnapshot,
  type QuizAttemptSubmission,
  type SyncBatchRequest,
  type SyncBatchResponse,
  type SyncItemResult,
  type SyncQueueItem,
  type TeacherOverview,
} from '@sahaj/shared/domain';

/**
 * Badge rules. The ids, labels and meanings live in `BADGE_CATALOG` (shared),
 * so the API and the learner dashboard can never disagree about what a badge is
 * called; only the *conditions* live here.
 *
 * Badges are earned, never revoked — that is the whole point of them.
 */
const BADGE_RULES: readonly { id: string; test: (stats: AttemptStats) => boolean }[] = [
  { id: 'first-steps', test: (stats) => stats.attempts >= 1 },
  { id: 'five-days', test: (stats) => stats.activeDays >= 5 },
  { id: 'in-a-row', test: (stats) => stats.longestCorrectRun >= 3 },
  { id: 'brave-reader', test: (stats) => stats.attempts >= 20 },
  { id: 'voice-user', test: (stats) => stats.voiceAnswers >= 1 },
];

// Fail at boot, not at render time, if a rule names a badge the shared catalog
// does not know about — that is the drift the catalog exists to prevent.
for (const rule of BADGE_RULES) {
  if (!badgeById(rule.id)) {
    throw new Error(`Badge rule references unknown badge "${rule.id}" (missing from BADGE_CATALOG).`);
  }
}

export interface SyncStore {
  recordBatch(batch: SyncBatchRequest): SyncBatchResponse;
  getProgress(learnerId: string): ProgressSnapshot;
  listInterventionFlags(): InterventionFlag[];
  getTeacherOverview(): TeacherOverview;
  /** Diagnostics for the health endpoint. */
  stats(): { attempts: number; devices: number; learners: number };
}

interface StoredAttempt extends QuizAttemptSubmission {
  receivedAt: string;
}

interface AttemptStats {
  attempts: number;
  activeDays: number;
  longestCorrectRun: number;
  voiceAnswers: number;
  medianLatencyMs: number;
  medianTranscriptConfidence: number;
  repeatedPromptRate: number;
  hintRate: number;
}

export function createMemoryStore(now: () => Date = () => new Date()): SyncStore {
  /** deviceId → (clientId → item). Doubles as the idempotency index. */
  const deviceItems = new Map<string, Map<string, SyncQueueItem>>();
  /** deviceId → highest sequence acknowledged. */
  const deviceCursor = new Map<string, number>();
  /** Stable order of arrival, which is also replay order within a device. */
  const attempts: StoredAttempt[] = [];

  return {
    recordBatch(batch: SyncBatchRequest): SyncBatchResponse {
      const items = deviceItems.get(batch.deviceId) ?? new Map<string, SyncQueueItem>();
      deviceItems.set(batch.deviceId, items);

      const results: SyncItemResult[] = batch.items.map((item) => {
        const existing = items.get(item.clientId);
        if (existing) {
          // Idempotent replay: the device retried because it never saw our
          // response. Reporting `duplicate` (not `rejected`) is what lets the
          // client clear it from the queue.
          return { clientId: item.clientId, status: 'duplicate', message: 'Already received.' };
        }

        const validationError = validateItem(item);
        if (validationError) {
          return { clientId: item.clientId, status: 'rejected', message: validationError };
        }

        items.set(item.clientId, item);
        if (item.entityType === 'quiz-attempt') {
          attempts.push({ ...(item.payload as QuizAttemptSubmission), receivedAt: now().toISOString() });
        }
        return { clientId: item.clientId, status: 'accepted' };
      });

      // The cursor only advances contiguously. If sequence 7 is missing, sequence
      // 8 is stored but not acknowledged, so the device keeps retrying 7 and the
      // learner's answers cannot be silently reordered or lost.
      const accepted = new Set(
        results.filter((result) => result.status !== 'rejected').map((result) => result.clientId),
      );
      let cursor = Math.max(deviceCursor.get(batch.deviceId) ?? -1, batch.cursor);
      const bySequence = [...items.values()]
        .map((item, index) => ({ sequence: item.sequence, clientId: item.clientId, index }))
        .filter((entry) => accepted.has(entry.clientId))
        .sort((a, b) => a.sequence - b.sequence);

      for (const entry of bySequence) {
        if (entry.sequence === cursor + 1) cursor = entry.sequence;
        else if (entry.sequence > cursor + 1) break;
      }
      deviceCursor.set(batch.deviceId, cursor);

      return { results, acknowledgedCursor: cursor, serverTime: now().toISOString() };
    },

    getProgress(learnerId: string): ProgressSnapshot {
      const learnerAttempts = attempts.filter((attempt) => attempt.learnerId === learnerId);
      const stats = computeStats(learnerAttempts);

      return {
        learnerId,
        generatedAt: now().toISOString(),
        streakDays: stats.activeDays,
        minutesEngaged: Math.round(
          learnerAttempts.reduce(
            (total, attempt) => total + sumLatencyMinutes(attempt),
            0,
          ),
        ),
        badges: BADGE_RULES.filter((rule) => rule.test(stats)).map((rule) => rule.id),
        concepts: deriveConceptMastery(learnerAttempts),
        medianLatencyMs: stats.medianLatencyMs,
        medianTranscriptConfidence: stats.medianTranscriptConfidence,
      };
    },

    listInterventionFlags(): InterventionFlag[] {
      const byLearner = new Map<string, StoredAttempt[]>();
      for (const attempt of attempts) {
        const list = byLearner.get(attempt.learnerId) ?? [];
        list.push(attempt);
        byLearner.set(attempt.learnerId, list);
      }

      const flags: InterventionFlag[] = [];
      for (const [learnerId, learnerAttempts] of byLearner) {
        const stats = computeStats(learnerAttempts);
        const concepts = deriveConceptMastery(learnerAttempts);
        const struggling = concepts.filter((concept) => concept.attempts >= 3 && concept.mastery < 0.4);

        if (stats.hintRate >= 0.5 || stats.repeatedPromptRate >= 0.5) {
          flags.push({
            learnerId,
            reason: 'high-hint-dependence',
            severity: Math.min(1, stats.hintRate + stats.repeatedPromptRate),
            // Evidence is a sentence a teacher can act on, never a score.
            evidence: `${Math.round(stats.repeatedPromptRate * 100)}% of answers needed the question read again.`,
            suggestedAction:
              'Check the learner’s reading settings, and try the same questions with audio prompts only.',
            detectedAt: now().toISOString(),
          });
        }

        if (struggling.length >= 2) {
          flags.push({
            learnerId,
            reason: 'stalled-progress',
            severity: 0.6,
            evidence: `${struggling.length} concepts are still below 40% after at least three tries each (${struggling
              .map((concept) => concept.concept)
              .slice(0, 3)
              .join(', ')}).`,
            suggestedAction: 'Re-teach these concepts with a concrete object or picture before more practice.',
            detectedAt: now().toISOString(),
          });
        }

        if (stats.voiceAnswers > 0 && stats.medianTranscriptConfidence < 0.55) {
          flags.push({
            learnerId,
            reason: 'stt-misrecognition',
            severity: 0.5,
            evidence: `Voice answers are being recognised with ${Math.round(
              stats.medianTranscriptConfidence * 100,
            )}% confidence.`,
            suggestedAction:
              'This looks like an accessibility problem, not an error: try the keyboard input, and check the microphone.',
            detectedAt: now().toISOString(),
          });
        }
      }

      // Sorted by urgency for the teacher, with a stable tie-break.
      return flags.sort(
        (a, b) => b.severity - a.severity || a.learnerId.localeCompare(b.learnerId) || a.reason.localeCompare(b.reason),
      );
    },

    getTeacherOverview(): TeacherOverview {
      /** lessonId → concept → [correctness in attempt order]. */
      const byLessonConcept = new Map<string, Map<string, boolean[]>>();
      /** lessonId → [latency, transcript confidence] pairs. */
      const byLesson = new Map<string, { latencies: number[]; confidences: number[]; voiceAnswers: number }>();

      for (const attempt of attempts) {
        const lesson = byLesson.get(attempt.quizId) ?? { latencies: [], confidences: [], voiceAnswers: 0 };
        for (const response of attempt.responses) {
          lesson.latencies.push(response.responseLatencyMs);
          if (response.transcript !== undefined) {
            lesson.voiceAnswers += 1;
            if (typeof response.transcriptConfidence === 'number') {
              lesson.confidences.push(response.transcriptConfidence);
            }
          }

          // A response may carry several concept tags; it counts once per tag,
          // because the heatmap asks "how well is this concept understood".
          const concepts = response.concepts?.length ? response.concepts : [attempt.quizId];
          for (const concept of concepts) {
            const byConcept = byLessonConcept.get(attempt.quizId) ?? new Map<string, boolean[]>();
            byLessonConcept.set(attempt.quizId, byConcept);
            const history = byConcept.get(concept) ?? [];
            history.push(response.correct === true);
            byConcept.set(concept, history);
          }
        }
        byLesson.set(attempt.quizId, lesson);
      }

      const heatmap = [...byLessonConcept.entries()].flatMap(([lessonId, byConcept]) =>
        [...byConcept.entries()].map(([concept, history]) => ({
          lessonId,
          concept,
          rate: Number(average(history.map((correct) => (correct ? 1 : 0))).toFixed(3)),
          sampleSize: history.length,
        })),
      );

      const speech = [...byLesson.entries()]
        .filter(([, entry]) => entry.voiceAnswers > 0)
        .map(([lessonId, entry]) => ({
          lessonId,
          voiceAnswers: entry.voiceAnswers,
          medianTranscriptConfidence: Number(median(entry.confidences).toFixed(2)),
        }));

      const pacing = [...byLesson.entries()].map(([lessonId, entry]) => ({
        lessonId,
        attempts: entry.latencies.length,
        medianLatencyMs: Math.round(median(entry.latencies)),
      }));

      return { generatedAt: now().toISOString(), heatmap, speech, pacing };
    },

    stats() {
      const learners = new Set(attempts.map((attempt) => attempt.learnerId));
      return { attempts: attempts.length, devices: deviceItems.size, learners: learners.size };
    },
  };
}

/**
 * Rejects items that would corrupt progress data. The device is trusted for
 * *identity* (it generated the ids) but never for *plausibility*: a tablet with a
 * wrong clock would otherwise poison every latency statistic in the dashboard.
 */
function validateItem(item: SyncQueueItem): string | null {
  if (item.entityType !== 'quiz-attempt') return null;

  const payload = item.payload as Partial<QuizAttemptSubmission> | null;
  if (!payload || typeof payload !== 'object') return 'The attempt payload is missing.';
  if (typeof payload.learnerId !== 'string' || payload.learnerId.length === 0) {
    return 'The attempt has no learner id.';
  }
  if (!Array.isArray(payload.responses) || payload.responses.length === 0) {
    return 'The attempt has no answers.';
  }
  for (const response of payload.responses) {
    if (typeof response.responseLatencyMs !== 'number' || response.responseLatencyMs < 0) {
      return 'An answer has an invalid response time.';
    }
    // Ten minutes for one question means the tablet was put down, not that the
    // learner took ten minutes.
    if (response.responseLatencyMs > 600_000) {
      return 'An answer reports an implausible response time.';
    }
  }
  return null;
}

function computeStats(learnerAttempts: readonly StoredAttempt[]): AttemptStats {
  const latencies: number[] = [];
  const confidences: number[] = [];
  const days = new Set<string>();
  let repeatedPrompt = 0;
  let hinted = 0;
  let voiceAnswers = 0;
  let totalResponses = 0;
  let longestCorrectRun = 0;
  let currentRun = 0;

  for (const attempt of learnerAttempts) {
    days.add(attempt.completedAt.slice(0, 10));
    for (const response of attempt.responses) {
      totalResponses += 1;
      latencies.push(response.responseLatencyMs);
      if (response.repeatedPrompt) repeatedPrompt += 1;
      if (response.hinted) hinted += 1;
      if (response.optionId !== undefined) {
        // Correctness is taken from the device's own judgement for now; the server
        // becomes the authority once the question bank lives in SQL (see
        // docs/DATA-MODEL.md), at which point this is re-derived and ignored.
        const correct = response.correct === true;
        currentRun = correct ? currentRun + 1 : 0;
        longestCorrectRun = Math.max(longestCorrectRun, currentRun);
      }
      if (response.transcript !== undefined) {
        voiceAnswers += 1;
        if (typeof response.transcriptConfidence === 'number') {
          confidences.push(response.transcriptConfidence);
        }
      }
    }
  }

  return {
    attempts: learnerAttempts.length,
    activeDays: days.size,
    longestCorrectRun,
    voiceAnswers,
    medianLatencyMs: Math.round(median(latencies)),
    medianTranscriptConfidence: Number(median(confidences).toFixed(2)),
    repeatedPromptRate: totalResponses === 0 ? 0 : repeatedPrompt / totalResponses,
    hintRate: totalResponses === 0 ? 0 : hinted / totalResponses,
  };
}

/**
 * Per-concept mastery as an exponential moving average, weighted so the most
 * recent answers dominate. A plain average would never show improvement in a
 * learner who struggled for a month and then got it.
 */
function deriveConceptMastery(learnerAttempts: readonly StoredAttempt[]): ConceptMastery[] {
  const byConcept = new Map<string, { correct: number[]; attempts: number }>();

  for (const attempt of learnerAttempts) {
    for (const response of attempt.responses) {
      // Fall back to the quiz id when a device synced before concept tagging
      // existed, so older data still contributes to a trend.
      const concept = response.concepts?.[0] ?? attempt.quizId;
      const entry = byConcept.get(concept) ?? { correct: [], attempts: 0 };
      entry.correct.push(response.correct === true ? 1 : 0);
      entry.attempts += 1;
      byConcept.set(concept, entry);
    }
  }

  return [...byConcept.entries()].map(([concept, entry]) => {
    const alpha = 0.4;
    let ema = entry.correct[0] ?? 0;
    for (let index = 1; index < entry.correct.length; index += 1) {
      ema = alpha * entry.correct[index]! + (1 - alpha) * ema;
    }

    const recent = entry.correct.slice(-5);
    const older = entry.correct.slice(-10, -5);
    const recentAverage = average(recent);
    const olderAverage = older.length > 0 ? average(older) : recentAverage;
    const trend: ConceptMastery['trend'] =
      recentAverage > olderAverage + 0.1 ? 1 : recentAverage < olderAverage - 0.1 ? -1 : 0;

    return {
      concept,
      mastery: Number(ema.toFixed(3)),
      attempts: entry.attempts,
      trend,
    };
  });
}

function sumLatencyMinutes(attempt: StoredAttempt): number {
  return attempt.responses.reduce((total, response) => total + response.responseLatencyMs, 0) / 60_000;
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Exported so tests can assert the flag vocabulary cannot drift. */
export const SUPPORTED_INTERVENTION_REASONS = INTERVENTION_REASONS;
