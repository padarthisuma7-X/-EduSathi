import type { Metadata } from 'next';

import { ModuleScaffold } from '@/components/layout/ModuleScaffold';
import { OfflineRuntimeStatus } from '@/components/offline/OfflineRuntimeStatus';

export const metadata: Metadata = { title: 'Offline' };

/**
 * Offline runtime page (Module 4).
 *
 * The live status block reports what the browser is doing right now — network,
 * service worker, and the real depth of the IndexedDB upload queue. The plan
 * below it is deliberately specific about the constraints, because the
 * "just precache everything" approach fails immediately on the hardware this
 * project targets (8–16 GB tablets shared between several children).
 */
export default function OfflinePage() {
  return (
    <ModuleScaffold moduleId="offline-first">
      <OfflineRuntimeStatus />

      <section
        aria-labelledby="offline-plan-heading"
        className="flex flex-col gap-3 rounded-[var(--radius-card)] border-2 border-line bg-surface p-4"
      >
        <h2 id="offline-plan-heading" className="text-xl font-semibold text-ink">
          How this module works
        </h2>
        <ul className="flex list-disc flex-col gap-2 pl-6 text-base text-ink">
          <li>
            <strong>Precache the shell, not the library.</strong> The app shell, fonts and the module
            routes are cached on install; the rest of the library is cached on first open. A school tablet
            must never spend its storage on lessons that child will not reach.
          </li>
          <li>
            <strong>Budget the cache.</strong> Audio dominates size, so synthesised speech is cached
            per-sentence on demand with a least-recently-used cap, not per lesson.
          </li>
          <li>
            <strong>Queue, then replay in order.</strong> Answers go into IndexedDB with a per-device
            sequence number and a client-generated id, so a replay after three days offline cannot duplicate
            or reorder a learner’s work. The server only acknowledges a contiguous sequence, so a gap
            keeps the device retrying instead of silently skipping.
          </li>
          <li>
            <strong>Never block on the network.</strong> Submission is optimistic: the answer is recorded
            locally and the UI moves on immediately. Sync state is shown, never a spinner.
          </li>
          <li>
            <strong>Rejections are not retried.</strong> A server-side data rejection is dropped and
            surfaced honestly; only network failures stay in the queue, with exponential backoff.
          </li>
          <li>
            <strong>Update on next open, not mid-lesson.</strong> The service worker waits rather than
            swapping the shell out from under a child.
          </li>
        </ul>
      </section>
    </ModuleScaffold>
  );
}
