import type { MetadataRoute } from 'next';

import { PLATFORM } from '@sahaj/shared';

/**
 * Web app manifest.
 *
 * Declared as a typed metadata route rather than a static file so the platform
 * identity comes from `@sahaj/shared` and cannot drift from the app title.
 *
 * Known gap for install-ability: Android requires at least one 192px and one
 * 512px **PNG** icon; an SVG-only manifest installs on desktop but not on the
 * cheap Android tablets this project targets. Drop the PNGs into
 * `apps/web/public/icons/` and add them below before shipping to schools.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${PLATFORM.name} — learning that adapts to every child`,
    short_name: PLATFORM.name,
    description:
      'Offline-first, accessible learning for children with learning difficulties in low-resource schools.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    lang: PLATFORM.defaultLocale,
    dir: 'ltr',
    // `categories` is advisory metadata; kept honest rather than promotional.
    categories: ['education', 'accessibility'],
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        // Maskable variant for Android adaptive-icon cropping.
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
