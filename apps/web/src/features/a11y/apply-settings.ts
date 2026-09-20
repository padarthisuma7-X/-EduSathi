import {
  fontStackFor,
  getTheme,
  READING_MEASURE_CH,
  themeCssVariables,
  type AccessibilitySettings,
} from '@sahaj/shared/a11y';

import { writeBootstrapSnapshot, type BootstrapSnapshot } from './bootstrap';

/**
 * The one place that translates settings into DOM state.
 *
 * Both the live app (`AccessibilityProvider`) and the pre-hydration cache use
 * this, so there is exactly one definition of what a setting *means* visually.
 * Nothing else in the app should touch `documentElement.style`.
 */

export type ResolvedMotion = 'reduce' | 'allow';

/**
 * Resolves the tri-state `motion` setting against the OS preference.
 * `allow` is an explicit user override — a learner who wants animation can have
 * it even when the OS asks for less, because that is their stated preference.
 */
export function resolveMotion(
  preference: AccessibilitySettings['motion'],
  systemPrefersReducedMotion: boolean,
): ResolvedMotion {
  if (preference === 'reduce') return 'reduce';
  if (preference === 'allow') return 'allow';
  return systemPrefersReducedMotion ? 'reduce' : 'allow';
}

/** Typography and layout custom properties. */
export function typographyCssVariables(settings: AccessibilitySettings): Record<string, string> {
  return {
    '--sahaj-font-family': fontStackFor(settings.fontFamily),
    // Stored as a unitless number so `calc()` can multiply rem sizes by it.
    '--sahaj-font-scale': String(settings.fontSizePercent / 100),
    '--sahaj-line-height': String(settings.lineHeight),
    '--sahaj-letter-spacing': `${settings.letterSpacingEm}em`,
    '--sahaj-word-spacing': `${settings.wordSpacingEm}em`,
    '--sahaj-measure': `${READING_MEASURE_CH.default}ch`,
    '--sahaj-ruler-height': `${settings.rulerHeightRem}rem`,
  };
}

/** Data attributes that behave as coarse-grained styling switches. */
export function settingsDataAttributes(settings: AccessibilitySettings): Record<string, string> {
  return {
    theme: settings.themeId,
    'focus-mode': String(settings.focusMode),
    'screen-ruler': String(settings.screenRuler),
    'emphasize-links': String(settings.emphasizeLinks),
    'enhanced-focus': String(settings.enhancedFocusRing),
    'voice-control': String(settings.voiceControlEnabled),
    'plain-language': String(settings.plainLanguage),
    'karaoke-highlight': String(settings.karaokeHighlight),
  };
}

export function settingsCssVariables(settings: AccessibilitySettings): Record<string, string> {
  return {
    ...themeCssVariables(getTheme(settings.themeId)),
    ...typographyCssVariables(settings),
  };
}

export function toBootstrapSnapshot(
  settings: AccessibilitySettings,
  systemPrefersReducedMotion: boolean,
): BootstrapSnapshot {
  return {
    vars: settingsCssVariables(settings),
    attributes: {
      ...settingsDataAttributes(settings),
      // Cached so a reduced-motion learner gets no transition on the very first
      // painted frame, before the bundle can resolve the media query itself.
      motion: resolveMotion(settings.motion, systemPrefersReducedMotion),
    },
  };
}

export interface ApplySettingsOptions {
  /** Whether the OS asks for reduced motion right now. */
  systemPrefersReducedMotion?: boolean;
  /**
   * Skip writing the pre-hydration cache. Used during the first render, when we
   * are merely reflecting state we just read back from that cache anyway.
   */
  skipCacheWrite?: boolean;
}

/**
 * Applies settings to the document root.
 *
 * Called from an effect (never during render) because it performs DOM side
 * effects that would break React's rendering model and SSR.
 */
export function applySettingsToElement(
  root: HTMLElement,
  settings: AccessibilitySettings,
  options: ApplySettingsOptions = {},
): void {
  const { systemPrefersReducedMotion = false, skipCacheWrite = false } = options;

  const variables = settingsCssVariables(settings);
  for (const [name, value] of Object.entries(variables)) {
    root.style.setProperty(name, value);
  }

  const attributes = settingsDataAttributes(settings);
  root.setAttribute('data-motion', resolveMotion(settings.motion, systemPrefersReducedMotion));
  for (const [name, value] of Object.entries(attributes)) {
    root.setAttribute(`data-${name}`, value);
  }

  // Keeps the browser UI (address bar, form controls, scrollbars) in step with
  // a dark theme instead of flashing white on navigation.
  const themeMeta = root.ownerDocument?.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute('content', getTheme(settings.themeId).tokens.bg);
  }

  if (!skipCacheWrite) {
    writeBootstrapSnapshot(toBootstrapSnapshot(settings, systemPrefersReducedMotion));
  }
}
