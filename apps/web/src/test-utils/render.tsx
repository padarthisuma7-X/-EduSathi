import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';

import { DEFAULT_SETTINGS, type AccessibilitySettings } from '@sahaj/shared/a11y';

import { AccessibilityProvider } from '@/features/a11y/AccessibilityProvider';
import { SpeechProvider } from '@/features/voice/SpeechProvider';
import { VoiceControlProvider } from '@/features/voice/VoiceControlProvider';

/**
 * Render helpers.
 *
 * Two profiles, because the two kinds of test need different amounts of app:
 *
 *  - default: settings + speech. A component test gets the real context without
 *    the global chat surfaces, so `getByRole('button')` does not have to compete
 *    with the voice dock for the first match.
 *  - `full: true`: the entire provider chain, for integration tests that assert
 *    the wiring between settings, speech and voice control.
 *
 * `settings` starts the provider from a known value through its `initialSettings`
 * seam, so the component renders with it on the first pass. The alternative —
 * seeding localStorage and waiting for hydration — exercises a code path that
 * `accessibility-provider.test.tsx` already covers directly.
 */

export interface A11yRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  settings?: Partial<AccessibilitySettings>;
  full?: boolean;
}

function Providers({
  children,
  settings,
  full,
}: {
  children: ReactNode;
  settings?: Partial<AccessibilitySettings>;
  full: boolean;
}) {
  return (
    <AccessibilityProvider
      {...(settings ? { initialSettings: { ...DEFAULT_SETTINGS, ...settings } } : {})}
    >
      <SpeechProvider>
        {full ? <VoiceControlProvider>{children}</VoiceControlProvider> : children}
      </SpeechProvider>
    </AccessibilityProvider>
  );
}

export function renderWithA11y(ui: ReactNode, options: A11yRenderOptions = {}): RenderResult {
  const { settings, full = false, ...renderOptions } = options;

  return render(<Providers full={full} {...(settings ? { settings } : {})}>{ui}</Providers>, renderOptions);
}
