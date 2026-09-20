'use client';

import { formatRatio, themeContrastReport, THEME_LIST, type ThemeDefinition } from '@sahaj/shared/a11y';

import { useAccessibility } from '@/features/a11y/AccessibilityProvider';
import { Fieldset } from '@/components/ui/Fieldset';
import { RadioCard } from '@/components/ui/RadioCard';

/**
 * Colour theme picker.
 *
 * Each option shows its *measured* contrast ratio for body text, computed from
 * the same function the test suite asserts on. Showing the number is not
 * decoration: it lets a teacher or occupational therapist choose a palette with
 * evidence rather than by eye, and it makes a future custom-theme editor safe
 * by construction.
 */
export function ThemeControl() {
  const { settings, updateSettings } = useAccessibility();

  return (
    <Fieldset
      legend="Colour theme"
      description="Every theme is checked for colour contrast. The number shows how strongly the text stands out from the background — 7:1 or more is the highest level."
    >
      <div className="flex flex-col gap-2">
        {THEME_LIST.map((theme) => (
          <RadioCard
            key={theme.id}
            name="sahaj-theme"
            value={theme.id}
            checked={settings.themeId === theme.id}
            onSelect={(value) => updateSettings({ themeId: value as ThemeDefinition['id'] })}
            label={theme.label}
            description={theme.description}
            badge={<ContrastBadge theme={theme} />}
            preview={<ThemeSwatch theme={theme} />}
          />
        ))}
      </div>
    </Fieldset>
  );
}

function ContrastBadge({ theme }: { theme: ThemeDefinition }) {
  const bodyText = themeContrastReport(theme.id).find((check) => check.pair === 'text-on-bg');
  if (!bodyText) return null;

  return (
    <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-sm font-semibold text-ink">
      {formatRatio(bodyText.ratio)} {bodyText.level}
    </span>
  );
}

function ThemeSwatch({ theme }: { theme: ThemeDefinition }) {
  const { tokens } = theme;
  return (
    <span
      // The swatch is a visual duplicate of information already in the label
      // and badge text, so it is hidden from assistive technology.
      aria-hidden="true"
      className="mt-1 flex items-center gap-1"
    >
      {/*
        Keyed by role, not by colour value: a theme legitimately uses the same
        colour for two roles (yellow-on-black uses #FFE81A for text, accent and
        links), and colour keys collide. A duplicate key silently dropped a
        swatch from the preview.
      */}
      {(['bg', 'surface', 'text', 'accent', 'border'] as const).map((role) => (
        <span
          key={role}
          className="block h-6 w-8 rounded border border-line"
          style={{ backgroundColor: tokens[role] }}
        />
      ))}
    </span>
  );
}
