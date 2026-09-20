import Link from 'next/link';
import type { ComponentPropsWithRef, ReactNode } from 'react';

import { touchClasses, type TouchSize, type TouchVariant } from './touch-styles';

/**
 * The navigational counterpart to `TouchButton`.
 *
 * Same hit target, same token pairs, but rendered as an `<a>` so that it can be
 * opened in a new tab, copied, and announced as a link. Buttons and links that
 * look identical but behave differently are a real usability trap, which is why
 * both come from one style module and why nesting one inside the other is never
 * necessary.
 *
 * `data-no-emphasis` opts out of the global "underline every link" rule: a
 * button-shaped link does not need an underline to be recognisable, and an
 * underline through a filled button is visual noise.
 */
export interface TouchLinkProps extends Omit<ComponentPropsWithRef<typeof Link>, 'className'> {
  variant?: TouchVariant;
  size?: TouchSize;
  block?: boolean;
  className?: string;
  children: ReactNode;
}

export function TouchLink({
  variant = 'secondary',
  size = 'medium',
  block = false,
  className,
  children,
  ...rest
}: TouchLinkProps) {
  return (
    <Link
      {...rest}
      data-no-emphasis
      className={touchClasses({ variant, size, block, className })}
    >
      {children}
    </Link>
  );
}
