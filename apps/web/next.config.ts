import type { NextConfig } from 'next';

/**
 * Deployment notes for low-resource schools:
 *  - Assets are served with long-lived immutable caching because the same tablet
 *    may spend weeks offline and should never re-download a lesson it already has.
 *  - `transpilePackages` lets the web app consume `@sahaj/shared` TypeScript
 *    source directly, which keeps the a11y settings model in exactly one place.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Compiles the workspace package instead of requiring a prebuild step.
  transpilePackages: ['@sahaj/shared'],
  // Keeps the first paint fast on cheap Android tablets.
  experimental: {
    optimizePackageImports: ['@sahaj/shared'],
  },
  async headers() {
    return [
      {
        // The service worker must never be cached, or learners get stuck on an
        // old shell after a fix ships.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        // Self-hosted fonts, content-addressed by filename.
        source: '/fonts/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/audio/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800' }],
      },
    ];
  },
};

export default nextConfig;
