'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import type { SyncBatchRequest, SyncBatchResponse, SyncEntityType } from '@sahaj/shared/domain';

import { apiFetch } from '@/lib/api-client';
import { getDeviceId } from '@/lib/device';
import {
  createIndexedDbQueueStorage,
  createMemoryQueueStorage,
  hasIndexedDb,
  type QueueStorage,
} from './queue-storage';
import { SyncQueue, type SyncQueueSnapshot } from './sync-queue';

/**
 * SyncProvider (Module 4).
 *
 * Owns the single `SyncQueue` for the app and exposes it as context, so the quiz
 * runner enqueues through the same instance the offline page monitors. It also
 * owns *when* to flush:
 *  - when the browser reports `online` again (the main classroom moment: the
 *    router reboots and forty tablets all flush at once — server idempotency
 *    makes that safe, and backoff spreads the retries);
 *  - when the tab becomes visible again (returning to a docked tablet);
 *  - shortly after every enqueue (optimistic: if there is network, sync now).
 *
 * During server rendering there is no storage, so the context exposes an inert
 * queue with an empty snapshot — honest defaults, never fabricated state.
 */

const EMPTY_SNAPSHOT: SyncQueueSnapshot = {
  pending: 0,
  cursor: 0,
  deviceId: '',
  status: 'idle',
  lastSyncAt: null,
  lastProblem: null,
};

export interface SyncContextValue {
  /** Persists the payload locally, then tries an immediate flush. */
  enqueue: (entityType: SyncEntityType, payload: unknown) => Promise<void>;
  /** Forces a flush now, bypassing backoff (the "Sync now" button). */
  flushNow: () => void;
  snapshot: SyncQueueSnapshot;
}

/**
 * Exported for tests (which inject a fake queue) and for the rare consumer that
 * must render the provider twice. App code should use `useSync()` only.
 */
export const SyncContext = createContext<SyncContextValue | null>(null);

function defaultStorage(): QueueStorage {
  return hasIndexedDb() ? createIndexedDbQueueStorage() : createMemoryQueueStorage();
}

function transport(batch: SyncBatchRequest): Promise<SyncBatchResponse> {
  return apiFetch<SyncBatchResponse>('/api/sync/batch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(batch),
  });
}

export function SyncProvider({ children }: { children: ReactNode }) {
  // Built once per mount, on the client only; the server render receives the
  // inert default context, keeping hydration output identical to first paint.
  const queue = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new SyncQueue(defaultStorage(), transport);
  }, []);

  const subscribe = useCallback(
    (onChange: () => void) => queue?.subscribe(onChange) ?? (() => undefined),
    [queue],
  );
  const getCachedSnapshot = useCallback(() => queue?.getCachedSnapshot() ?? EMPTY_SNAPSHOT, [queue]);
  const snapshot = useSyncExternalStore(subscribe, getCachedSnapshot, () => EMPTY_SNAPSHOT);

  // Load config (deviceId, cursor, sequence) from storage, then try one flush —
  // the queue may hold answers from a previous session that never got out.
  useEffect(() => {
    if (!queue) return;
    let cancelled = false;
    void queue.configure(getDeviceId()).then(() => {
      if (!cancelled) void queue.flush();
    });
    return () => {
      cancelled = true;
    };
  }, [queue]);

  const flushWhenOnline = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine) void queue?.flush();
  }, [queue]);

  // Two moment-based triggers. Neither polls; both are cheap because flush
  // itself no-ops while one is already running or while backed off.
  useEffect(() => {
    if (!queue) return;
    window.addEventListener('online', flushWhenOnline);
    document.addEventListener('visibilitychange', flushWhenOnline);
    return () => {
      window.removeEventListener('online', flushWhenOnline);
      document.removeEventListener('visibilitychange', flushWhenOnline);
    };
  }, [queue, flushWhenOnline]);

  const enqueue = useCallback(
    async (entityType: SyncEntityType, payload: unknown) => {
      if (!queue) return;
      // Persist first: from this point on, the answer cannot be lost even if
      // the tab dies before the upload attempt.
      await queue.enqueue(entityType, payload);
      void queue.flush();
    },
    [queue],
  );

  const flushNow = useCallback(() => {
    void queue?.flush(true);
  }, [queue]);

  const value = useMemo<SyncContextValue>(
    () => ({ enqueue, flushNow, snapshot }),
    [enqueue, flushNow, snapshot],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) throw new Error('useSync must be used inside <SyncProvider>');
  return context;
}
