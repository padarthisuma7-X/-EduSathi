import axe, { type AxeResults, type RunOptions } from 'axe-core';

/**
 * Automated accessibility assertions.
 *
 * `axe-core` is called directly rather than through a convenience wrapper for a
 * specific test runner: the runner's matcher API has changed shape twice in the
 * last few major versions, and a dependency that breaks the whole suite on an
 * unrelated upgrade is a poor trade for saving fifteen lines.
 *
 * Rule configuration is deliberate:
 *  - `color-contrast` is disabled because jsdom performs no layout, so axe cannot
 *    compute a background colour and always returns "incomplete". Contrast is
 *    verified numerically instead, in `theme-contrast.test.ts`, from the same
 *    token values the app ships — a stronger check than axe could make here.
 *  - `region` is enabled: every piece of content must sit inside a landmark, and
 *    that is easy to break when adding a new page shell.
 */

const DEFAULT_OPTIONS: RunOptions = {
  rules: {
    'color-contrast': { enabled: false },
  },
};

export async function runAxe(container: Element, options: RunOptions = {}): Promise<AxeResults> {
  return axe.run(container, {
    ...DEFAULT_OPTIONS,
    rules: { ...DEFAULT_OPTIONS.rules, ...options.rules },
  });
}

/** Violations rendered as a readable list, so a failure names the element. */
export function formatViolations(results: AxeResults): string {
  if (results.violations.length === 0) return '';
  return results.violations
    .map((violation) => {
      const targets = violation.nodes
        .flatMap((node) => node.target.map((target) => String(target)))
        .join('\n      ');
      return [
        `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help}`,
        `    help: ${violation.helpUrl}`,
        `    at:\n      ${targets}`,
      ].join('\n');
    })
    .join('\n\n');
}

/**
 * Asserts there are no accessibility violations in `container`.
 *
 * `incomplete` results are intentionally not failures: they are axe's way of
 * saying "I could not tell", and treating them as errors trains a team to
 * disable rules instead of reading them. They are returned so a test that cares
 * can inspect them.
 */
export async function expectNoA11yViolations(container: Element): Promise<AxeResults> {
  const results = await runAxe(container);
  const report = formatViolations(results);
  if (report.length > 0) {
    throw new Error(`Found ${results.violations.length} accessibility violation(s):\n\n${report}`);
  }
  return results;
}
