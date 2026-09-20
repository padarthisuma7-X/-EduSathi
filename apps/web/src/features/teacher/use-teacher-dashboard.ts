'use client';

import { useCallback, useEffect, useState } from 'react';

import type { InterventionFlag, TeacherOverview } from '@sahaj/shared/domain';

import { ApiError, apiFetch } from '@/lib/api-client';

/**
 * Teacher dashboard fetcher (Module 5).
 *
 * Two requests in parallel — the flag list and the overview — because that is
 * the whole dashboard. Suppression of small samples happens *here* (display
 * rule), not on the server, so the server contract stays neutral and a future
 * consumer can choose its own minimum.
 */

export type TeacherStatus = 'loading' | 'ready' | 'offline' | 'error';

/** Below this, a rate is not shown as a rate at all — one answer is not a trend. */
export const MIN_SAMPLE_FOR_RATE = 3;

export interface TeacherDashboard {
  status: TeacherStatus;
  flags: InterventionFlag[];
  overview: TeacherOverview | null;
  refresh: () => void;
}

export function useTeacherDashboard(): TeacherDashboard {
  const [status, setStatus] = useState<TeacherStatus>('loading');
  const [flags, setFlags] = useState<InterventionFlag[]>([]);
  const [overview, setOverview] = useState<TeacherOverview | null>(null);
  const [fetchTick, setFetchTick] = useState(0);

  const refresh = useCallback(() => setFetchTick((tick) => tick + 1), []);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    Promise.all([
      apiFetch<{ flags: InterventionFlag[] }>('/api/progress/flags'),
      apiFetch<TeacherOverview>('/api/progress/overview'),
    ])
      .then(([flagData, overviewData]) => {
        if (cancelled) return;
        setFlags(flagData.flags);
        setOverview(overviewData);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus(error instanceof ApiError && error.code === 'network' ? 'offline' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [fetchTick]);

  return { status, flags, overview, refresh };
}

/** A cell displays a percentage only when enough children answered. */
export function isRateDisplayable(sampleSize: number): boolean {
  return sampleSize >= MIN_SAMPLE_FOR_RATE;
}
