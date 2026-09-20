
/**
 * Device and learner identity, without any personal information.
 *
 * A shared school tablet is a *public* device, so identity here is deliberately
 * thin:
 *  - `deviceId` — a random UUID generated once and kept in localStorage. The
 *    sync server uses it for idempotency and cursors, nothing else.
 *  - `learnerId` — also an opaque UUID, written once per device. In the pilot a
 *    tablet belongs to one learner at a time; a multi-child picker is a login
 *    problem, and logins are out of scope until the auth work in
 *    docs/ARCHITECTURE.md lands. Names never enter either value.
 */

const DEVICE_ID_KEY = 'sahaj.deviceId';
const LEARNER_ID_KEY = 'sahaj.learnerId';

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Old Android WebViews: a UUID-shaped value from randomness we actually have
  // beats a hard crash on first open.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function getOrCreateId(storageKey: string): string {
  if (typeof window === 'undefined') return '';
  try {
    const existing = window.localStorage.getItem(storageKey);
    if (existing) return existing;
    const fresh = generateId();
    window.localStorage.setItem(storageKey, fresh);
    return fresh;
  } catch {
    // Private-browsing modes throw on localStorage access. A per-session id
    // keeps the app working; sync de-duplicates by clientId anyway.
    return generateId();
  }
}

export function getDeviceId(): string {
  return getOrCreateId(DEVICE_ID_KEY);
}

export function getLearnerId(): string {
  return getOrCreateId(LEARNER_ID_KEY);
}
