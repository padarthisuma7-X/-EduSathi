'use client';

import { useCallback } from 'react';

import { clampToBounds, getTheme, THEME_IDS } from '@sahaj/shared/a11y';

import { useAccessibility } from '../a11y/AccessibilityProvider';
import { useSpeech } from '../voice/SpeechProvider';
import type { VoiceCommandId } from '../voice/grammar';

/**
 * The single command dispatcher.
 *
 * Keyboard shortcuts and voice commands are two *input methods* for the same
 * command set (WCAG 2.1.1: nothing is voice-only). Routing both through one
 * function is what guarantees that — a new command cannot accidentally be added
 * to one input method and forgotten in the other.
 *
 * Every command returns a short confirmation message which this hook announces
 * through the polite live region. Messages are written at a grade-2 reading
 * level and confirm *state*, not just action ("Reading ruler on", not "Toggled").
 */

export interface CommandResult {
  ok: boolean;
  /** Confirmation text, already announced when `ok` is true. */
  message: string;
}

export function useAppCommands(): (id: VoiceCommandId) => CommandResult {
  const accessibility = useAccessibility();
  const speech = useSpeech();

  return useCallback(
    (id: VoiceCommandId): CommandResult => {
      const { settings, updateSettings, panelOpen, openPanel, closePanel, nudge, resetSettings, announce } =
        accessibility;

      const finish = (message: string, ok = true): CommandResult => {
        announce(message);
        return { ok, message };
      };

      switch (id) {
        case 'toggle-panel':
          if (panelOpen) {
            closePanel();
            return finish('Settings closed');
          }
          openPanel();
          return finish('Settings open');

        case 'close-panel':
          if (!panelOpen) return { ok: false, message: 'Settings are already closed' };
          closePanel();
          return finish('Settings closed');

        case 'toggle-ruler': {
          const next = !settings.screenRuler;
          updateSettings({ screenRuler: next });
          return finish(next ? 'Reading ruler on' : 'Reading ruler off');
        }

        case 'toggle-focus': {
          const next = !settings.focusMode;
          updateSettings({ focusMode: next });
          return finish(next ? 'Focus mode on' : 'Focus mode off');
        }

        case 'toggle-speech': {
          const next = !settings.speechAutoRead;
          updateSettings({ speechAutoRead: next });
          if (!next) speech.stop();
          return finish(next ? 'Read aloud on' : 'Read aloud off');
        }

        case 'toggle-voice': {
          const next = !settings.voiceControlEnabled;
          updateSettings({ voiceControlEnabled: next });
          // Announcing before the recognition layer tears itself down means the
          // learner still hears the confirmation.
          return finish(next ? 'Voice control on' : 'Voice control off');
        }

        case 'cycle-theme': {
          // Computed here rather than calling `cycleTheme()` so the confirmation
          // message can name the theme that was actually applied. `updateSettings`
          // and `cycleTheme` produce the identical next id.
          const currentIndex = THEME_IDS.indexOf(settings.themeId);
          const nextThemeId = THEME_IDS[(currentIndex + 1) % THEME_IDS.length]!;
          updateSettings({ themeId: nextThemeId });
          return finish(`Colours changing to ${getTheme(nextThemeId).label}`);
        }

        case 'increase-text': {
          nudge('fontSizePercent', 1);
          const next = clampToBounds('fontSizePercent', settings.fontSizePercent + 10);
          return finish(`Text size ${next} percent`);
        }

        case 'decrease-text': {
          nudge('fontSizePercent', -1);
          const next = clampToBounds('fontSizePercent', settings.fontSizePercent - 10);
          return finish(`Text size ${next} percent`);
        }

        case 'reset-settings':
          resetSettings();
          return finish('Settings reset');

        case 'speak-current': {
          if (!speech.supported) {
            return { ok: false, message: 'Reading aloud is not available on this device' };
          }
          if (!speech.speakTarget) {
            return { ok: false, message: 'There is nothing to read on this page' };
          }
          speech.speak(speech.speakTarget.text, { label: speech.speakTarget.label });
          return finish(`Reading ${speech.speakTarget.label}`);
        }

        case 'stop-speaking':
          if (!speech.speaking) return { ok: false, message: 'I am not reading anything' };
          speech.stop();
          return finish('Stopped reading');

        case 'help':
          return finish(
            'You can say: read this, stop, bigger text, smaller text, reading ruler, change colours, focus mode, or open settings.',
          );

        default:
          return { ok: false, message: 'I do not know that command yet' };
      }
    },
    [accessibility, speech],
  );
}
