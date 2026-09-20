import type { ReactNode } from 'react';

import { cx } from '@/lib/cx';

/**
 * A labelled group of related controls.
 *
 * `<fieldset>` + `<legend>` is used rather than a styled div with
 * `aria-labelledby` because screen readers announce the legend when entering a
 * group of radios, which is the difference between "Radio button, checked" and
 * "Colour theme, Yellow on black, radio button, checked".
 */

export interface FieldsetProps {
  legend: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function Fieldset({ legend, description, children, className }: FieldsetProps) {
  return (
    <fieldset className={cx('flex flex-col gap-3 border-0 p-0', className)}>
      <legend className="text-base font-semibold text-ink">{legend}</legend>
      {description ? <p className="text-sm text-ink-muted">{description}</p> : null}
      {children}
    </fieldset>
  );
}
