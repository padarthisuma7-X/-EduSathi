'use client';

import type { ReactNode } from 'react';

import { AccessibilityToolbar } from '@/components/a11y/AccessibilityToolbar';
import { KeyboardShortcuts } from '@/components/a11y/KeyboardShortcuts';
import { ScreenRuler } from '@/components/a11y/ScreenRuler';
import { VoiceControlDock } from '@/components/voice/VoiceControlDock';
import { AccessibilityProvider } from '@/features/a11y/AccessibilityProvider';
import { SyncProvider } from '@/features/offline/SyncProvider';
import { SpeechProvider } from '@/features/voice/SpeechProvider';
import { VoiceControlProvider } from '@/features/voice/VoiceControlProvider';

/**
 * Provider order is a dependency chain, not a preference:
 *
 *   AccessibilityProvider   owns settings → everything downstream turns on it
 *     SpeechProvider        needs the learner's speech rate and volume
 *       VoiceControlProvider listens, then dispatches commands that write back
 *                            into settings and speech
 *         SyncProvider      owns the offline queue; no dependency on the others,
 *                           but every page below it can enqueue safely
 *
 * The global surfaces (ruler, dock, settings dialog) are rendered here rather
 * than in each page so that every route — including the offline fallback — has
 * the same accessibility features available. A learner must never land on a page
 * where their settings or their voice control have silently stopped working.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AccessibilityProvider>
      <SpeechProvider>
        <VoiceControlProvider>
          <SyncProvider>
            <KeyboardShortcuts />
            {children}
            <ScreenRuler />
            <VoiceControlDock />
            <AccessibilityToolbar />
          </SyncProvider>
        </VoiceControlProvider>
      </SpeechProvider>
    </AccessibilityProvider>
  );
}
