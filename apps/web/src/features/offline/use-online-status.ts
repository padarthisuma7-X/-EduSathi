'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Network status.
 *
 * `navigator.onLine` is famously optimistic — it reports "online" for a captive
 * portal or a school proxy that accepts connections and returns nothing. It is
 * still the only synchronous signal available, so it is used for what it is
 * genuinely good at: telling a learner *why* sync is not happening and switching
 * the UI into its "your work is saved" mode. Real sync health is tracked per
 * request by the offline queue (Module 4).
 *
 * Implemented as an external store rather than effect + state because the network
 * state lives outside React: an effect-based version renders the wrong value once
 * and then corrects itself, which is exactly the flash of "Offline — your work is
 * saved" that undermines a learner's confidence on a working connection.
 */

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

/** Assume online for the server render: a false offline banner on a cold load is
 *  worse than a brief delay before the real state arrives. */
function getServerSnapshot(): boolean {
  return true;
}

export function useOnlineStatus(): boolean {
  // The reader is wrapped so `useSyncExternalStore` receives an inline function
  // (its identity check is on the argument itself) while still delegating to a
  // module-level snapshot that cannot return a fresh object each call.
  const read = useCallback(() => getSnapshot(), []);
  return useSyncExternalStore(subscribe, read, getServerSnapshot);
}
