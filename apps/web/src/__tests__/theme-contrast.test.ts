import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  allThemesContrastReport,
  formatRatio,
  themeContrastReport,
  themeCssVariables,
  THEMES,
  THEME_IDS,
} from '@sahaj/shared/a11y';

/**
 * WCAG contrast regression gate.
 *
 * This is the test that makes the platform's accessibility claims real: the
 * contrast numbers on the `/accessibility` page are computed by
 * `themeContrastReport`, the page renders those numbers, and this file fails the
 * build if any of them drops below the level that theme promises.
 *
 * The failure message is written to be useful on its own, because the person
 * reading it is usually adjusting a colour at 11pm before a demo.
 */

describe('theme contrast', () => {
  it('has a distinct palette for every theme id', () => {
    expect(new Set(THEME_IDS).size).toBe(THEME_IDS.length);
    for (const id of THEME_IDS) {
      expect(THEMES[id].tokens.bg).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it.each(THEME_IDS)('meets every contractual contrast pair in "%s"', (themeId) => {
    const failures = themeContrastReport(themeId).filter((check) => !check.passes);

    expect(
      failures.map(
        (failure) =>
          `${failure.pair}: ${formatRatio(failure.ratio)} is below the required ${failure.requiredRatio}:1 (${failure.required})`,
      ),
    ).toEqual([]);
  });

  it.each(THEME_IDS)('reaches at least 7:1 for body text in "%s"', (themeId) => {
    const bodyText = themeContrastReport(themeId).find((check) => check.pair === 'text-on-bg');
    expect(bodyText).toBeDefined();
    expect(bodyText!.ratio).toBeGreaterThanOrEqual(7);
    expect(bodyText!.level).toBe('AAA');
  });

  it('has no failures across the whole palette set', () => {
    const failures = allThemesContrastReport().filter((check) => !check.passes);
    expect(failures).toEqual([]);
    // A guard against the report silently becoming empty (e.g. a theme dropped
    // from the list), which would make the assertions above vacuously true.
    expect(allThemesContrastReport().length).toBeGreaterThanOrEqual(THEME_IDS.length * 15);
  });

  it('keeps the no-JavaScript CSS fallbacks in sync with the default theme', () => {
    /*
     * `globals.css` carries the "calm" palette in `:root` as the fallback used
     * when the pre-hydration snapshot is absent (first visit, cleared storage,
     * JavaScript disabled). It is a copy of the TypeScript tokens, so it can
     * drift — and a drifted fallback would show a learner the wrong colours on
     * their very first page load, which is the one moment we cannot recover from.
     */
    const css = readFileSync(path.join(__dirname, '..', 'app', 'globals.css'), 'utf8');
    const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('/* ------', css.indexOf(':root {')));
    const expected = themeCssVariables(THEMES.calm);

    const mismatches = Object.entries(expected)
      .filter(([name, value]) => !normalise(rootBlock).includes(`${name}:${normaliseValue(value)}`))
      .map(([name, value]) => `${name} should be ${value}`);

    expect(mismatches).toEqual([]);
  });
});

/** Collapses whitespace so the assertion does not depend on CSS formatting. */
function normalise(css: string): string {
  return css.replace(/\s+/g, '').toLowerCase();
}

function normaliseValue(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}
