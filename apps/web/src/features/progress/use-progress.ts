'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { ProgressSnapshot } from '@sahaj/shared/domain';

import { ApiError, apiFetch } from '@/lib/api-client';
import { getLearnerId } from '@/lib/device';
import { useSync } from '@/features/offline/SyncProvider';

/**
 * Learner progress fetcher (Module 5).
 *
 * The snapshot is server-derived from synced attempts, so on a school tablet the
 * honest sequence is: load → probably nothing yet → sync happens → data appears.
 * The hook re-fetches whenever the offline queue completes a flush, which is the
 * moment a snapshot could have changed — no polling, no stale data after sync.
 */

export type ProgressStatus = 'loading' | 'ready' | 'offline' | 'error';

export interface UseProgressReturn {
  status: ProgressStatus;
  snapshot: ProgressSnapshot | null;
  /** Idem: the opaque learner id this device maps to. */
  learnerId: string;
  refresh: () => void;
}

export function useProgress(): UseProgressReturn {
  const sync = useSync();
  const learnerIdRef = useRef<string>('');
  if (learnerIdRef.current === '' && typeof window !== 'undefined') {
    learnerIdRef.current = getLearnerId();
  }
  const learnerId = learnerIdRef.current;

  const [status, setStatus] = useState<ProgressStatus>('loading');
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(null);
  /** Bumped by `refresh` and by sync completions; the effect re-fetches on it. */
  const [fetchTick, setFetchTick] = useState(0);

  const refresh = useCallback(() => setFetchTick((tick) => tick + 1), []);

  // Re-fetch when a sync finishes — the only event that can change the snapshot.
  const lastSyncAt = sync.snapshot.lastSyncAt;
  useEffect(() => {
    if (lastSyncAt) refresh();
  }, [lastSyncAt, refresh]);

  useEffect(() => {
    let cancelled = false;
    if (!learnerId) return;
    setStatus('loading');
    apiFetch<ProgressSnapshot>(`/api/progress/learners/${encodeURIComponent(learnerId)}`)
      .then((data) => {
        if (cancelled) return;
        setSnapshot(data);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus(error instanceof ApiError && error.code === 'network' ? 'offline' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [learnerId, fetchTick]);

  return { status, snapshot, learnerId, refresh };
}

/** Words instead of percentages — the framing rule of the whole module. */
export function describeMastery(mastery: number): string {
  if (mastery < 0.4) return 'Just started';
  if (mastery < 0.75) return 'Getting it';
  return 'Confident';
}

export function describeTrend(trend: -1 | 0 | 1): string {
  switch (trend) {
    case 1:
      return 'getting stronger';
    case -1:
      return 'needs another look';
    default:
      return 'steady';
  }
}
