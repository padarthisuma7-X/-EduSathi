'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useAccessibility } from '../a11y/AccessibilityProvider';
import { useAppCommands } from '../commands/use-app-commands';
import { parseVoiceCommand, type VoiceCommandId } from './grammar';
import { useSpeech } from './SpeechProvider';
import {
  describeRecognitionError,
  useSpeechRecognition,
  type RecognitionResult,
  type SpeechRecognitionErrorCode,
} from './use-speech-recognition';

/**
 * Voice-driven interface (Module 1 multimodal input).
 *
 * The interesting problems this solves, all of which show up in a real
 * classroom and none of which are solved by "call SpeechRecognition":
 *
 *  - **Echo.** The device is often reading aloud when the learner speaks, so the
 *    microphone hears the narrator. Results arriving while we are speaking are
 *    discarded, otherwise "The seed grew into a plant" gets parsed as a command.
 *  - **Approximate transcripts.** Recognition of child speech is unreliable, so
 *    matching is fuzzy (`parseVoiceCommand`) and an unmatched phrase produces a
 *    helpful nudge rather than silence.
 *  - **Failure is never a dead end.** Any microphone problem is explained in
 *    plain language with the keyboard equivalent named in the same breath.
 */

export interface VoiceControlContextValue {
  /** False when the browser has no SpeechRecognition implementation. */
  supported: boolean;
  /** The learner's preference. */
  enabled: boolean;
  /** Whether the microphone is capturing right now. */
  listening: boolean;
  /** Most recent interim transcript, for on-screen feedback. */
  interimTranscript: string;
  /** Most recent final transcript. */
  lastTranscript: string | null;
  /** Last successfully executed command, for the confirmation chip. */
  lastCommand: { id: VoiceCommandId; matchedPhrase: string } | null;
  error: { code: SpeechRecognitionErrorCode; message: string } | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  clearError: () => void;
}

const VoiceControlContext = createContext<VoiceControlContextValue | null>(null);

/**
 * Failures a retry cannot fix. Retrying these would re-prompt for microphone
 * permission on every page — the fastest way to make a learner give up on voice.
 */
const BLOCKING_ERROR_CODES: ReadonlySet<SpeechRecognitionErrorCode> = new Set([
  'not-allowed',
  'service-not-allowed',
  'audio-capture',
]);

export function VoiceControlProvider({ children }: { children: ReactNode }) {
  const { settings, announce, updateSettings } = useAccessibility();
  const speech = useSpeech();
  const runCommand = useAppCommands();

  const enabled = settings.voiceControlEnabled;
  const [interimTranscript, setInterimTranscript] = useState('');
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const [lastCommand, setLastCommand] = useState<VoiceControlContextValue['lastCommand']>(null);
  const [error, setError] = useState<VoiceControlContextValue['error']>(null);

  // Read inside the recognition callback without rebuilding the recogniser.
  // Updated in an effect rather than during render: a ref written while rendering
  // is unsafe under concurrent rendering.
  const speakingRef = useRef(speech.speaking);
  useEffect(() => {
    speakingRef.current = speech.speaking;
  }, [speech.speaking]);

  const handleResult = useCallback(
    (result: RecognitionResult) => {
      // Ignore anything the microphone picks up from our own narration, and any
      // partial result — acting on an interim transcript causes commands to fire
      // several times as the recogniser revises its guess.
      if (speakingRef.current) return;

      if (!result.isFinal) {
        setInterimTranscript(result.transcript);
        return;
      }

      setInterimTranscript('');
      setLastTranscript(result.transcript);

      const match = parseVoiceCommand(result.transcript);
      if (!match) {
        announce('I did not catch that. Say help to hear what I can do.');
        return;
      }

      setLastCommand({ id: match.id, matchedPhrase: match.matchedPhrase });
      const outcome = runCommand(match.id);
      if (!outcome.ok) {
        // `useAppCommands` only announces successes; failures explain themselves
        // through the returned message so the learner is never left wondering.
        announce(outcome.message);
      }
    },
    [announce, runCommand],
  );

  const handleError = useCallback(
    (code: SpeechRecognitionErrorCode) => {
      const message = describeRecognitionError(code);
      setError({ code, message });
      announce(message, code === 'not-allowed' || code === 'service-not-allowed' ? 'assertive' : 'polite');

      // A blocked or missing microphone is not recoverable by retrying, so turn
      // the preference back off rather than leaving the UI claiming to listen.
      if (BLOCKING_ERROR_CODES.has(code)) {
        updateSettings({ voiceControlEnabled: false });
      }
    },
    [announce, updateSettings],
  );

  const recognition = useSpeechRecognition({ onResult: handleResult, onError: handleError });
  const { supported: recognitionSupported, start: startRecognition, stop: stopRecognition } = recognition;

  // Start and stop listening purely from the preference. This is what makes the
  // Alt + V shortcut, the voice command "voice off", and the on-screen switch all
  // equivalent without three code paths.
  useEffect(() => {
    if (!enabled || !recognitionSupported) return;
    startRecognition();
    return () => stopRecognition();
  }, [enabled, recognitionSupported, startRecognition, stopRecognition]);

  const start = useCallback(() => updateSettings({ voiceControlEnabled: true }), [updateSettings]);
  const stop = useCallback(() => updateSettings({ voiceControlEnabled: false }), [updateSettings]);
  const toggle = useCallback(
    () => updateSettings({ voiceControlEnabled: !settings.voiceControlEnabled }),
    [settings.voiceControlEnabled, updateSettings],
  );
  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<VoiceControlContextValue>(
    () => ({
      supported: recognitionSupported,
      enabled,
      listening: recognition.listening,
      interimTranscript,
      lastTranscript,
      lastCommand,
      error,
      start,
      stop,
      toggle,
      clearError,
    }),
    [
      recognitionSupported,
      recognition.listening,
      enabled,
      interimTranscript,
      lastTranscript,
      lastCommand,
      error,
      start,
      stop,
      toggle,
      clearError,
    ],
  );

  return <VoiceControlContext.Provider value={value}>{children}</VoiceControlContext.Provider>;
}

export function useVoiceControl(): VoiceControlContextValue {
  const context = useContext(VoiceControlContext);
  if (!context) throw new Error('useVoiceControl must be used inside <VoiceControlProvider>');
  return context;
}
