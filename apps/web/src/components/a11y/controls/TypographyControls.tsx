'use client';

import { SETTINGS_BOUNDS } from '@sahaj/shared/a11y';

import { useAccessibility } from '@/features/a11y/AccessibilityProvider';
import { Fieldset } from '@/components/ui/Fieldset';
import { RangeStepper } from '@/components/ui/RangeStepper';

/**
 * Dyslexia / low-vision typography controls.
 *
 * Ranges are chosen to cover the WCAG 1.4.12 "Text Spacing" success criterion
 * with room above it: line height up to 2.5 (criterion asks 1.5), letter
 * spacing to 0.2em (asks 0.12em), word spacing to 0.5em (asks 0.16em). A learner
 * who needs the maximum must be able to reach it.
 *
 * Every value is expressed in `em` or a multiplier, never a pixel count, so it
 * composes with the text-size control instead of fighting it.
 */
export function TypographyControls() {
  const { settings, updateSettings, announce } = useAccessibility();

  return (
    <Fieldset
      legend="Letters and lines"
      description="Change how large the words are and how much space sits between them."
    >
      <div className="flex flex-col gap-6">
        <RangeStepper
          label="Text size"
          value={settings.fontSizePercent}
          min={SETTINGS_BOUNDS.fontSizePercent.min}
          max={SETTINGS_BOUNDS.fontSizePercent.max}
          step={SETTINGS_BOUNDS.fontSizePercent.step}
          formatValue={(value) => `${value}%`}
          describeValue={(value) => `${value} percent`}
          increaseLabel="Make all text bigger"
          decreaseLabel="Make all text smaller"
          hint="The whole page grows, including buttons, so nothing gets lost."
          onValueChange={(value, source) => {
            updateSettings({ fontSizePercent: value });
            if (source === 'step') announce(`Text size ${value} percent`);
          }}
        />

        <RangeStepper
          label="Space between lines"
          value={settings.lineHeight}
          min={SETTINGS_BOUNDS.lineHeight.min}
          max={SETTINGS_BOUNDS.lineHeight.max}
          step={SETTINGS_BOUNDS.lineHeight.step}
          formatValue={(value) => `${value.toFixed(1)}× the text height`}
          describeValue={(value) => `${value.toFixed(1)} times the text height`}
          increaseLabel="More space between lines"
          decreaseLabel="Less space between lines"
          hint="Wider gaps make it harder to lose your place when moving to the next line."
          onValueChange={(value, source) => {
            updateSettings({ lineHeight: value });
            if (source === 'step') announce(`Line spacing ${value.toFixed(1)}`);
          }}
        />

        <RangeStepper
          label="Space between letters"
          value={settings.letterSpacingEm}
          min={SETTINGS_BOUNDS.letterSpacingEm.min}
          max={SETTINGS_BOUNDS.letterSpacingEm.max}
          step={SETTINGS_BOUNDS.letterSpacingEm.step}
          formatValue={(value) => `${value.toFixed(2)} em`}
          describeValue={(value) => `${(value * 100).toFixed(0)} percent of a letter width`}
          increaseLabel="More space between letters"
          decreaseLabel="Less space between letters"
          hint="Extra space helps stop letters from running together."
          onValueChange={(value, source) => {
            updateSettings({ letterSpacingEm: value });
            if (source === 'step') announce(`Letter spacing ${(value * 100).toFixed(0)} percent`);
          }}
        />

        <RangeStepper
          label="Space between words"
          value={settings.wordSpacingEm}
          min={SETTINGS_BOUNDS.wordSpacingEm.min}
          max={SETTINGS_BOUNDS.wordSpacingEm.max}
          step={SETTINGS_BOUNDS.wordSpacingEm.step}
          formatValue={(value) => `${value.toFixed(2)} em`}
          describeValue={(value) => `${(value * 100).toFixed(0)} percent of a letter width`}
          increaseLabel="More space between words"
          decreaseLabel="Less space between words"
          onValueChange={(value, source) => {
            updateSettings({ wordSpacingEm: value });
            if (source === 'step') announce(`Word spacing ${(value * 100).toFixed(0)} percent`);
          }}
        />

        <SampleText />
      </div>
    </Fieldset>
  );
}

/**
 * Live sample. Written at a grade-2 level, short, and — importantly — it is
 * *not* a fake paragraph about lorem ipsum: a learner practicing with it sees
 * real words, and the sentence exercises ascenders, descenders and a capital.
 */
function SampleText() {
  return (
    <div className="rounded-[var(--radius-control)] border-2 border-dashed border-line p-4">
      <p className="mb-1 text-sm font-semibold text-ink-muted">Sample</p>
      <p className="sahaj-prose text-ink">
        The little seed needs water and light. It grows a green shoot. Soon a small leaf opens.
      </p>
    </div>
  );
}
