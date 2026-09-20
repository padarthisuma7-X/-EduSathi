'use client';

import { useOnlineStatus } from '@/features/offline/use-online-status';

/**
 * Network status indicator.
 *
 * Always states the situation in words. An icon or a colour change alone would be
 * invisible to a screen-reader user and to anyone with a colour vision
 * deficiency — and "am I losing my work?" is exactly the question this answers.
 *
 * `role="status"` (polite) rather than `role="alert"`: losing connectivity is not
 * an emergency here, because nothing is lost.
 */
export function OfflineStatusBadge() {
  const online = useOnlineStatus();

  return (
    <p
      role="status"
      className="inline-flex min-h-12 items-center gap-2 rounded-full border-2 border-line bg-elevated px-3 text-sm font-medium text-ink"
    >
      <span aria-hidden="true" className="text-lg leading-none">
        {online ? '↺' : '⚑'}
      </span>
      {online ? 'Connected' : 'Offline — your work is saved here'}
    </p>
  );
}
