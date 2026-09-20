import { applySettingsPatch, DEFAULT_SETTINGS, type AccessibilitySettings } from '@sahaj/shared/a11y';

import {
  applySettingsToElement,
  settingsCssVariables,
  toBootstrapSnapshot,
} from '@/features/a11y/apply-settings';
import { BOOTSTRAP_SCRIPT, BOOTSTRAP_STORAGE_KEY } from '@/features/a11y/bootstrap';

/**
 * Pre-hydration bootstrap.
 *
 * The inline script and the live settings engine are two implementations of the
 * same idea, which is exactly the kind of duplication that rots. These tests hold
 * them together: the numbers showing in the app and the numbers painted on the
 * first frame must be identical, or a learner sees their settings flicker on
 * every navigation.
 */

const CUSTOM_SETTINGS: AccessibilitySettings = applySettingsPatch(DEFAULT_SETTINGS, {
  fontSizePercent: 180,
  themeId: 'yellow-on-black',
  fontFamily: 'opendyslexic',
  lineHeight: 2.1,
  letterSpacingEm: 0.06,
  screenRuler: true,
  focusMode: true,
});

const root = document.documentElement;

function resetRoot(): void {
  root.removeAttribute('style');
  for (const attribute of ['data-theme', 'data-motion', 'data-focus-mode', 'data-screen-ruler']) {
    root.removeAttribute(attribute);
  }
}

function runBootstrapScript(): void {
  // The script is an IIFE that only touches `window` and `document`; both exist
  // in jsdom, so evaluating it here is a faithful test of what the browser does.
  new Function(BOOTSTRAP_SCRIPT)();
}

function readVariables(settings: AccessibilitySettings): Record<string, string> {
  const values: Record<string, string> = {};
  for (const name of Object.keys(settingsCssVariables(settings))) {
    values[name] = root.style.getPropertyValue(name);
  }
  return values;
}

/** Quotes and whitespace are serialised inconsistently; compare the meaning. */
function canonical(value: string): string {
  return value.replace(/["']/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function canonicalise(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, canonical(value)]));
}

describe('bootstrap script', () => {
  beforeEach(() => {
    resetRoot();
    window.localStorage.clear();
  });

  it('does nothing when there is no cached snapshot', () => {
    runBootstrapScript();
    expect(root.style.getPropertyValue('--sahaj-bg')).toBe('');
    expect(root.getAttribute('data-theme')).toBeNull();
  });

  it('restores every variable from the cached snapshot', () => {
    window.localStorage.setItem(
      BOOTSTRAP_STORAGE_KEY,
      JSON.stringify(toBootstrapSnapshot(CUSTOM_SETTINGS, false)),
    );

    runBootstrapScript();

    const expected = Object.fromEntries(
      Object.entries(settingsCssVariables(CUSTOM_SETTINGS)).map(([name, value]) => [name, canonical(value)]),
    );

    expect(canonicalise(readVariables(CUSTOM_SETTINGS))).toEqual(expected);
    expect(root.getAttribute('data-theme')).toBe('yellow-on-black');
    expect(root.getAttribute('data-focus-mode')).toBe('true');
    expect(root.getAttribute('data-screen-ruler')).toBe('true');
  });

  it('produces exactly the DOM state the live engine produces', () => {
    applySettingsToElement(root, CUSTOM_SETTINGS, { skipCacheWrite: true });
    const fromLiveEngine = canonicalise(readVariables(CUSTOM_SETTINGS));
    const liveThemeAttribute = root.getAttribute('data-theme');

    resetRoot();
    window.localStorage.setItem(
      BOOTSTRAP_STORAGE_KEY,
      JSON.stringify(toBootstrapSnapshot(CUSTOM_SETTINGS, false)),
    );
    runBootstrapScript();
    const fromScript = canonicalise(readVariables(CUSTOM_SETTINGS));

    expect(fromScript).toEqual(fromLiveEngine);
    expect(root.getAttribute('data-theme')).toBe(liveThemeAttribute);
  });

  it('ignores cache entries that are not --sahaj-* properties', () => {
    // A tampered cache must not be able to inject arbitrary CSS, such as a
    // `background-image: url(...)` that would phone home from a school tablet.
    window.localStorage.setItem(
      BOOTSTRAP_STORAGE_KEY,
      JSON.stringify({
        vars: {
          '--sahaj-bg': '#000000',
          'background-image': 'url(https://example.com/track.png)',
          position: 'fixed',
        },
        attributes: { theme: 'calm' },
      }),
    );

    runBootstrapScript();

    expect(root.style.getPropertyValue('--sahaj-bg')).toBe('#000000');
    expect(root.style.getPropertyValue('background-image')).toBe('');
    expect(root.style.getPropertyValue('position')).toBe('');
  });

  it('survives a corrupt snapshot without throwing', () => {
    window.localStorage.setItem(BOOTSTRAP_STORAGE_KEY, '{not json');
    expect(() => runBootstrapScript()).not.toThrow();

    window.localStorage.setItem(BOOTSTRAP_STORAGE_KEY, JSON.stringify({ vars: { '--sahaj-bg': 42 } }));
    expect(() => runBootstrapScript()).not.toThrow();
  });
});
