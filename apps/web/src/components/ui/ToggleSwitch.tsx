'use client';

import { useId } from 'react';

import { cx } from '@/lib/cx';

/**
 * A switch for binary settings.
 *
 * Implemented as `<button role="switch">` rather than a styled checkbox because
 * the platform needs: a full-width 48px target containing both the label and the
 * state, a visible "On"/"Off" word (colour and position are never the only
 * signal — WCAG 1.4.1), and an optional shortcut hint in the description.
 *
 * `aria-checked` carries the state; the visible word is `aria-hidden` so it is
 * not read twice.
 */

export interface ToggleSwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Extra explanation, wired via `aria-describedby`. */
  hint?: string;
  /** Shortcut hint such as "Alt + R", shown beside the label. */
  shortcut?: string;
  disabled?: boolean;
  /** Optional extra control rendered inside the same group, e.g. a preview. */
  className?: string;
}

export function ToggleSwitch({
  label,
  checked,
  onChange,
  hint,
  shortcut,
  disabled = false,
  className,
}: ToggleSwitchProps) {
  const hintId = useId();

  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={hint ? hintId : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          // `min-h-12` is 3rem = 48px at the default root size, and grows with
          // the learner's font scale because it is rem-based.
          'flex min-h-12 w-full items-center justify-between gap-3 text-left',
          'rounded-[var(--radius-control)] border-2 border-line bg-elevated px-4 py-2',
          'text-base text-ink hover:bg-surface',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <span className="flex flex-col">
          <span className="font-medium">{label}</span>
          {shortcut ? (
            <span className="text-sm text-ink-muted">
              Shortcut: <kbd className="font-sans font-semibold">{shortcut}</kbd>
            </span>
          ) : null}
        </span>

        <span className="flex shrink-0 items-center gap-2">
          {/*
            The word is the accessible-safe signal: a learner with colour
            blindness, or in forced-colors mode, still knows the state.
            `aria-hidden` avoids duplicating what `aria-checked` already says.
          */}
          <span aria-hidden="true" className="text-sm font-semibold">
            {checked ? 'On' : 'Off'}
          </span>
          <span
            aria-hidden="true"
            className={cx(
              'flex h-8 w-14 items-center rounded-full border-2 border-line px-1',
              checked ? 'justify-end bg-accent' : 'justify-start bg-surface',
            )}
          >
            <span
              className={cx(
                'block h-5 w-5 rounded-full',
                checked ? 'bg-on-accent' : 'bg-ink',
              )}
            />
          </span>
        </span>
      </button>

      {hint ? (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
