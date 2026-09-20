'use client';

import { useSyncExternalStore } from 'react';

/**
 * Reads a browser capability that cannot be known during server rendering.
 *
 * The obvious implementation is `useState(false)` plus a `useEffect` that calls
 * `setState` with the real answer on mount. That works, but it is a cascading
 * render triggered from an effect body, which the React Compiler lint rules
 * (correctly) reject — and it renders a wrong value before the effect runs.
 *
 * `useSyncExternalStore` expresses the actual situation: the capability is
 * external state that never changes during a session. The subscribe function is
 * intentionally a no-op — nothing can change it — and the server snapshot is the
 * conservative `false`, so the app never claims support it has not verified.
 *
 * `read` must be a module-level function so the snapshot stays referentially
 * stable; an inline arrow would return a fresh value every render and loop.
 */
export function useBrowserCapability(read: () => boolean, serverValue = false): boolean {
  return useSyncExternalStore(NOOP_SUBSCRIBE, read, () => serverValue);
}

/** Capabilities are fixed for the lifetime of the page, so there is nothing to do. */
function NOOP_SUBSCRIBE(): () => void {
  return () => undefined;
}
