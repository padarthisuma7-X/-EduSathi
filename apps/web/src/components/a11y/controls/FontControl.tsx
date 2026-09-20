'use client';

import { FONT_FAMILIES, FONT_FAMILY_DEFINITIONS, type FontFamilyToken } from '@sahaj/shared/a11y';

import { useAccessibility } from '@/features/a11y/AccessibilityProvider';
import { Fieldset } from '@/components/ui/Fieldset';
import { RadioCard } from '@/components/ui/RadioCard';

const PREVIEW_TEXT = 'The seed grew into a tall plant.';

/**
 * Letter style picker.
 *
 * Each option is rendered *in its own typeface*, which is the only way a teacher
 * can tell OpenDyslexic from Lexend without reading the label. Fonts are
 * self-hosted (see `apps/web/public/fonts/README.md`); until they are vendored
 * the option still renders, falling back to the next family in its stack rather
 * than showing nothing.
 */
export function FontControl() {
  const { settings, updateSettings } = useAccessibility();

  return (
    <Fieldset
      legend="Letter style"
      description="Some letter shapes are easier to tell apart than others. Pick the one that feels easiest to read."
    >
      <div className="flex flex-col gap-2">
        {FONT_FAMILIES.map((token) => {
          const definition = FONT_FAMILY_DEFINITIONS[token];
          return (
            <RadioCard
              key={token}
              name="sahaj-font"
              value={token}
              checked={settings.fontFamily === token}
              onSelect={(value) => updateSettings({ fontFamily: value as FontFamilyToken })}
              label={definition.label}
              description={definition.rationale}
              preview={
                <span
                  aria-hidden="true"
                  className="mt-1 block truncate text-lg text-ink"
                  style={{ fontFamily: definition.stack }}
                >
                  {PREVIEW_TEXT}
                </span>
              }
            />
          );
        })}
      </div>
    </Fieldset>
  );
}
