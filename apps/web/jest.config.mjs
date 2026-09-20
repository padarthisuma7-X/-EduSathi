import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

/**
 * `next/jest` gives us the same SWC transform Next itself uses, so tests see the
 * code the browser will see (including the workspace TS in `@sahaj/shared`).
 */
const config = {
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
    '!src/app/**/layout.tsx',
    '!src/app/**/page.tsx',
  ],
  // Accessibility assertions are the point of this suite; surface every failure.
  verbose: true,
};

export default createJestConfig(config);
