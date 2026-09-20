/**
 * Visual filter themes.
 *
 * Each theme is a complete, self-consistent token set. Text/background pairs are
 * *not* hand-declared as compliant: `themeContrastReport()` recomputes the real
 * ratio from the colour values, and the Jest suite fails the build if a theme
 * drops below its claim. That makes WCAG compliance a property of the code
 * rather than a line in a spreadsheet.
 *
 * Contrast targets:
 *  - body text on background / surface: AAA (7:1)
 *  - muted text (captions, hints):     AAA (7:1)  — children rely on these
 *  - links / accent used as text:      AAA (7:1)
 *  - focus ring / borders:             3:1 (WCAG 1.4.11 non-text contrast)
 *
 * Success/danger inks only need AA (4.5:1) because colour is never the sole
 * signal — every feedback component also ships an icon and a text label.
 */

import { contrastRatio, type WcagLevel, wcagLevelFor } from './contrast';

export const THEME_IDS = [
  'calm',
  'yellow-on-black',
  'cream-on-dark-blue',
  'charcoal-on-light-cream',
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME_ID: ThemeId = 'calm';

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);
}

export interface ThemeTokens {
  /** Page background. */
  bg: string;
  /** Cards, quiz options, panels. */
  surface: string;
  /** Raised elements: toolbars, popovers, the settings drawer. */
  elevated: string;
  /** Default body text. */
  text: string;
  /** Secondary text: captions, progress hints, helper copy. */
  textMuted: string;
  /** Interactive accent (buttons, active states). */
  accent: string;
  /** Text/icon colour that sits *on* `accent`. */
  onAccent: string;
  /** Accent used specifically for hyperlinks. */
  link: string;
  /** 1px+ separators and control outlines. */
  border: string;
  /** Focus indicator colour — must be visible, never colour-only. */
  focus: string;
  /** Positive reinforcement (correct answer, streak, badge earned). */
  success: string;
  /** Gentle, non-alarming "let's try again" ink. */
  danger: string;
  /** Text highlight for karaoke playback. */
  highlightBg: string;
  /** Text colour on top of `highlightBg`. */
  highlightText: string;
  /** `::selection` colours. */
  selectionBg: string;
  selectionText: string;
}

export interface ThemeDefinition {
  id: ThemeId;
  /** Shown in the theme picker; also used as the accessible name. */
  label: string;
  /** One sentence explaining who it helps. */
  description: string;
  /** True when the theme is optimised for a dark room / light sensitivity. */
  isDark: boolean;
  /** Native `prefers-color-scheme` hint for the browser UI (address bar etc.). */
  colorScheme: 'light' | 'dark';
  tokens: ThemeTokens;
}

export const THEMES: Readonly<Record<ThemeId, ThemeDefinition>> = {
  calm: {
    id: 'calm',
    label: 'Calm (default)',
    description: 'Clean high-contrast light theme with a soft grey page tint.',
    isDark: false,
    colorScheme: 'light',
    tokens: {
      bg: '#FFFFFF',
      surface: '#F4F6F8',
      elevated: '#FFFFFF',
      text: '#1A1A1A',
      textMuted: '#4A4A4A',
      accent: '#0B4F9E',
      onAccent: '#FFFFFF',
      link: '#0B4F9E',
      border: '#6B7280',
      focus: '#A30000',
      success: '#145C30',
      danger: '#9B1C1C',
      highlightBg: '#FFF2A8',
      highlightText: '#1A1A1A',
      selectionBg: '#0B4F9E',
      selectionText: '#FFFFFF',
    },
  },
  'yellow-on-black': {
    id: 'yellow-on-black',
    label: 'Yellow on black',
    description: 'Maximum light-on-dark contrast; the classic low-vision palette.',
    isDark: true,
    colorScheme: 'dark',
    tokens: {
      bg: '#000000',
      surface: '#121212',
      elevated: '#1C1C1C',
      text: '#FFE81A',
      textMuted: '#D4B84A',
      accent: '#FFE81A',
      onAccent: '#000000',
      link: '#FFE81A',
      border: '#6B6B6B',
      focus: '#1B9CFF',
      success: '#7BE495',
      danger: '#FF9A9A',
      highlightBg: '#FFE81A',
      highlightText: '#000000',
      selectionBg: '#FFE81A',
      selectionText: '#000000',
    },
  },
  'cream-on-dark-blue': {
    id: 'cream-on-dark-blue',
    label: 'Cream on dark blue',
    description: 'Warm text on a deep navy field — easier on tired or astigmatic eyes.',
    isDark: true,
    colorScheme: 'dark',
    tokens: {
      bg: '#0B1A33',
      surface: '#14243F',
      elevated: '#1C2E4D',
      text: '#F5EFE0',
      textMuted: '#BFC7D6',
      accent: '#FFC24B',
      onAccent: '#0B1A33',
      link: '#FFC24B',
      border: '#5B7099',
      focus: '#7FD1FF',
      success: '#7BE495',
      danger: '#FFB3B3',
      highlightBg: '#FFC24B',
      highlightText: '#0B1A33',
      selectionBg: '#FFC24B',
      selectionText: '#0B1A33',
    },
  },
  'charcoal-on-light-cream': {
    id: 'charcoal-on-light-cream',
    label: 'Charcoal on light cream',
    description: 'Reduces glare from a white page without losing contrast.',
    isDark: false,
    colorScheme: 'light',
    tokens: {
      bg: '#FBF3E4',
      surface: '#F3E8D5',
      elevated: '#FFFFFF',
      text: '#2B2B2B',
      textMuted: '#4A4B4F',
      accent: '#7A2E00',
      onAccent: '#FBF3E4',
      link: '#7A2E00',
      border: '#8A7C63',
      focus: '#1B4FA0',
      success: '#145C30',
      danger: '#9B1C1C',
      highlightBg: '#FFE08A',
      highlightText: '#2B2B2B',
      selectionBg: '#7A2E00',
      selectionText: '#FBF3E4',
    },
  },
};

export function getTheme(id: ThemeId): ThemeDefinition {
  return THEMES[id] ?? THEMES[DEFAULT_THEME_ID];
}

export const THEME_LIST: readonly ThemeDefinition[] = THEME_IDS.map((id) => THEMES[id]);

/**
 * Maps theme tokens onto CSS custom property names. The web app sets these on
 * `:root`; everything else styles against the variables so a new theme needs no
 * component changes.
 */
export function themeCssVariables(theme: ThemeDefinition): Record<string, string> {
  const t = theme.tokens;
  return {
    '--sahaj-bg': t.bg,
    '--sahaj-surface': t.surface,
    '--sahaj-elevated': t.elevated,
    '--sahaj-text': t.text,
    '--sahaj-text-muted': t.textMuted,
    '--sahaj-accent': t.accent,
    '--sahaj-on-accent': t.onAccent,
    '--sahaj-link': t.link,
    '--sahaj-border': t.border,
    '--sahaj-focus': t.focus,
    '--sahaj-success': t.success,
    '--sahaj-danger': t.danger,
    '--sahaj-highlight-bg': t.highlightBg,
    '--sahaj-highlight-text': t.highlightText,
    '--sahaj-selection-bg': t.selectionBg,
    '--sahaj-selection-text': t.selectionText,
    '--sahaj-color-scheme': theme.colorScheme,
  };
}

export interface ContrastCheck {
  /** Stable id so failures are greppable in CI output. */
  pair: string;
  foreground: string;
  background: string;
  ratio: number;
  level: WcagLevel;
  /** The level this pair is contractually required to meet. */
  required: 'AA' | 'AAA' | 'AA-nontext';
  /** Minimum ratio implied by `required`. */
  requiredRatio: number;
  passes: boolean;
}

const REQUIRED_RATIO: Readonly<Record<ContrastCheck['required'], number>> = {
  AAA: 7,
  AA: 4.5,
  'AA-nontext': 3,
};

function check(
  pair: string,
  foreground: string,
  background: string,
  required: ContrastCheck['required'],
): ContrastCheck {
  const ratio = contrastRatio(foreground, background);
  return {
    pair,
    foreground,
    background,
    ratio,
    level: wcagLevelFor(ratio),
    required,
    requiredRatio: REQUIRED_RATIO[required],
    passes: ratio >= REQUIRED_RATIO[required],
  };
}

/** Recomputes every contractual contrast pair for one theme. */
export function themeContrastReport(id: ThemeId): ContrastCheck[] {
  const t = getTheme(id).tokens;
  return [
    check('text-on-bg', t.text, t.bg, 'AAA'),
    check('text-on-surface', t.text, t.surface, 'AAA'),
    check('text-on-elevated', t.text, t.elevated, 'AAA'),
    check('muted-on-bg', t.textMuted, t.bg, 'AAA'),
    check('muted-on-surface', t.textMuted, t.surface, 'AAA'),
    check('link-on-bg', t.link, t.bg, 'AAA'),
    check('link-on-surface', t.link, t.surface, 'AAA'),
    check('on-accent-on-accent', t.onAccent, t.accent, 'AAA'),
    check('highlight-text-on-highlight', t.highlightText, t.highlightBg, 'AAA'),
    check('selection-text-on-selection', t.selectionText, t.selectionBg, 'AAA'),
    check('border-on-bg', t.border, t.bg, 'AA-nontext'),
    check('focus-on-bg', t.focus, t.bg, 'AA-nontext'),
    check('focus-on-surface', t.focus, t.surface, 'AA-nontext'),
    check('success-on-bg', t.success, t.bg, 'AA'),
    check('danger-on-bg', t.danger, t.bg, 'AA'),
  ];
}

/** Every failing check across every theme — empty means the palette set is sound. */
export function allThemesContrastReport(): ContrastCheck[] {
  return THEME_IDS.flatMap((id) => themeContrastReport(id));
}

export function failingContrastChecks(): ContrastCheck[] {
  return allThemesContrastReport().filter((entry) => !entry.passes);
}
