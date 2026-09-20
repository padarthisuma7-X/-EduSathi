'use client';

import { badgeById } from '@sahaj/shared/domain';

import { ModuleScaffold } from '@/components/layout/ModuleScaffold';
import { useSync } from '@/features/offline/SyncProvider';
import { describeMastery, describeTrend, useProgress } from '@/features/progress/use-progress';

/**
 * Learner progress page (Module 5).
 *
 * The framing rules are enforced by what this page chooses to render:
 *  - growth words, never percentages ("Getting it", not "62%");
 *  - badges that are never revoked, with their meaning spelled out;
 *  - the learner's own pace shown as information, never a target;
 *  - when there is no data yet — the normal state on a school tablet before its
 *    first sync — the page says exactly that and points at the offline queue
 *    instead of showing an empty dashboard that looks like failure.
 */
export default function ProgressPage() {
  const { status, snapshot } = useProgress();
  const sync = useSync();

  return (
    <ModuleScaffold moduleId="progress">
      <section aria-labelledby="your-progress-heading" className="flex flex-col gap-4">
        <h2 id="your-progress-heading" className="text-2xl font-bold text-ink">
          Your progress
        </h2>

        {status === 'loading' ? <p className="text-base text-ink">Looking for your progress…</p> : null}

        {status === 'offline' || status === 'error' ? (
          <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border-2 border-line bg-surface p-4">
            <p className="text-base text-ink">
              {status === 'offline'
                ? 'Your progress will appear after this tablet syncs. Everything you do is saved on the device.'
                : 'Progress could not be loaded this time. Your work is safe on this tablet.'}
            </p>
            <p className="text-base text-ink" role="status">
              {sync.snapshot.pending > 0
                ? `${sync.snapshot.pending} ${sync.snapshot.pending === 1 ? 'answer is' : 'answers are'} saved on this tablet, waiting for internet.`
                : 'Nothing is waiting to sync right now.'}
            </p>
            <div>
              <button
                type="button"
                onClick={sync.flushNow}
                className="inline-flex min-h-12 items-center rounded-[var(--radius-control)] border-2 border-line bg-elevated px-4 text-base font-semibold text-ink"
              >
                Try to sync now
              </button>
            </div>
          </div>
        ) : null}

        {status === 'ready' && snapshot ? (
          snapshot.concepts.length === 0 && snapshot.badges.length === 0 ? (
            <p className="text-base text-ink">
              Nothing to show yet. Finish a practice round and your growth will appear here.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <dl className="grid gap-3 sm:grid-cols-2">
                <StatCard
                  term="Days you did a little something"
                  detail={`${snapshot.streakDays} ${snapshot.streakDays === 1 ? 'day' : 'days'}`}
                />
                <StatCard
                  term="Your own pace"
                  detail={`About ${Math.max(1, Math.round(snapshot.medianLatencyMs / 1000))} seconds per answer — information for your teacher, not a target.`}
                />
              </dl>

              <div className="flex flex-col gap-2">
                <h3 className="text-lg font-semibold text-ink">Badges you keep</h3>
                {snapshot.badges.length === 0 ? (
                  <p className="text-base text-ink">
                    Your first badge is one practice round away.
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {snapshot.badges.map((id) => {
                      const badge = badgeById(id);
                      return (
                        <li
                          key={id}
                          className="rounded-[var(--radius-control)] border-2 border-line bg-elevated p-3 text-base text-ink"
                        >
                          <span aria-hidden="true" className="mr-2 text-xl">
                            🌟
                          </span>
                          <span className="font-semibold">{badge?.label ?? id}</span>
                          {badge?.description ? <span className="text-ink-muted"> — {badge.description}</span> : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="text-lg font-semibold text-ink">What you are learning</h3>
                <ul className="flex flex-col gap-2">
                  {snapshot.concepts.map((concept) => {
                    const label = describeMastery(concept.mastery);
                    const trend = describeTrend(concept.trend);
                    return (
                      <li
                        key={concept.concept}
                        className="rounded-[var(--radius-control)] border-2 border-line bg-elevated p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-base font-semibold text-ink">{concept.concept}</span>
                          <span className="text-base text-ink">
                            {label} · {trend}
                          </span>
                        </div>
                        {/* The bar is decoration; the words above carry the
                            meaning, so the info is never colour-only. */}
                        <div
                          role="meter"
                          aria-label={`${concept.concept}: ${label}`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(concept.mastery * 100)}
                          aria-valuetext={label}
                          className="mt-2 h-3 w-full overflow-hidden rounded-full border-2 border-line bg-surface"
                        >
                          <div
                            className="h-full bg-ink"
                            style={{ width: `${Math.round(concept.mastery * 100)}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )
        ) : null}
      </section>
    </ModuleScaffold>
  );
}

function StatCard({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="rounded-[var(--radius-control)] border-2 border-line bg-elevated p-3">
      <dt className="text-sm font-semibold text-ink-muted">{term}</dt>
      <dd className="text-base text-ink">{detail}</dd>
    </div>
  );
}
