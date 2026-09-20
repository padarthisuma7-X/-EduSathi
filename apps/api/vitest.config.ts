import { defineConfig } from 'vitest/config';

/**
 * API test configuration.
 *
 * Node environment, because these tests exercise real HTTP handling, headers and
 * base64 audio decoding — none of which behave the same in a DOM emulation.
 *
 * `@sahaj/shared` is a workspace package whose source is TypeScript, and its
 * types are part of the contract under test, so it is inlined rather than treated
 * as an opaque dependency.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    server: {
      deps: {
        inline: ['@sahaj/shared'],
      },
    },
  },
});
