/**
 * The accessibility settings model.
 *
 * Design rules that the rest of the platform depends on:
 *  1. Every value is *bounded*. A learner cannot accidentally destroy the layout
 *     with a slider, and corrupt localStorage can never produce an unusable UI.
 *  2. Coercion is total: `coerceSettings(anything)` always returns valid settings.
 *     This is the single trust boundary for reading persisted state.
 *  3. Numeric values are stored in plain, inspectable units (percent, em, ratio)
 *     so the CSS layer can interpolate them directly as custom properties.
 */

import {
  DEFAULT_FONT_FAMILY,
  FONT_FAMILIES,
  type FontFamilyToken,
} from './typography';
import { DEFAULT_THEME_ID, isThemeId, type ThemeId } from './themes';

/** Bump when the shape changes; `parseStoredSettings` migrates older payloads. */
export const SETTINGS_VERSION = 2;

/** localStorage key. Versioned payloads live under this single key. */
export const SETTINGS_STORAGE_KEY = 'sahaj.a11y.settings';

/** When true, `prefers-reduced-motion` decides motion; otherwise the user does. */
export const MOTION_PREFERENCES = ['system', 'reduce', 'allow'] as const;
export type MotionPreference = (typeof MOTION_PREFERENCES)[number];

/** How the reading ruler decides which line to highlight. */
export const RULER_MODES = ['pointer', 'focus', 'both'] as const;
export type RulerMode = (typeof RULER_MODES)[number];

export interface AccessibilitySettings {
  // --- Typography (Module 1: dyslexia controls) --------------------------
  fontFamily: FontFamilyToken;
  /** 100–250. Applied as a multiplier on the root font size. */
  fontSizePercent: number;
  /** 1.5–2.5 (WCAG 1.4.12 "Text Spacing" baseline is 1.5). */
  lineHeight: number;
  /** 0–0.2em letter tracking. WCAG 1.4.12 baseline is 0.12em. */
  letterSpacingEm: number;
  /** 0–0.5em word spacing. WCAG 1.4.12 baseline is 0.16em. */
  wordSpacingEm: number;

  // --- Colour & visual load (Module 1: visual filters) -------------------
  themeId: ThemeId;
  /** Zero-distraction reading mode: hides all chrome except the lesson. */
  focusMode: boolean;
  /** Draws a reading ruler / line mask over the content. */
  screenRuler: boolean;
  rulerMode: RulerMode;
  /** Ruler band height in `rem`, so it scales with font size. */
  rulerHeightRem: number;
  /** Underline links and give them a background so they are never colour-only. */
  emphasizeLinks: boolean;
  /** Strong, always-visible focus ring (WCAG 2.4.11/2.4.13 prepared). */
  enhancedFocusRing: boolean;
  motion: MotionPreference;

  // --- Speech (Module 1 multimodal / Module 2 audio sync) ----------------
  /** Master switch for the voice-driven interface. */
  voiceControlEnabled: boolean;
  /** Automatically read lesson text aloud when a passage opens. */
  speechAutoRead: boolean;
  /** 0.5–1.25 (deliberately slower than native default; children need it). */
  speechRate: number;
  /** 0–1 */
  speechVolume: number;
  /** Word-by-word highlight synced to the spoken word (karaoke mode). */
  karaokeHighlight: boolean;
  /** Request simplified-language variants of content by default. */
  plainLanguage: boolean;
}

export const DEFAULT_SETTINGS: AccessibilitySettings = {
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSizePercent: 100,
  lineHeight: 1.6,
  letterSpacingEm: 0.01,
  wordSpacingEm: 0.08,

  themeId: DEFAULT_THEME_ID,
  focusMode: false,
  screenRuler: false,
  rulerMode: 'both',
  rulerHeightRem: 2.2,
  emphasizeLinks: true,
  enhancedFocusRing: true,
  motion: 'system',

  voiceControlEnabled: false,
  speechAutoRead: false,
  speechRate: 0.9,
  speechVolume: 1,
  karaokeHighlight: true,
  plainLanguage: false,
};

/**
 * Inclusive numeric bounds. Exported so UI controls, tests, and the
 * server-side validator all agree on what "valid" means.
 */
export const SETTINGS_BOUNDS = {
  fontSizePercent: { min: 100, max: 250, step: 10 },
  lineHeight: { min: 1.5, max: 2.5, step: 0.1 },
  letterSpacingEm: { min: 0, max: 0.2, step: 0.01 },
  // Step of 0.04em so that both the default (0.08em) and the WCAG 1.4.12 text
  // spacing baseline (0.16em) land exactly on the grid. A 0.05em step would make
  // the default 0.08 unrepresentable, and coercion would then silently move every
  // learner's word spacing on first read — which is how this was found.
  wordSpacingEm: { min: 0, max: 0.5, step: 0.04 },
  rulerHeightRem: { min: 1.4, max: 4, step: 0.2 },
  speechRate: { min: 0.5, max: 1.25, step: 0.05 },
  speechVolume: { min: 0, max: 1, step: 0.1 },
} as const;

export type BoundedNumericKey = keyof typeof SETTINGS_BOUNDS;

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/** Clamp to bounds AND snap to the declared step, avoiding float dust. */
export function clampToBounds(key: BoundedNumericKey, value: number): number {
  const { min, max, step } = SETTINGS_BOUNDS[key];
  const snapped = Math.round(clamp(value, min, max) / step) * step;
  // Re-clamp after snapping, then round to 4dp to kill 0.30000000000000004.
  return Number(clamp(snapped, min, max).toFixed(4));
}

/**
 * Coerce arbitrary input into a valid settings object.
 * Unknown keys are dropped, invalid values fall back to the default rather than
 * throwing — a broken settings file should never lock a child out of a lesson.
 */
export function coerceSettings(input: unknown): AccessibilitySettings {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const out: AccessibilitySettings = { ...DEFAULT_SETTINGS };

  // Enumerations -----------------------------------------------------------
  if (isFontFamilyToken(raw['fontFamily'])) out.fontFamily = raw['fontFamily'];
  if (isThemeId(raw['themeId'])) out.themeId = raw['themeId'];
  if (isOneOf(MOTION_PREFERENCES, raw['motion'])) out.motion = raw['motion'];
  if (isOneOf(RULER_MODES, raw['rulerMode'])) out.rulerMode = raw['rulerMode'];

  // Booleans ---------------------------------------------------------------
  for (const key of BOOLEAN_KEYS) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key] as never;
  }

  // Bounded numerics -------------------------------------------------------
  for (const key of Object.keys(SETTINGS_BOUNDS) as BoundedNumericKey[]) {
    const value = raw[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = clampToBounds(key, value);
    } else if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
      // Sliders inside `<input>`-like controls hand back strings.
      out[key] = clampToBounds(key, Number(value));
    }
  }

  return out;
}

const BOOLEAN_KEYS = [
  'focusMode',
  'screenRuler',
  'emphasizeLinks',
  'enhancedFocusRing',
  'voiceControlEnabled',
  'speechAutoRead',
  'karaokeHighlight',
  'plainLanguage',
] as const satisfies readonly (keyof AccessibilitySettings)[];

function isOneOf<T extends readonly string[]>(allowed: T, value: unknown): value is T[number] {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

function isFontFamilyToken(value: unknown): value is FontFamilyToken {
  return isOneOf(FONT_FAMILIES as readonly string[], value);
}

export interface StoredSettingsEnvelope {
  version: number;
  settings: AccessibilitySettings;
}

/** Serialize for localStorage / IndexedDB. */
export function serializeSettings(settings: AccessibilitySettings): string {
  const envelope: StoredSettingsEnvelope = { version: SETTINGS_VERSION, settings };
  return JSON.stringify(envelope);
}

/**
 * Read persisted settings, tolerating every failure mode we have seen in the
 * field: absent value, truncated JSON (quota kill during write), and settings
 * written by an older schema version.
 */
export function parseStoredSettings(raw: string | null | undefined): AccessibilitySettings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && 'settings' in parsed) {
      return coerceSettings((parsed as StoredSettingsEnvelope).settings);
    }
    // Version 1 stored the settings object bare.
    return coerceSettings(parsed);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function isDefaultSettings(settings: AccessibilitySettings): boolean {
  return (Object.keys(DEFAULT_SETTINGS) as (keyof AccessibilitySettings)[]).every(
    (key) => settings[key] === DEFAULT_SETTINGS[key],
  );
}

export function countActiveAdjustments(settings: AccessibilitySettings): number {
  return (Object.keys(DEFAULT_SETTINGS) as (keyof AccessibilitySettings)[]).filter(
    (key) => settings[key] !== DEFAULT_SETTINGS[key],
  ).length;
}

/** Immutable patch application — the reducer's only mutation entry point. */
export function applySettingsPatch(
  settings: AccessibilitySettings,
  patch: Partial<AccessibilitySettings>,
): AccessibilitySettings {
  return coerceSettings({ ...settings, ...patch });
}

/**
 * Pre-baked starting points. Real learners land on one of these instead of
 * hand-tuning six sliders.
 */
export interface SettingsPreset {
  id: string;
  label: string;
  description: string;
  patch: Partial<AccessibilitySettings>;
}

export const SETTINGS_PRESETS: readonly SettingsPreset[] = [
  {
    id: 'dyslexia',
    label: 'Dyslexia friendly',
    description: 'OpenDyslexic, wide tracking and generous line height.',
    patch: {
      fontFamily: 'opendyslexic',
      lineHeight: 1.9,
      letterSpacingEm: 0.06,
      wordSpacingEm: 0.2,
      fontSizePercent: 120,
    },
  },
  {
    id: 'low-vision',
    label: 'Low vision',
    description: 'Yellow on black, large type, enhanced focus ring.',
    patch: {
      themeId: 'yellow-on-black',
      fontSizePercent: 180,
      lineHeight: 1.8,
      enhancedFocusRing: true,
      screenRuler: true,
    },
  },
  {
    id: 'adhd-focus',
    label: 'Focus (ADHD)',
    description: 'Zero-distraction layout with a reading ruler.',
    patch: {
      focusMode: true,
      screenRuler: true,
      rulerMode: 'both',
      themeId: 'charcoal-on-light-cream',
      speechAutoRead: true,
    },
  },
  {
    id: 'voice-first',
    label: 'Voice first',
    description: 'Hands-free navigation with slow, clear narration.',
    patch: {
      voiceControlEnabled: true,
      speechAutoRead: true,
      speechRate: 0.75,
      karaokeHighlight: true,
      fontSizePercent: 130,
    },
  },
  {
    id: 'motion-safe',
    label: 'Reduce motion',
    description: 'No transitions or parallax anywhere.',
    patch: { motion: 'reduce' },
  },
];
