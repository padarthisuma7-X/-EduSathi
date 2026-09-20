/**
 * Typography tokens.
 *
 * Fonts are self-hosted / bundled rather than loaded from a CDN: government
 * schools frequently sit behind proxies that block third-party font hosts, and
 * a blocked font request must never delay the first readable paint.
 * See `apps/web/public/fonts/README.md` for the vendoring instructions.
 */

export const FONT_FAMILIES = [
  'inter',
  'lexend',
  'opendyslexic',
  'atkinson',
  'system',
] as const;

export type FontFamilyToken = (typeof FONT_FAMILIES)[number];

export const DEFAULT_FONT_FAMILY: FontFamilyToken = 'inter';

export interface FontFamilyDefinition {
  token: FontFamilyToken;
  /** Human label, shown in the control and announced by screen readers. */
  label: string;
  /** Why a learner might pick this — used in the settings help text. */
  rationale: string;
  /** Full CSS `font-family` stack. Always ends in a generic fallback. */
  stack: string;
  /** Whether letter-spacing should default higher for this face. */
  prefersWideTracking: boolean;
}

export const FONT_FAMILY_DEFINITIONS: Readonly<Record<FontFamilyToken, FontFamilyDefinition>> = {
  inter: {
    token: 'inter',
    label: 'Inter',
    rationale: 'Neutral default with tall x-height; good for most readers.',
    stack: "'InterVariable', 'Inter', 'Segoe UI', Roboto, system-ui, sans-serif",
    prefersWideTracking: false,
  },
  lexend: {
    token: 'lexend',
    label: 'Lexend',
    rationale: 'Designed to reduce visual stress and improve reading fluency.',
    stack: "'Lexend', 'InterVariable', 'Segoe UI', system-ui, sans-serif",
    prefersWideTracking: false,
  },
  opendyslexic: {
    token: 'opendyslexic',
    label: 'OpenDyslexic',
    rationale: 'Weighted letterforms that help prevent character rotation.',
    stack: "'OpenDyslexic', 'Lexend', 'Comic Sans MS', system-ui, sans-serif",
    prefersWideTracking: true,
  },
  atkinson: {
    token: 'atkinson',
    label: 'Atkinson Hyperlegible',
    rationale: 'Maximises distinction between easily confused characters.',
    stack: "'Atkinson Hyperlegible', 'InterVariable', system-ui, sans-serif",
    prefersWideTracking: true,
  },
  system: {
    token: 'system',
    label: 'Device default',
    rationale: 'Fastest to render and most familiar on the learner’s own device.',
    stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    prefersWideTracking: false,
  },
};

export function isFontFamilyToken(value: unknown): value is FontFamilyToken {
  return typeof value === 'string' && (FONT_FAMILIES as readonly string[]).includes(value);
}

export function fontStackFor(token: FontFamilyToken): string {
  return (FONT_FAMILY_DEFINITIONS[token] ?? FONT_FAMILY_DEFINITIONS[DEFAULT_FONT_FAMILY]).stack;
}

/**
 * Reading measure guidance. Long lines are the single most common cause of
 * line-skipping for dyslexic readers, so the lesson shell constrains width to
 * this many characters-ish (`ch`) and lets it grow with font size.
 */
export const READING_MEASURE_CH = { min: 40, max: 72, default: 62 } as const;
