'use client';

import { useEffect } from 'react';

import { useAppCommands } from '@/features/commands/use-app-commands';
import { useAccessibility } from '@/features/a11y/AccessibilityProvider';
import { resolveHotkey } from '@/features/a11y/hotkeys';

/**
 * Global keyboard shortcuts.
 *
 * Renders nothing; it exists so shortcut wiring is a named, testable unit rather
 * than a stray `useEffect` inside the layout.
 *
 * Two details that matter:
 *  - Shortcuts are ignored while a modifier other than Alt is held, so they never
 *    shadow a browser or assistive-technology combination.
 *  - They fire even when focus is inside a text field, because Alt + letter does
 *    not produce a character there — a learner mid-typing can still say "stop".
 */
export function KeyboardShortcuts() {
  const runCommand = useAppCommands();
  const { announce } = useAccessibility();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const id = resolveHotkey(event);
      if (!id) return;
      // Prevent the browser's own Alt+key behaviour where one exists.
      event.preventDefault();
      const outcome = runCommand(id);
      if (!outcome.ok) announce(outcome.message);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [announce, runCommand]);

  return null;
}
