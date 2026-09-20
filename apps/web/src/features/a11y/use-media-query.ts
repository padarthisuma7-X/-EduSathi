'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * SSR-safe `matchMedia` subscription.
 *
 * `useSyncExternalStore` is used rather than an effect + state pair because the
 * media query is genuinely external state: an effect-based version renders the
 * wrong value once (the classic reduced-motion flash) before correcting itself.
 * The server snapshot is always `false`, which matches the documented default we
 * also encode in `globals.css`.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => undefined;
      }
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** True when the operating system asks for reduced motion. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/** True when the operating system asks for higher contrast. */
export function usePrefersMoreContrast(): boolean {
  return useMediaQuery('(prefers-contrast: more)');
}
