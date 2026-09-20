'use client';

import { VOICE_HELP_COMMANDS } from '@/features/voice/grammar';
import { useVoiceControl } from '@/features/voice/VoiceControlProvider';
import { TouchButton } from '@/components/ui/TouchButton';

/**
 * The voice control bar.
 *
 * Always present rather than tucked into a menu, because voice is the *primary*
 * input method for learners who cannot use a mouse or keyboard reliably. It is
 * also the discovery surface: a learner who does not know voice control exists
 * will never open its settings.
 *
 * Status is communicated with words as well as colour, "I heard" feedback is
 * shown so a learner can see why a command did or did not work, and a
 * microphone failure offers the keyboard alternative in the same sentence.
 */
export function VoiceControlDock() {
  const voice = useVoiceControl();

  return (
    <section
      aria-label="Voice control"
      // Above the page content but below the settings dialog (z-50).
      className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-line bg-elevated p-3"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3">
        <TouchButton
          variant={voice.listening ? 'primary' : 'secondary'}
          size="large"
          aria-pressed={voice.listening}
          disabled={!voice.supported}
          onClick={voice.toggle}
        >
          <span aria-hidden="true" className="text-xl leading-none">
            {voice.listening ? '◉' : '○'}
          </span>
          <span>{voice.listening ? 'Listening' : 'Talk to me'}</span>
        </TouchButton>

        <p role="status" className="min-w-0 flex-1 text-base text-ink">
          {!voice.supported
            ? 'This browser cannot listen. Use the buttons or the keyboard instead.'
            : voice.error
              ? voice.error.message
              : voice.interimTranscript
                ? `I heard: ${voice.interimTranscript}`
                : voice.lastCommand
                  ? `Command: ${voice.lastCommand.id.replace(/-/g, ' ')}`
                  : voice.enabled
                    ? 'Say “read this”, “bigger text” or “help”.'
                    : 'Voice control is off.'}
        </p>

        {voice.error ? (
          <TouchButton variant="ghost" onClick={voice.clearError}>
            Dismiss
          </TouchButton>
        ) : null}
      </div>

      {/* Collapsed by default so the bar stays quiet on screen. */}
      <details data-focus-mode-hide className="mx-auto mt-2 max-w-3xl">
        <summary className="min-h-12 cursor-pointer py-2 text-base font-medium text-ink">
          What can I say?
        </summary>
        <ul className="grid gap-1 pt-1 sm:grid-cols-2">
          {VOICE_HELP_COMMANDS.map((command) => (
            <li key={command.id} className="text-base text-ink-muted">
              {command.example}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
