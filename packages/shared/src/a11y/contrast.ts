/**
 * WCAG 2.1 contrast math.
 *
 * Kept dependency-free and pure so it can run in three places:
 *  - the theme module, to prove every shipped palette meets its claim;
 *  - the Jest a11y suite, as a regression gate;
 *  - the teacher-facing theme editor (roadmap), to warn before saving.
 *
 * @see https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
  /** 0–1, carried through so alpha-composited colours compare correctly. */
  a: number;
}

/** Parses `#rgb`, `#rrggbb`, and `#rrggbbaa`. Returns null for anything else. */
export function parseHexColor(input: string): Rgb | null {
  const value = input.trim();
  const match = /^#([0-9a-f]{3,8})$/i.exec(value);
  if (!match) return null;
  const hex = match[1]!;
  const expand = (chars: string): number => parseInt(chars.repeat(chars.length === 1 ? 2 : 1), 16);

  if (hex.length === 3 || hex.length === 4) {
    return {
      r: expand(hex[0]!),
      g: expand(hex[1]!),
      b: expand(hex[2]!),
      a: hex.length === 4 ? expand(hex[3]!) / 255 : 1,
    };
  }
  if (hex.length === 6 || hex.length === 8) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
    };
  }
  return null;
}

/** Composites a possibly-translucent colour over an opaque backdrop. */
export function compositeOver(foreground: Rgb, backdrop: Rgb): Rgb {
  if (foreground.a >= 1) return foreground;
  const mix = (f: number, b: number): number => Math.round(f * foreground.a + b * (1 - foreground.a));
  return { r: mix(foreground.r, backdrop.r), g: mix(foreground.g, backdrop.g), b: mix(foreground.b, backdrop.b), a: 1 };
}

function channelToLinear(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance. */
export function relativeLuminance(color: Rgb): number {
  return (
    0.2126 * channelToLinear(color.r) +
    0.7152 * channelToLinear(color.g) +
    0.0722 * channelToLinear(color.b)
  );
}

/**
 * Contrast ratio between two colours, 1–21.
 * Translucent foregrounds are composited over the backdrop first so that
 * `rgba(0,0,0,0.6)` on white is judged as the grey it visually is.
 */
export function contrastRatio(foreground: string | Rgb, background: string | Rgb): number {
  const fg = typeof foreground === 'string' ? parseHexColor(foreground) : foreground;
  const bg = typeof background === 'string' ? parseHexColor(background) : background;
  if (!fg || !bg) return 1;

  const opaqueBg = bg.a >= 1 ? bg : compositeOver(bg, { r: 255, g: 255, b: 255, a: 1 });
  const opaqueFg = compositeOver(fg, opaqueBg);

  const l1 = relativeLuminance(opaqueFg);
  const l2 = relativeLuminance(opaqueBg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export type WcagLevel = 'AAA' | 'AA' | 'AA-large' | 'fail';

/**
 * Grades a ratio. `large` follows WCAG's definition: >=24px, or >=18.66px bold.
 * Our themes target AAA for body text so that AA is guaranteed with headroom.
 */
export function wcagLevelFor(ratio: number, options: { large?: boolean } = {}): WcagLevel {
  const large = options.large ?? false;
  if (ratio >= (large ? 4.5 : 7)) return 'AAA';
  if (ratio >= (large ? 3 : 4.5)) return 'AA';
  return 'fail';
}

export function meetsWcag(ratio: number, level: 'AA' | 'AAA', options: { large?: boolean } = {}): boolean {
  const threshold = level === 'AAA' ? (options.large ? 4.5 : 7) : options.large ? 3 : 4.5;
  return ratio >= threshold;
}

/** Rounds to 2dp for display; never use the rounded value for decisions. */
export function formatRatio(ratio: number): string {
  return `${Math.round(ratio * 100) / 100}:1`;
}

/**
 * Picks whichever of two candidate ink colours reads better on `background`,
 * used by the token layer to keep accent-on-accent chips legible.
 */
export function pickReadableInk(background: string, candidates: readonly string[]): string {
  let best = candidates[0] ?? '#000000';
  let bestRatio = 0;
  for (const candidate of candidates) {
    const ratio = contrastRatio(candidate, background);
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
  }
  return best;
}
