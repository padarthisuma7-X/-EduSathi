'use client';

import { ModuleScaffold } from '@/components/layout/ModuleScaffold';
import {
  MIN_SAMPLE_FOR_RATE,
  isRateDisplayable,
  useTeacherDashboard,
} from '@/features/teacher/use-teacher-dashboard';

/**
 * Teacher dashboard (Module 5).
 *
 * Every number obeys the two rules this module was built around:
 *  1. **Evidence, not labels.** Flags carry the reason in plain words and a
 *     suggested action; nothing here ever reduces a child to a score.
 *  2. **Small samples are suppressed before display.** A rate built on one or
 *     two answers is shown as "too few answers yet", not as a percentage — a
 *     single bad morning must never look like a trend (see
 *     `MIN_SAMPLE_FOR_RATE`).
 *
 * The heatmap is a real `<table>` with `<th scope>` and a caption, so it is
 * navigable as a table, and the colour-free cells carry the numbers as text.
 */
export default function TeacherPage() {
  const { status, flags, overview } = useTeacherDashboard();

  return (
    <ModuleScaffold moduleId="progress">
      <section aria-labelledby="flags-heading" className="flex flex-col gap-3">
        <h2 id="flags-heading" className="text-2xl font-bold text-ink">
          Who may need help this week
        </h2>

        {status === 'loading' ? <p className="text-base text-ink">Loading…</p> : null}
        {status === 'offline' ? (
          <p className="text-base text-ink" role="status">
            The school server is not reachable. The dashboard will load when the network is back; saved
            learner work is not lost.
          </p>
        ) : null}
        {status === 'error' ? (
          <p className="text-base text-ink" role="status">
            The dashboard could not be loaded this time. Please try again.
          </p>
        ) : null}

        {status === 'ready' ? (
          flags.length === 0 ? (
            <p className="text-base text-ink">No flags this week. The class is finding its way.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {flags.map((flag) => (
                <li
                  key={`${flag.learnerId}-${flag.reason}`}
                  className="rounded-[var(--radius-card)] border-2 border-line bg-surface p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border-2 border-line bg-elevated px-3 py-1 text-sm font-semibold text-ink">
                      {flag.reason.replace(/-/g, ' ')}
                    </span>
                    <span className="text-sm text-ink-muted">
                      Learner {shortId(flag.learnerId)} · urgency {describeUrgency(flag.severity)}
                    </span>
                  </div>
                  <p className="mt-2 text-base text-ink">{flag.evidence}</p>
                  <p className="mt-1 text-base text-ink">
                    <span className="font-semibold">Suggested next step: </span>
                    {flag.suggestedAction}
                  </p>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </section>

      {status === 'ready' && overview ? <HeatmapTable overview={overview} /> : null}
    </ModuleScaffold>
  );
}

function HeatmapTable({ overview }: { overview: NonNullable<ReturnType<typeof useTeacherDashboard>['overview']> }) {
  if (overview.heatmap.length === 0) {
    return (
      <section aria-labelledby="heatmap-heading" className="rounded-[var(--radius-card)] border-2 border-line bg-surface p-4">
        <h2 id="heatmap-heading" className="text-xl font-semibold text-ink">
          Comprehension heatmap
        </h2>
        <p className="text-base text-ink">
          No answers have synced yet. Once practice rounds come in, this shows which concepts the class
          understood, lesson by lesson.
        </p>
      </section>
    );
  }

  const concepts = [...new Set(overview.heatmap.map((cell) => cell.concept))];
  const lessons = [...new Set(overview.heatmap.map((cell) => cell.lessonId))];
  const cellFor = (lessonId: string, concept: string) =>
    overview.heatmap.find((cell) => cell.lessonId === lessonId && cell.concept === concept);

  const speechByLesson = new Map(overview.speech.map((entry) => [entry.lessonId, entry]));
  const pacingByLesson = new Map(overview.pacing.map((entry) => [entry.lessonId, entry]));

  return (
    <section aria-labelledby="heatmap-heading" className="flex flex-col gap-4">
      <h2 id="heatmap-heading" className="text-2xl font-bold text-ink">
        Comprehension, lesson by lesson
      </h2>
      <table className="w-full border-collapse text-left text-base text-ink">
        <caption className="mb-2 text-sm text-ink-muted">
          Share of answers judged correct per concept. Rates appear once at least {MIN_SAMPLE_FOR_RATE}{' '}
          answers have synced; smaller samples say so rather than guessing.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="border-b-2 border-line p-2">
              Concept
            </th>
            {lessons.map((lessonId) => (
              <th scope="col" key={lessonId} className="border-b-2 border-line p-2">
                {lessonId}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {concepts.map((concept) => (
            <tr key={concept}>
              <th scope="row" className="border-b border-line p-2 font-semibold">
                {concept}
              </th>
              {lessons.map((lessonId) => {
                const cell = cellFor(lessonId, concept);
                if (!cell) {
                  return (
                    <td key={lessonId} className="border-b border-line p-2 text-ink-muted">
                      not practised yet
                    </td>
                  );
                }
                return (
                  <td key={lessonId} className="border-b border-line p-2">
                    {isRateDisplayable(cell.sampleSize) ? (
                      <>
                        {Math.round(cell.rate * 100)}%{' '}
                        <span className="text-sm text-ink-muted">({cell.sampleSize} answers)</span>
                      </>
                    ) : (
                      <span className="text-ink-muted">too few answers yet ({cell.sampleSize})</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {overview.speech.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold text-ink">Voice input quality</h3>
          <ul className="flex flex-col gap-2">
            {overview.speech.map((entry) => (
              <li key={entry.lessonId} className="rounded-[var(--radius-control)] border-2 border-line bg-elevated p-3 text-base text-ink">
                {entry.lessonId}: median recognition confidence{' '}
                {Math.round(entry.medianTranscriptConfidence * 100)}% across {entry.voiceAnswers}{' '}
                {entry.voiceAnswers === 1 ? 'voice answer' : 'voice answers'}. Below 55% usually means a
                microphone or settings problem, not a knowledge problem.
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {overview.pacing.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold text-ink">Time on task</h3>
          <ul className="flex flex-col gap-2">
            {overview.pacing.map((entry) => (
              <li key={entry.lessonId} className="rounded-[var(--radius-control)] border-2 border-line bg-elevated p-3 text-base text-ink">
                {entry.lessonId}: median {Math.round(entry.medianLatencyMs / 1000)}s per answer across{' '}
                {entry.attempts} {entry.attempts === 1 ? 'answer' : 'answers'}
                {speechByLesson.get(entry.lessonId) || pacingByLesson.get(entry.lessonId)
                  ? ''
                  : ' (no speech recorded)'}
                .
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function describeUrgency(severity: number): string {
  if (severity >= 0.8) return 'high';
  if (severity >= 0.5) return 'medium';
  return 'watch';
}

/** Shows a stable short code instead of the full opaque id in dense tables. */
function shortId(learnerId: string): string {
  return learnerId.slice(0, 8);
}
