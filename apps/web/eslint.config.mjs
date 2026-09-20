import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * ESLint, flat config.
 *
 * `eslint-config-next` v16 ships native flat configs, so the
 * `@eslint/eslintrc`/`FlatCompat` shim is not needed — and on ESLint 9 that shim
 * fails outright with a circular-structure error, which is how this was found.
 *
 * `core-web-vitals` is included for its `jsx-a11y` rules. An accessibility-first
 * codebase should fail CI on a missing accessible name rather than discover it in
 * a user test, so the rules that matter here are promoted from warning to error
 * below.
 */
const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'public/sw.js'],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-role': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/no-aria-hidden-on-focusable': 'error',
      'jsx-a11y/no-noninteractive-tabindex': 'error',
      'jsx-a11y/no-redundant-roles': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/tabindex-no-positive': 'error',
    },
  },
  {
    // Test files legitimately reach for non-null assertions when a query is
    // expected to succeed, and the assertion failure is the test failure.
    files: ['**/*.test.{ts,tsx}', 'src/test-utils/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
];

export default config;
