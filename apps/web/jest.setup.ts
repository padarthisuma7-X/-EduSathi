import '@testing-library/jest-dom';

/**
 * jsdom implements neither `matchMedia` nor the Web Speech APIs, and Module 1
 * touches all of them. These stubs are deliberately *faithful but inert*:
 *  - `matchMedia` returns a controllable MediaQueryList so tests can simulate
 *    `prefers-reduced-motion` / `prefers-contrast`;
 *  - the speech stubs record calls so tests can assert that we spoke the right
 *    words at the right rate without needing real audio.
 */

// --- matchMedia -------------------------------------------------------------

interface MockMediaQueryList extends MediaQueryList {
  dispatchChange(matches: boolean): void;
}

const mediaQueryLists = new Map<string, MockMediaQueryList>();

/** Lets a test simulate `prefers-reduced-motion: reduce` mid-render. */
export function setMediaQueryMatches(query: string, matches: boolean): void {
  const list = window.matchMedia(query) as MockMediaQueryList;
  if (list.matches !== matches) list.dispatchChange(matches);
}

function createMockMediaQueryList(query: string, matches: boolean): MockMediaQueryList {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  let currentMatches = matches;
  return {
    get matches() {
      return currentMatches;
    },
    media: query,
    onchange: null,
    // Parameters are annotated explicitly: the overloaded `EventTarget`
    // signature gives TypeScript nothing to contextually type them from.
    addEventListener: (_type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (typeof listener === 'function') listeners.add(listener as (event: MediaQueryListEvent) => void);
    },
    removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (typeof listener === 'function') listeners.delete(listener as (event: MediaQueryListEvent) => void);
    },
    addListener: (listener: ((event: MediaQueryListEvent) => void) | null) => {
      if (listener) listeners.add(listener);
    },
    removeListener: (listener: ((event: MediaQueryListEvent) => void) | null) => {
      if (listener) listeners.delete(listener);
    },
    dispatchEvent: () => true,
    dispatchChange(nextMatches: boolean) {
      currentMatches = nextMatches;
      const event = { matches: nextMatches, media: query } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}

// Queries default to `false`; individual tests opt in via setMediaQueryMatches.
const DEFAULT_MEDIA_MATCHES: Readonly<Record<string, boolean>> = {
  '(prefers-reduced-motion: reduce)': false,
  '(prefers-contrast: more)': false,
  '(prefers-color-scheme: dark)': false,
};

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList => {
    const existing = mediaQueryLists.get(query);
    if (existing) return existing;
    const created = createMockMediaQueryList(query, DEFAULT_MEDIA_MATCHES[query] ?? false);
    mediaQueryLists.set(query, created);
    return created;
  },
});

// --- Web Speech API ---------------------------------------------------------

export interface SpokenUtterance {
  text: string;
  rate: number;
  volume: number;
  lang: string;
}

export const spokenUtterances: SpokenUtterance[] = [];
export const cancelledSpeeches: number[] = [];

class MockSpeechSynthesisUtterance implements SpeechSynthesisUtterance {
  rate = 1;
  pitch = 1;
  volume = 1;
  lang = 'en-US';
  voice: SpeechSynthesisVoice | null = null;
  onboundary: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => unknown) | null = null;
  onend: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => unknown) | null = null;
  onerror: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisErrorEvent) => unknown) | null = null;
  onstart: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => unknown) | null = null;
  onpause: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => unknown) | null = null;
  onresume: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => unknown) | null = null;
  onmark: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => unknown) | null = null;
  constructor(public text: string) {}
  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean {
    return true;
  }
}

if (!('speechSynthesis' in window)) {
  const synthesis: SpeechSynthesis = {
    pending: false,
    paused: false,
    speaking: false,
    onvoiceschanged: null,
    getVoices: () => [],
    speak(utterance: SpeechSynthesisUtterance) {
      spokenUtterances.push({
        text: utterance.text,
        rate: utterance.rate,
        volume: utterance.volume,
        lang: utterance.lang,
      });
      utterance.onend?.call(utterance, { utterance } as SpeechSynthesisEvent);
    },
    cancel() {
      cancelledSpeeches.push(Date.now());
    },
    pause() {},
    resume() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
  } as unknown as SpeechSynthesis;
  Object.defineProperty(window, 'speechSynthesis', { writable: true, value: synthesis });
}

if (!('SpeechSynthesisUtterance' in window)) {
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    writable: true,
    value: MockSpeechSynthesisUtterance,
  });
}

// --- Layout observers used by the reading ruler -----------------------------

if (!('ResizeObserver' in window)) {
  class MockResizeObserver implements ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(window, 'ResizeObserver', { writable: true, value: MockResizeObserver });
}

if (!('IntersectionObserver' in window)) {
  class MockIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: readonly number[] = [];
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    value: MockIntersectionObserver,
  });
}

if (!window.scrollTo) {
  Object.defineProperty(window, 'scrollTo', { writable: true, value: () => undefined });
}

// Silence jsdom's "not implemented" noise for the settings drawer's focus trap.
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => undefined;
}

beforeEach(() => {
  spokenUtterances.length = 0;
  cancelledSpeeches.length = 0;
});
