'use client';

import {
  MOTION_PREFERENCES,
  RULER_MODES,
  SETTINGS_BOUNDS,
  type MotionPreference,
  type RulerMode,
} from '@sahaj/shared/a11y';

import { useAccessibility } from '@/features/a11y/AccessibilityProvider';
import { Fieldset } from '@/components/ui/Fieldset';
import { RadioCard } from '@/components/ui/RadioCard';
import { RangeStepper } from '@/components/ui/RangeStepper';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { hotkeyHelpText } from '@/features/a11y/hotkeys';

const RULER_MODE_LABELS: Readonly<Record<RulerMode, { label: string; description: string }>> = {
  pointer: {
    label: 'Follow the mouse',
    description: 'Highlights the line under the pointer while it moves.',
  },
  focus: {
    label: 'Follow the keyboard',
    description: 'Highlights the line that has keyboard focus.',
  },
  both: {
    label: 'Follow both',
    description: 'Works with a mouse, a finger, or the keyboard.',
  },
};

const MOTION_LABELS: Readonly<Record<MotionPreference, { label: string; description: string }>> = {
  system: {
    label: 'Use my device setting',
    description: 'Follows the “reduce motion” setting in your device.',
  },
  reduce: { label: 'Always reduce motion', description: 'Turns off all animation and sliding.' },
  allow: { label: 'Allow motion', description: 'Keeps the gentle animations on.' },
};

/**
 * Visual load controls: reading ruler, zero-distraction mode, link emphasis,
 * focus ring strength, and motion.
 *
 * The reading ruler is a *reading aid*, not a widget: it draws a band across the
 * page so a learner can track one line at a time. It is purely decorative to
 * assistive technology (`aria-hidden`), because the same information is already
 * available through the text itself.
 */
export function VisualControls() {
  const { settings, updateSettings, announce } = useAccessibility();

  return (
    <Fieldset
      legend="Seeing and focusing"
      description="Tools that reduce visual crowding and help you keep your place."
    >
      <div className="flex flex-col gap-5">
        <ToggleSwitch
          label="Reading ruler"
          checked={settings.screenRuler}
          onChange={(checked) => {
            updateSettings({ screenRuler: checked });
            announce(checked ? 'Reading ruler on' : 'Reading ruler off');
          }}
          shortcut={hotkeyHelpText('toggle-ruler')}
          hint="A band highlights the line you are reading and dims the rest a little."
        />

        {settings.screenRuler ? (
          <>
            <Fieldset legend="How the ruler follows you">
              {RULER_MODES.map((mode) => (
                <RadioCard
                  key={mode}
                  name="sahaj-ruler-mode"
                  value={mode}
                  checked={settings.rulerMode === mode}
                  onSelect={(value) => updateSettings({ rulerMode: value as RulerMode })}
                  label={RULER_MODE_LABELS[mode].label}
                  description={RULER_MODE_LABELS[mode].description}
                />
              ))}
            </Fieldset>

            <RangeStepper
              label="Ruler height"
              value={settings.rulerHeightRem}
              min={SETTINGS_BOUNDS.rulerHeightRem.min}
              max={SETTINGS_BOUNDS.rulerHeightRem.max}
              step={SETTINGS_BOUNDS.rulerHeightRem.step}
              formatValue={(value) => `${value.toFixed(1)} rem`}
              describeValue={(value) => `${value.toFixed(1)} text lines tall`}
              increaseLabel="Make the ruler taller"
              decreaseLabel="Make the ruler shorter"
              onValueChange={(value, source) => {
                updateSettings({ rulerHeightRem: value });
                if (source === 'step') announce(`Ruler height ${value.toFixed(1)}`);
              }}
            />
          </>
        ) : null}

        <ToggleSwitch
          label="Focus mode"
          checked={settings.focusMode}
          onChange={(checked) => {
            updateSettings({ focusMode: checked });
            announce(checked ? 'Focus mode on' : 'Focus mode off');
          }}
          shortcut={hotkeyHelpText('toggle-focus')}
          hint="Hides menus and side panels so only the lesson is on screen."
        />

        <ToggleSwitch
          label="Make links stand out"
          checked={settings.emphasizeLinks}
          onChange={(checked) => {
            updateSettings({ emphasizeLinks: checked });
            announce(checked ? 'Links will be underlined' : 'Links will not be underlined');
          }}
          hint="Links get an underline and a soft background, so colour is never the only clue."
        />

        <ToggleSwitch
          label="Strong focus outline"
          checked={settings.enhancedFocusRing}
          onChange={(checked) => {
            updateSettings({ enhancedFocusRing: checked });
            announce(checked ? 'Strong outline on' : 'Strong outline off');
          }}
          hint="A thick outline shows where the keyboard is, with a light and a dark edge so it shows on any background."
        />

        <Fieldset legend="Movement" description="Choose how much animation the app should use.">
          {MOTION_PREFERENCES.map((preference) => (
            <RadioCard
              key={preference}
              name="sahaj-motion"
              value={preference}
              checked={settings.motion === preference}
              onSelect={(value) => {
                updateSettings({ motion: value as MotionPreference });
                announce(MOTION_LABELS[value as MotionPreference].label);
              }}
              label={MOTION_LABELS[preference].label}
              description={MOTION_LABELS[preference].description}
            />
          ))}
        </Fieldset>
      </div>
    </Fieldset>
  );
}
