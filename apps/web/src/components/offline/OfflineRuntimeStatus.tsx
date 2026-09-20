'use client';

import { PLATFORM } from '@sahaj/shared';

import { useSync } from '@/features/offline/SyncProvider';
import { useOnlineStatus } from '@/features/offline/use-online-status';
import { useBrowserCapability } from '@/lib/use-browser-capability';
import { TouchButton } from '@/components/ui/TouchButton';

/**
 * Reports the real state of the offline runtime.
 *
 * Deliberately factual: it reads the environment instead of claiming "works
 * offline", because that is the kind of claim a school discovers is false only
 * when the power goes out. The queue depth that Module 4 will add belongs here
 * too, next to the cursor the sync engine reports.
 *
 * Each fact is read through `useBrowserCapability` with a module-level reader, so
 * nothing is claimed until the browser has been asked, and no cascading render is
 * triggered to find out.
 */

function isServiceWorkerSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

function isServiceWorkerControlling(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.serviceWorker?.controller);
}

function isProductionBuild(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function OfflineRuntimeStatus() {
  const online = useOnlineStatus();
  const serviceWorkerSupported = useBrowserCapability(isServiceWorkerSupported);
  const controlled = useBrowserCapability(isServiceWorkerControlling);
  const registrationEnabled = useBrowserCapability(isProductionBuild);
  const sync = useSync();

  return (
    <section
      aria-labelledby="offline-status-heading"
      className="rounded-[var(--radius-card)] border-2 border-line bg-surface p-4"
    >
      <h2 id="offline-status-heading" className="mb-3 text-xl font-semibold text-ink">
        Right now on this device
      </h2>
      <dl className="grid gap-2 sm:grid-cols-2">
        <StatusRow
          term="Network"
          detail={online ? 'Connected' : 'Offline — anything you do is saved on the device'}
        />
        <StatusRow term="Offline mode" detail={describeOfflineMode(serviceWorkerSupported, controlled, registrationEnabled)} />
        <StatusRow term="Cache version" detail={PLATFORM.cacheVersion} />
        <StatusRow
          term="Saved answers waiting to sync"
          detail={describeQueue(sync.snapshot)}
        />
      </dl>
      {sync.snapshot.pending > 0 ? (
        <div className="mt-3">
          <TouchButton variant="secondary" onClick={sync.flushNow}>
            Try to sync now
          </TouchButton>
        </div>
      ) : null}
    </section>
  );
}

/** The queue state in one honest sentence, never a spinner. */
function describeQueue(snapshot: ReturnType<typeof useSync>['snapshot']): string {
  if (snapshot.pending === 0) return 'Nothing waiting — everything is synced';
  const waiting = `${snapshot.pending} ${snapshot.pending === 1 ? 'answer' : 'answers'} waiting`;
  if (!navigator.onLine) return `${waiting}; will send when the internet is back`;
  if (snapshot.status === 'syncing') return `${waiting}; sending now`;
  if (snapshot.status === 'error') return `${waiting}; the server is not reachable yet, and that is fine`;
  if (snapshot.status === 'rejected') return `${waiting}; some answers need a teacher's attention`;
  return `${waiting}; will send shortly`;
}

function describeOfflineMode(
  serviceWorkerSupported: boolean,
  controlled: boolean,
  registrationEnabled: boolean,
): string {
  if (!serviceWorkerSupported) return 'This browser does not support it, so pages need the network';
  if (controlled) return 'Active — pages and fonts are cached';
  if (registrationEnabled) return 'Turning on — reload once to finish';
  return 'Not enabled in development builds';
}

function StatusRow({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="rounded-[var(--radius-control)] border-2 border-line bg-elevated p-3">
      <dt className="text-sm font-semibold text-ink-muted">{term}</dt>
      <dd className="text-base text-ink">{detail}</dd>
    </div>
  );
}
