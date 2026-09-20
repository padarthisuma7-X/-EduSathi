'use client';

import { useEffect } from 'react';

/**
 * Service worker registration (Module 4 scaffold).
 *
 * Registration is intentionally conservative:
 *  - only in production, so a cached shell can never mask a dev-server change;
 *  - failures are silent, because a browser without service worker support
 *    (or a school proxy that strips them) must simply get the normal app;
 *  - no `skipWaiting()` is called from here. Forcing an update mid-lesson would
 *    swap the shell out from under a learner; the update is applied on the next
 *    full navigation instead. See `public/sw.js`.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* Offline mode degrades to a normal page load. */
      });
    };

    // Registering after `load` keeps the service worker from competing with the
    // first paint on a slow connection.
    if (document.readyState === 'complete') {
      register();
      return;
    }
    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
