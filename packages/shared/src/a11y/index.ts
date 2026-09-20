/**
 * Accessibility kernel.
 *
 * `apps/web` imports from this subpath for anything that renders, and
 * `apps/api` imports it to validate what a device sends up. Keeping one copy
 * means a learner's stored settings can never be "valid" on one side only.
 */

export * from './contrast';
export * from './settings';
export * from './themes';
export * from './typography';
