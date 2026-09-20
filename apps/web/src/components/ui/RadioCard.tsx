'use client';

import { useId, type ReactNode } from 'react';

import { cx } from '@/lib/cx';

/**
 * A radio option presented as a large card.
 *
 * Layout note: the `<input>` is *not* wrapped by the `<label>`. Nesting would
 * make the input's accessible name the whole card's text, so a screen reader
 * would read the option's description as part of its name every time the
 * learner arrows through the group. Instead the label names the input and the
 * description is joined through `aria-describedby`, which browsers announce
 * separately and only once.
 */

export interface RadioCardProps {
  name: string;
  value: string;
  checked: boolean;
  onSelect: (value: string) => void;
  label: string;
  description?: string;
  /** Miniature preview, e.g. a theme swatch strip. */
  preview?: ReactNode;
  /** Extra metadata, e.g. the measured contrast ratio. */
  badge?: ReactNode;
}

export function RadioCard({
  name,
  value,
  checked,
  onSelect,
  label,
  description,
  preview,
  badge,
}: RadioCardProps) {
  const id = useId();
  const descriptionId = `${id}-description`;

  return (
    <div
      className={cx(
        'flex min-h-12 items-start gap-3 rounded-[var(--radius-control)] border-2 p-3',
        checked ? 'border-accent bg-surface' : 'border-line bg-elevated',
      )}
    >
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        aria-describedby={description ? descriptionId : undefined}
        // 32px visual control inside a 48px row: the row itself is the target,
        // which is what the 2.5.5 requirement is really about.
        className="mt-1 h-8 w-8 shrink-0 accent-[var(--sahaj-accent)]"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <label htmlFor={id} className="cursor-pointer text-base font-medium text-ink">
            {label}
          </label>
          {badge}
        </div>
        {description ? (
          <p id={descriptionId} className="text-sm text-ink-muted">
            {description}
          </p>
        ) : null}
        {preview}
      </div>
    </div>
  );
}
