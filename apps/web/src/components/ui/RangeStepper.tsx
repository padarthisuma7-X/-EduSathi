'use client';

import { useId } from 'react';

import { TouchButton } from './TouchButton';

/**
 * An adjustable numeric setting.
 *
 * Three input methods for the same value, because no single one works for every
 * learner (WCAG 2.5.5 / 2.1.1):
 *  - a native range input, for pointer dragging and arrow keys;
 *  - large +/- buttons, for coarse motor control and one-handed use on a phone;
 *  - keyboard arrows, which the range input provides for free.
 *
 * The current value is rendered as `<output>` *and* announced through
 * `aria-valuetext` in words ("One hundred and twenty percent", not "120"), which
 * is what makes the control usable with a screen reader — a bare number gives
 * the learner no idea what is being adjusted or in which direction.
 */

export interface RangeStepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /**
   * `source` tells the caller how the value changed so it can decide whether to
   * announce. A native range input announces itself when arrow-keyed; the +/-
   * buttons announce nothing, so callers speak the new value only for `step`.
   */
  onValueChange: (value: number, source: 'slider' | 'step') => void;
  /** Display form of the value, e.g. "120%". */
  formatValue: (value: number) => string;
  /** Spoken form, e.g. "120 percent". Falls back to `formatValue`. */
  describeValue?: (value: number) => string;
  /** Accessible labels for the nudge buttons, e.g. "Make text bigger". */
  increaseLabel: string;
  decreaseLabel: string;
  /** Extra explanation shown under the control and wired to `aria-describedby`. */
  hint?: string;
  disabled?: boolean;
}

export function RangeStepper({
  label,
  value,
  min,
  max,
  step,
  onValueChange,
  formatValue,
  describeValue,
  increaseLabel,
  decreaseLabel,
  hint,
  disabled = false,
}: RangeStepperProps) {
  const inputId = useId();
  const labelId = `${inputId}-label`;
  const outputId = `${inputId}-output`;
  const hintId = `${inputId}-hint`;

  // Floating-point steps accumulate dust (1.7000000000000002), which then shows
  // up in the visible percentage. Rounding to the step's precision fixes it.
  const decimals = countDecimals(step);
  const clamp = (next: number): number =>
    Number(Math.min(Math.max(next, min), max).toFixed(decimals));

  const atMinimum = value <= min;
  const atMaximum = value >= max;
  const spoken = describeValue ? describeValue(value) : formatValue(value);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="text-base font-medium text-ink">
          {label}
        </span>
        <output id={outputId} htmlFor={inputId} className="text-base font-semibold text-ink">
          {formatValue(value)}
        </output>
      </div>

      <div
        // A group is the right role: these three controls adjust one value, and
        // the label names the group as well as the slider.
        role="group"
        aria-labelledby={labelId}
        className="flex items-center gap-3"
      >
        <TouchButton
          iconOnly
          aria-label={decreaseLabel}
          size="medium"
          disabled={disabled || atMinimum}
          onClick={() => onValueChange(clamp(value - step), 'step')}
          className="text-xl font-bold"
        >
          <span aria-hidden="true">−</span>
        </TouchButton>

        <input
          id={inputId}
          type="range"
          className="sahaj-range h-12 flex-1"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-labelledby={labelId}
          // The hint sits on the slider itself, not on the group: a screen reader
          // announces a group's description on entering the group and then the
          // control's own on focus, which would read the same sentence twice.
          aria-describedby={hint ? hintId : undefined}
          // The human-readable value, so "180%" is not read as "one hundred
          // and eighty".
          aria-valuetext={spoken}
          aria-valuemin={min}
          aria-valuemax={max}
          onChange={(event) => onValueChange(clamp(Number(event.currentTarget.value)), 'slider')}
        />

        <TouchButton
          iconOnly
          aria-label={increaseLabel}
          size="medium"
          disabled={disabled || atMaximum}
          onClick={() => onValueChange(clamp(value + step), 'step')}
          className="text-xl font-bold"
        >
          <span aria-hidden="true">+</span>
        </TouchButton>
      </div>

      {hint ? (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function countDecimals(value: number): number {
  if (Number.isInteger(value)) return 0;
  const decimals = String(value).split('.')[1];
  return decimals ? decimals.length : 0;
}
