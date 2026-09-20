import { cx } from '@/lib/cx';

/**
 * Shared visual + hit-target styles for `TouchButton` and `TouchLink`.
 *
 * Extracted so a navigational action (a link) and an in-page action (a button)
 * cannot drift apart visually or in hit-target size. This is also why the app
 * never nests a link inside a button: both exist as siblings, styled identically,
 * and the correct element is used for each job.
 */

export type TouchVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type TouchSize = 'medium' | 'large';

export const TOUCH_VARIANT_CLASSES: Readonly<Record<TouchVariant, string>> = {
  // Token pairs only: every combination here is proven by the theme contrast
  // report, so no call site can introduce an unreadable button.
  primary: 'bg-accent text-on-accent border-transparent hover:brightness-110',
  secondary: 'bg-elevated text-ink border-line hover:bg-surface',
  ghost: 'bg-transparent text-ink border-transparent hover:bg-surface',
  danger: 'bg-transparent text-danger border-line hover:bg-surface',
};

export const TOUCH_SIZE_CLASSES: Readonly<Record<TouchSize, string>> = {
  medium: 'text-base px-4 py-2',
  large: 'text-lg px-6 py-3',
};

export interface TouchStyleOptions {
  variant?: TouchVariant;
  size?: TouchSize;
  block?: boolean;
  iconOnly?: boolean;
  className?: string;
}

export function touchClasses({
  variant = 'secondary',
  size = 'medium',
  block = false,
  iconOnly = false,
  className,
}: TouchStyleOptions = {}): string {
  return cx(
    // min 48px in both axes, rem-based so it grows with the learner's text scale.
    'sahaj-touch-target rounded-[var(--radius-control)] border-2 font-medium transition-colors',
    TOUCH_VARIANT_CLASSES[variant],
    TOUCH_SIZE_CLASSES[size],
    block && 'w-full',
    iconOnly && 'aspect-square px-0',
    className,
  );
}
