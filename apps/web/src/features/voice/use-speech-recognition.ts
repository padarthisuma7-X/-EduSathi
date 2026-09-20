'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useBrowserCapability } from '@/lib/use-browser-capability';

/**
 * Speech-to-text capture (Module 1 voice interface, Module 2 STT).
 *
 * Two deliberate choices:
 *
 * 1. **The Web Speech API types are declared locally.** `SpeechRecognition` is
 *    still non-standard, absent from `lib.dom`, and only available behind the
 *    `webkit` prefix in some browsers. Importing a community `@types` package
 *    for it would add a runtime-irrelevant dependency and its globals could
 *    clash, so the minimal structural shape we actually use is declared here.
 *
 * 2. **Listening is self-healing.** Chrome ends recognition after a short
 *    silence even with `continuous = true`. A learner who pauses to think must
 *    not have to press a button again, so `onend` restarts while the intent to
 *    listen is still set. Restarts are rate-limited to avoid a tight loop when
 *    the microphone is unavailable (which fires `onend` immediately).
 */

export type SpeechRecognitionErrorCode =
  | 'aborted'
  | 'audio-capture'
  | 'bad-grammar'
  | 'language-not-supported'
  | 'network'
  | 'no-speech'
  | 'not-allowed'
  | 'service-not-allowed'
  | 'unknown';

export interface RecognitionResult {
  transcript: string;
  /** 0–1; often 0 for on-device engines, so never gate on it alone. */
  confidence: number;
  isFinal: boolean;
}

interface RecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface RecognitionResultLike {
  readonly length: number;
  readonly isFinal: boolean;
  readonly [index: number]: RecognitionAlternativeLike | undefined;
}

interface RecognitionResultListLike {
  readonly length: number;
  readonly [index: number]: RecognitionResultLike | undefined;
}

interface RecognitionEventLike {
  readonly resultIndex: number;
  readonly results: RecognitionResultListLike;
}

interface RecognitionErrorEventLike {
  readonly error: string;
  readonly message?: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: RecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

/** Returns the constructor for whichever prefixed implementation exists. */
export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export interface UseSpeechRecognitionOptions {
  /** BCP-47 tag. Defaults to the document language. */
  language?: string;
  onResult?: (result: RecognitionResult) => void;
  onError?: (code: SpeechRecognitionErrorCode) => void;
}

export interface UseSpeechRecognitionReturn {
  supported: boolean;
  listening: boolean;
  start: () => void;
  stop: () => void;
}

function hasSpeechRecognition(): boolean {
  return getSpeechRecognitionConstructor() !== null;
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {},
): UseSpeechRecognitionReturn {
  const { language, onResult, onError } = options;
  // Read as external state: support is fixed for the session and cannot be known
  // while server rendering, so it is never guessed at and never set from an
  // effect (which would render a wrong value first and cascade a render after).
  const supported = useBrowserCapability(hasSpeechRecognition);
  const [listening, setListening] = useState(false);

  const recognition = useRef<SpeechRecognitionLike | null>(null);
  /** The *intent* to listen. Distinct from `listening`, which is the reality. */
  const wantsListening = useRef(false);
  const lastStartAt = useRef(0);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Callbacks are held in refs so the recognition instance never has to be
  // rebuilt (rebuilding it mid-session drops the microphone permission prompt
  // state on some Android builds). The refs are updated in an effect rather than
  // during render: writing a ref while rendering is not safe under concurrent
  // rendering, and a result arriving one tick late is harmless here.
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onResultRef.current = onResult;
    onErrorRef.current = onError;
  }, [onResult, onError]);

  const ensureInstance = useCallback((): SpeechRecognitionLike | null => {
    if (recognition.current) return recognition.current;
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) return null;

    const instance = new Recognition();
    instance.continuous = true;
    instance.interimResults = true;
    instance.maxAlternatives = 3;
    instance.lang = language ?? (typeof document === 'undefined' ? 'en' : document.documentElement.lang || 'en');

    instance.onstart = () => setListening(true);

    instance.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result) continue;
        const alternative = result[0];
        if (!alternative) continue;
        const transcript = alternative.transcript.trim();
        if (transcript.length === 0) continue;
        onResultRef.current?.({
          transcript,
          confidence: alternative.confidence,
          isFinal: result.isFinal,
        });
      }
    };

    instance.onerror = (event) => {
      const code = normalizeErrorCode(event.error);
      // `no-speech` and `aborted` are normal in classroom conditions.
      if (code !== 'no-speech' && code !== 'aborted') {
        onErrorRef.current?.(code);
      }
      // A denied microphone is terminal: stop trying so we do not re-prompt.
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        wantsListening.current = false;
      }
    };

    instance.onend = () => {
      setListening(false);
      if (!wantsListening.current) return;
      // Rate limit to one restart per 400 ms: a permanently failing microphone
      // fires start/end immediately and would otherwise spin the CPU.
      const since = Date.now() - lastStartAt.current;
      const delay = Math.max(0, 400 - since);
      restartTimer.current = setTimeout(() => {
        if (!wantsListening.current) return;
        try {
          lastStartAt.current = Date.now();
          instance.start();
        } catch {
          /* already started — harmless */
        }
      }, delay);
    };

    recognition.current = instance;
    return instance;
  }, [language]);

  const start = useCallback(() => {
    const instance = ensureInstance();
    if (!instance) return;
    wantsListening.current = true;
    try {
      lastStartAt.current = Date.now();
      instance.start();
    } catch {
      /* Chrome throws when start() is called while already running. */
    }
  }, [ensureInstance]);

  const stop = useCallback(() => {
    wantsListening.current = false;
    if (restartTimer.current) {
      clearTimeout(restartTimer.current);
      restartTimer.current = null;
    }
    recognition.current?.stop();
    setListening(false);
  }, []);

  useEffect(
    () => () => {
      wantsListening.current = false;
      if (restartTimer.current) clearTimeout(restartTimer.current);
      // `abort` rather than `stop`: teardown must not commit a final phrase.
      recognition.current?.abort();
    },
    [],
  );

  return { supported, listening, start, stop };
}

function normalizeErrorCode(raw: string): SpeechRecognitionErrorCode {
  const known: readonly string[] = [
    'aborted',
    'audio-capture',
    'bad-grammar',
    'language-not-supported',
    'network',
    'no-speech',
    'not-allowed',
    'service-not-allowed',
  ];
  return known.includes(raw) ? (raw as SpeechRecognitionErrorCode) : 'unknown';
}

/** Child-friendly explanation for each failure, with the keyboard alternative. */
export function describeRecognitionError(code: SpeechRecognitionErrorCode): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'The microphone is blocked. You can use the keyboard instead — press Alt + A for settings.';
    case 'audio-capture':
      return 'I cannot find a microphone. You can use the keyboard instead.';
    case 'network':
      return 'Voice needs the internet right now. You can use the keyboard instead.';
    case 'language-not-supported':
      return 'Voice is not ready for this language yet. Please use the keyboard.';
    default:
      return 'Voice stopped. Press the button to try again, or use the keyboard.';
  }
}
