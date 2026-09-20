import type { ComponentPropsWithRef, ReactNode } from 'react';

import { touchClasses, type TouchSize, type TouchVariant } from './touch-styles';

/**
 * The only button used for prominent actions in this app.
 *
 * Why a wrapper instead of plain Tailwind classes on every `<button>`:
 *  - **Touch target.** `min-block-size` / `min-inline-size` of 3rem (48px)
 *    satisfies WCAG 2.5.5 (AAA) and 2.5.8 (AA) *and* the practical needs of a
 *    six-year-old on a cracked school tablet. Centralising it means no call site
 *    can forget.
 *  - **Accessible name.** The `iconOnly` variant requires an `aria-label` at the
 *    type level, so an unlabelled icon button cannot be written by accident.
 *  - **Contrast.** Variants are restricted to token pairs the theme contrast
 *    report already proves, so "just this once" colour choices are impossible.
 *
 * Never put a `<Link>` inside this component — nested interactive elements are
 * invalid HTML and break keyboard and screen-reader use. Use `TouchLink` for
 * navigation instead.
 */

interface BaseProps extends Omit<ComponentPropsWithRef<'button'>, 'className'> {
  variant?: TouchVariant;
  size?: TouchSize;
  /** Fills the available inline space; used by full-width quiz answers. */
  block?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * An icon-only button must name itself. Encoding that as a discriminated union
 * turns a runtime accessibility bug into a compile error.
 */
export type TouchButtonProps =
  | (BaseProps & { iconOnly: true; 'aria-label': string })
  | (BaseProps & { iconOnly?: false });

export function TouchButton({
  variant = 'secondary',
  size = 'medium',
  block = false,
  iconOnly = false,
  className,
  children,
  type = 'button',
  ...rest
}: TouchButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={touchClasses({ variant, size, block, iconOnly, className })}
    >
      {children}
    </button>
  );
}
