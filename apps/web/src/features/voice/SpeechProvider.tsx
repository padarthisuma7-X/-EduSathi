'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { normalizeForSpeech } from '@sahaj/shared/nlp';

import { useAccessibility } from '../a11y/AccessibilityProvider';

/**
 * Text-to-speech engine (Module 1 multimodal layer, Module 2 audio sync).
 *
 * Uses the on-device `SpeechSynthesis` API by default: nothing is uploaded, it
 * works offline, and it costs no bandwidth — all three matter in a government
 * school. The `@sahaj/shared` `SynthesizeResult` contract exists for the server
 * side (higher quality voices, cached audio for low-end devices), and this
 * provider is the seam where a real audio buffer would be swapped in.
 *
 * Karaoke support: `onboundary` reports a *character* index, which the reading
 * surface maps to a word span. Engines that do not fire boundary events simply
 * leave `activeCharIndex` null and the reader highlights sentence by sentence
 * instead — degradation, never breakage.
 */

export interface SpeakOptions {
  /** Identifies this utterance for status messages, e.g. "Story: The Seed". */
  label?: string;
  /** Called when speech finishes (or is cancelled). */
  onEnd?: () => void;
  /** Override the learner's configured rate; used by slow-reading exercises. */
  rate?: number;
}

export interface SpeechContextValue {
  /** False when the browser has no `speechSynthesis` (older Android WebViews). */
  supported: boolean;
  speaking: boolean;
  paused: boolean;
  /** BCP-47 language of the current utterance. */
  language: string;
  /**
   * Character index the engine is currently speaking, or null when unknown.
   * Consumers convert this to a word index for karaoke highlighting.
   */
  activeCharIndex: number | null;
  voices: SpeechSynthesisVoice[];
  speak: (text: string, options?: SpeakOptions) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;

  // --- Speak target registry --------------------------------------------
  // The "Read this" voice command is context-dependent: it should read whatever
  // passage the learner is looking at. Reading surfaces register themselves here
  // instead of the command layer guessing from the DOM.
  speakTarget: SpeakTarget | null;
  registerSpeakTarget: (target: SpeakTarget | null) => void;
}

export interface SpeakTarget {
  /** Text to read when the learner says "read this". */
  text: string;
  /** Announced before reading, e.g. "Reading: The Seed". */
  label: string;
}

const SpeechContext = createContext<SpeechContextValue | null>(null);

function getSynthesis(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null;
  return 'speechSynthesis' in window ? window.speechSynthesis : null;
}

export function SpeechProvider({ children }: { children: ReactNode }) {
  const { settings, announce } = useAccessibility();
  const synthesis = getSynthesis();
  const supported = synthesis !== null;

  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [activeCharIndex, setActiveCharIndex] = useState<number | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speakTarget, setSpeakTarget] = useState<SpeakTarget | null>(null);

  const activeUtterance = useRef<SpeechSynthesisUtterance | null>(null);
  const endHandler = useRef<SpeakOptions['onEnd']>(undefined);

  // Voices load asynchronously in Chrome; without this the language list is
  // empty on first render and `${language} voice` falls back to the default.
  useEffect(() => {
    if (!synthesis) return;
    const load = () => setVoices(synthesis.getVoices());
    load();
    synthesis.addEventListener('voiceschanged', load);
    return () => synthesis.removeEventListener('voiceschanged', load);
  }, [synthesis]);

  const stop = useCallback(() => {
    if (!synthesis) return;
    synthesis.cancel();
    activeUtterance.current = null;
    setSpeaking(false);
    setPaused(false);
    setActiveCharIndex(null);
    // The browser does not fire `onend` for a cancelled utterance, so the
    // caller's completion callback has to be invoked here or a reader that
    // waits for it would hang forever.
    const handler = endHandler.current;
    endHandler.current = undefined;
    handler?.();
  }, [synthesis]);

  const speak = useCallback<SpeechContextValue['speak']>(
    (text, options = {}) => {
      if (!synthesis) {
        announce('Reading aloud is not available on this device. You can still read the page yourself.', 'polite');
        return;
      }
      const cleaned = normalizeForSpeech(text);
      if (cleaned.length === 0) return;

      // Always cancel first: overlapping utterances are the most common cause of
      // a stuck voice on Android Chrome.
      synthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.rate = options.rate ?? settings.speechRate;
      utterance.volume = settings.speechVolume;
      utterance.lang = document.documentElement.lang || 'en';

      const preferredVoice =
        voices.find((voice) => voice.lang === utterance.lang && voice.localService) ??
        voices.find((voice) => voice.lang.startsWith(utterance.lang.split('-')[0] ?? 'en'));
      if (preferredVoice) utterance.voice = preferredVoice;

      utterance.onstart = () => {
        setSpeaking(true);
        setPaused(false);
      };
      utterance.onboundary = (event) => {
        setActiveCharIndex(event.charIndex ?? null);
      };
      utterance.onend = () => {
        setSpeaking(false);
        setPaused(false);
        setActiveCharIndex(null);
        const handler = endHandler.current;
        endHandler.current = undefined;
        handler?.();
      };
      utterance.onerror = () => {
        // Includes "interrupted" and "not-allowed" (autoplay policy). Neither is
        // worth showing a child an error for.
        setSpeaking(false);
        setPaused(false);
        setActiveCharIndex(null);
        const handler = endHandler.current;
        endHandler.current = undefined;
        handler?.();
      };

      endHandler.current = options.onEnd;
      activeUtterance.current = utterance;
      synthesis.speak(utterance);
    },
    [announce, settings.speechRate, settings.speechVolume, synthesis, voices],
  );

  const pause = useCallback(() => {
    synthesis?.pause();
    setPaused(true);
  }, [synthesis]);

  const resume = useCallback(() => {
    synthesis?.resume();
    setPaused(false);
  }, [synthesis]);

  const registerSpeakTarget = useCallback((target: SpeakTarget | null) => {
    setSpeakTarget(target);
  }, []);

  // Never leave a voice talking after the component tree goes away.
  useEffect(() => stop, [stop]);

  const value = useMemo<SpeechContextValue>(
    () => ({
      supported,
      speaking,
      paused,
      language: typeof document === 'undefined' ? 'en' : document.documentElement.lang || 'en',
      activeCharIndex,
      voices,
      speak,
      stop,
      pause,
      resume,
      speakTarget,
      registerSpeakTarget,
    }),
    [
      supported,
      speaking,
      paused,
      activeCharIndex,
      voices,
      speak,
      stop,
      pause,
      resume,
      speakTarget,
      registerSpeakTarget,
    ],
  );

  return <SpeechContext.Provider value={value}>{children}</SpeechContext.Provider>;
}

export function useSpeech(): SpeechContextValue {
  const context = useContext(SpeechContext);
  if (!context) throw new Error('useSpeech must be used inside <SpeechProvider>');
  return context;
}
