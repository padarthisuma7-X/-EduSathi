'use client';

import { SETTINGS_PRESETS } from '@sahaj/shared/a11y';

import { useAccessibility } from '@/features/a11y/AccessibilityProvider';
import { Fieldset } from '@/components/ui/Fieldset';
import { TouchButton } from '@/components/ui/TouchButton';

/**
 * One-tap set-ups.
 *
 * Six sliders is a lot to ask of a learner, a parent, or a teacher with forty
 * children. These are *starting points*: applying one still leaves every control
 * adjustable underneath, and nothing is locked in.
 *
 * These are buttons rather than radios because they are actions with a visible
 * result, not a persistent selection — a learner can apply one and then change
 * any individual setting, at which point no preset is "selected" any more.
 */
export function PresetControl() {
  const { applyPreset, announce } = useAccessibility();

  return (
    <Fieldset
      legend="Ready-made set-ups"
      description="Choose one to start, then change anything you like."
    >
      <ul className="flex flex-col gap-2">
        {SETTINGS_PRESETS.map((preset) => (
          <li key={preset.id}>
            <TouchButton
              variant="secondary"
              size="large"
              block
              aria-describedby={`preset-${preset.id}-description`}
              onClick={() => {
                applyPreset(preset.id);
                // The change is visible but silent, so confirm it explicitly.
                announce(`${preset.label} set-up applied. ${preset.description}`);
              }}
              className="justify-start text-left"
            >
              <span className="flex flex-col items-start gap-0.5">
                <span className="font-semibold">{preset.label}</span>
                <span id={`preset-${preset.id}-description`} className="text-sm font-normal">
                  {preset.description}
                </span>
              </span>
            </TouchButton>
          </li>
        ))}
      </ul>
    </Fieldset>
  );
}
