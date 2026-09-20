'use client';

import { SETTINGS_BOUNDS } from '@sahaj/shared/a11y';

import { useAccessibility } from '@/features/a11y/AccessibilityProvider';
import { useSpeech } from '@/features/voice/SpeechProvider';
import { useVoiceControl } from '@/features/voice/VoiceControlProvider';
import { Fieldset } from '@/components/ui/Fieldset';
import { RangeStepper } from '@/components/ui/RangeStepper';
import { TouchButton } from '@/components/ui/TouchButton';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';

const VOICE_TEST_SENTENCE = 'Hello. I will read your lessons with you.';

/**
 * Speech and language controls.
 *
 * Note on the two "voice control" switches: this one and the one in the voice
 * dock write to the same setting. That is intentional — the dock is a persistent
 * status bar a learner can reach at any time, and this panel is where settings
 * are reviewed. Both render the shared value, so they can never disagree.
 */
export function SpeechControls() {
  const { settings, updateSettings, announce } = useAccessibility();
  const speech = useSpeech();
  const voice = useVoiceControl();

  return (
    <Fieldset
      legend="Listening and speaking"
      description="Let the app read to you, and control it with your voice."
    >
      <div className="flex flex-col gap-5">
        <ToggleSwitch
          label="Read aloud automatically"
          checked={settings.speechAutoRead}
          onChange={(checked) => {
            updateSettings({ speechAutoRead: checked });
            if (!checked) speech.stop();
            announce(checked ? 'Read aloud on' : 'Read aloud off');
          }}
          hint="Starts reading when a lesson page opens."
        />

        <ToggleSwitch
          label="Highlight words while reading"
          checked={settings.karaokeHighlight}
          onChange={(checked) => updateSettings({ karaokeHighlight: checked })}
          hint="Each word lights up as it is spoken, so eyes and ears stay together."
        />

        <RangeStepper
          label="Reading speed"
          value={settings.speechRate}
          min={SETTINGS_BOUNDS.speechRate.min}
          max={SETTINGS_BOUNDS.speechRate.max}
          step={SETTINGS_BOUNDS.speechRate.step}
          formatValue={(value) => `${value.toFixed(2)}×`}
          describeValue={(value) =>
            value < 0.7 ? 'Very slow' : value < 0.95 ? 'Slow' : value < 1.1 ? 'Normal' : 'A little fast'
          }
          increaseLabel="Read faster"
          decreaseLabel="Read slower"
          hint="Reading aloud stops at 1.25× so that every word stays clear."
          onValueChange={(value, source) => {
            updateSettings({ speechRate: value });
            if (source === 'step') announce(`Reading speed ${value.toFixed(2)} times`);
          }}
        />

        <RangeStepper
          label="Volume"
          value={settings.speechVolume}
          min={SETTINGS_BOUNDS.speechVolume.min}
          max={SETTINGS_BOUNDS.speechVolume.max}
          step={SETTINGS_BOUNDS.speechVolume.step}
          formatValue={(value) => `${Math.round(value * 100)}%`}
          describeValue={(value) => `${Math.round(value * 100)} percent`}
          increaseLabel="Louder"
          decreaseLabel="Quieter"
          onValueChange={(value, source) => {
            updateSettings({ speechVolume: value });
            if (source === 'step') announce(`Volume ${Math.round(value * 100)} percent`);
          }}
        />

        <div className="flex flex-wrap items-center gap-3">
          <TouchButton
            variant="secondary"
            onClick={() => speech.speak(VOICE_TEST_SENTENCE, { label: 'Voice test' })}
            disabled={!speech.supported}
          >
            Test the voice
          </TouchButton>
          <TouchButton variant="ghost" onClick={speech.stop} disabled={!speech.speaking}>
            Stop reading
          </TouchButton>
        </div>

        {/*
          Status is text, never colour alone, and it is written as a full
          sentence so it makes sense when read out of context by a screen reader.
        */}
        <p
          role="status"
          className="text-sm text-ink-muted"
        >
          {speech.supported
            ? 'Reading aloud works on this device, even without internet.'
            : 'This device cannot read aloud. Everything else still works.'}
        </p>

        <ToggleSwitch
          label="Voice control"
          checked={settings.voiceControlEnabled}
          onChange={(checked) => {
            updateSettings({ voiceControlEnabled: checked });
          }}
          hint="Use your voice to say things like “read this”, “bigger text”, or “stop”."
          disabled={!voice.supported}
        />

        <p role="status" className="text-sm text-ink-muted">
          {voice.supported
            ? voice.enabled
              ? voice.listening
                ? 'Listening. Say “help” to hear what you can say.'
                : 'Voice control is on. Waiting for the microphone.'
              : 'Voice control is off.'
            : 'This browser cannot listen to your voice. Use the buttons instead — they do the same things.'}
        </p>

        <ToggleSwitch
          label="Easier words"
          checked={settings.plainLanguage}
          onChange={(checked) => {
            updateSettings({ plainLanguage: checked });
            announce(checked ? 'Easier words on' : 'Easier words off');
          }}
          hint="Asks for a simpler version of a lesson when one is available."
        />
      </div>
    </Fieldset>
  );
}
