/**
 * @sahaj/shared — the single source of truth for cross-app types.
 *
 * Import subpaths (`@sahaj/shared/a11y`, `@sahaj/shared/ai`) from app code so
 * bundlers can tree-shake the accessibility kernel out of, say, an API image.
 */

export * from './a11y';
export * from './ai';
export * from './curriculum';
export * from './domain';
export * from './nlp';

/** Product identity, referenced by metadata, the manifest and the docs. */
export const PLATFORM = {
  name: 'Sahaj Shiksha',
  tagline: 'Learning that adapts to every child',
  /** Stable id used in the PWA manifest and cache names. Never change lightly. */
  slug: 'sahaj-shiksha',
  defaultLocale: 'en',
  supportedLocales: ['en', 'hi', 'kn', 'ta'] as const,
  /** Bumped with the cache name in the service worker to evict old assets. */
  cacheVersion: 'v1',
} as const;
