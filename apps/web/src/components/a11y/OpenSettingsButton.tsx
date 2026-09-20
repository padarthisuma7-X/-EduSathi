'use client';

import { useAccessibility } from '@/features/a11y/AccessibilityProvider';
import { TouchButton } from '@/components/ui/TouchButton';

/**
 * Opens the settings dialog from inside page content.
 *
 * A page cannot render the settings UI itself (it is owned by the toolbar in the
 * layout), so this asks the provider to open it. That keeps a single settings
 * dialog in the DOM and a single focus-management implementation.
 */
export function OpenSettingsButton({ children = 'Open accessibility settings' }: { children?: string }) {
  const { openPanel } = useAccessibility();

  return (
    <TouchButton variant="primary" size="large" onClick={openPanel}>
      {children}
    </TouchButton>
  );
}
