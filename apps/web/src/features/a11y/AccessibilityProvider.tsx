'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  applySettingsPatch,
  clampToBounds,
  DEFAULT_SETTINGS,
  isDefaultSettings,
  parseStoredSettings,
  serializeSettings,
  SETTINGS_BOUNDS,
  SETTINGS_PRESETS,
  SETTINGS_STORAGE_KEY,
  THEME_IDS,
  type AccessibilitySettings,
} from '@sahaj/shared/a11y';

import { applySettingsToElement, resolveMotion, type ResolvedMotion } from './apply-settings';
import { usePrefersReducedMotion } from './use-media-query';

/**
 * The accessibility settings engine (Module 1).
 *
 * Responsibilities, deliberately kept in one place so no component has to know
 * how settings are stored or applied:
 *  - owns the settings value and persists it;
 *  - reflects it onto `<html>` as custom properties + data attributes;
 *  - exposes the command surface the keyboard and voice layers call;
 *  - provides the two ARIA live regions used for screen-reader announcements.
 *
 * Components only ever read `useAccessibility()`. Direct DOM writes or direct
 * localStorage access anywhere else are a bug.
 */

export type AnnouncementPoliteness = 'polite' | 'assertive';

export interface AccessibilityContextValue {
  settings: AccessibilitySettings;
  /**
   * False during the first render, before stored settings have been read.
   * Settings-dependent UI must render its neutral state while false: the server
   * cannot know a learner's preferences, and rendering them early would cause a
   * hydration mismatch.
   */
  hydrated: boolean;
  updateSettings: (patch: Partial<AccessibilitySettings>) => void;
  resetSettings: () => void;
  applyPreset: (presetId: string) => void;
  isDefault: boolean;

  /** Settings panel visibility. */
  panelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;

  /** Switches to the next theme in the documented order. */
  cycleTheme: () => void;

  /** Nudges a numeric setting by one step, clamped to its bounds. */
  nudge: (key: keyof typeof SETTINGS_BOUNDS, direction: 1 | -1) => void;

  /** Screen-reader announcement via the polite or assertive live region. */
  announce: (message: string, politeness?: AnnouncementPoliteness) => void;

  /** Whether the OS asks for reduced motion. */
  systemPrefersReducedMotion: boolean;
  /** The effective motion state after resolving the user's preference. */
  resolvedMotion: ResolvedMotion;
}

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

type Action =
  | { type: 'hydrate'; settings: AccessibilitySettings }
  | { type: 'patch'; patch: Partial<AccessibilitySettings> }
  | { type: 'reset' };

interface State {
  settings: AccessibilitySettings;
  hydrated: boolean;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'hydrate':
      return { settings: action.settings, hydrated: true };
    case 'patch':
      return { ...state, settings: applySettingsPatch(state.settings, action.patch), hydrated: true };
    case 'reset':
      return { settings: DEFAULT_SETTINGS, hydrated: true };
    default:
      return state;
  }
}

function readStoredSettings(): AccessibilitySettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    return parseStoredSettings(window.localStorage.getItem(SETTINGS_STORAGE_KEY));
  } catch {
    // Private browsing, disabled storage, or a quota error: defaults are fine.
    return DEFAULT_SETTINGS;
  }
}

function persistSettings(settings: AccessibilitySettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, serializeSettings(settings));
  } catch {
    /* Storage is a convenience, never a requirement. */
  }
}

export interface AccessibilityProviderProps {
  children: ReactNode;
  /** Test seam: lets tests start from a known settings value. */
  initialSettings?: AccessibilitySettings;
}

export function AccessibilityProvider({ children, initialSettings }: AccessibilityProviderProps) {
  const [state, dispatch] = useReducer(
    reducer,
    initialSettings ?? DEFAULT_SETTINGS,
    (settings): State => ({ settings, hydrated: initialSettings !== undefined }),
  );
  const [panelOpen, setPanelOpen] = useState(false);
  const systemPrefersReducedMotion = usePrefersReducedMotion();

  const politeRegion = useRef<HTMLDivElement | null>(null);
  const assertiveRegion = useRef<HTMLDivElement | null>(null);
  const lastAnnouncement = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const announceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Hydration ----------------------------------------------------------
  // A layout effect so the settings value is in place before the browser paints
  // the first interactive frame. The pre-hydration cache has already styled the
  // page; this only brings React state in line with it.
  useLayoutEffect(() => {
    if (initialSettings !== undefined) return;
    dispatch({ type: 'hydrate', settings: readStoredSettings() });
  }, [initialSettings]);

  // --- Apply + persist ----------------------------------------------------
  useEffect(() => {
    if (!state.hydrated) return;
    applySettingsToElement(document.documentElement, state.settings, {
      systemPrefersReducedMotion,
    });
    persistSettings(state.settings);
  }, [state.hydrated, state.settings, systemPrefersReducedMotion]);

  // --- Announcements ------------------------------------------------------
  const announce = useCallback<AccessibilityContextValue['announce']>((message, politeness = 'polite') => {
    const region = politeness === 'assertive' ? assertiveRegion.current : politeRegion.current;
    if (!region) return;

    // Repeating the same string does not re-trigger a screen reader, so an
    // invisible word-joiner alternates the payload without changing the audio.
    const now = Date.now();
    const repeated = lastAnnouncement.current.text === message;
    const payload = repeated && now - lastAnnouncement.current.at < 1500 ? `${message}\u200B` : message;
    lastAnnouncement.current = { text: message, at: now };

    // Clearing first guarantees an announcement even when the text is identical
    // to what is already in the region.
    region.textContent = '';
    if (announceTimer.current) clearTimeout(announceTimer.current);
    announceTimer.current = setTimeout(() => {
      region.textContent = payload;
    }, 60);
  }, []);

  useEffect(
    () => () => {
      if (announceTimer.current) clearTimeout(announceTimer.current);
    },
    [],
  );

  // --- Commands -----------------------------------------------------------
  const updateSettings = useCallback((patch: Partial<AccessibilitySettings>) => {
    dispatch({ type: 'patch', patch });
  }, []);

  const resetSettings = useCallback(() => dispatch({ type: 'reset' }), []);

  const applyPreset = useCallback((presetId: string) => {
    const preset = SETTINGS_PRESETS.find((candidate) => candidate.id === presetId);
    if (!preset) return;
    dispatch({ type: 'patch', patch: preset.patch });
  }, []);

  const cycleTheme = useCallback(() => {
    const currentIndex = THEME_IDS.indexOf(state.settings.themeId);
    const nextThemeId = THEME_IDS[(currentIndex + 1) % THEME_IDS.length]!;
    dispatch({ type: 'patch', patch: { themeId: nextThemeId } });
  }, [state.settings.themeId]);

  const nudge = useCallback<AccessibilityContextValue['nudge']>(
    (key, direction) => {
      const bounds = SETTINGS_BOUNDS[key];
      const current = state.settings[key];
      dispatch({ type: 'patch', patch: { [key]: clampToBounds(key, current + direction * bounds.step) } });
    },
    [state.settings],
  );

  const openPanel = useCallback(() => setPanelOpen(true), []);
  const closePanel = useCallback(() => setPanelOpen(false), []);
  const togglePanel = useCallback(() => setPanelOpen((open) => !open), []);

  const value = useMemo<AccessibilityContextValue>(
    () => ({
      settings: state.settings,
      hydrated: state.hydrated,
      updateSettings,
      resetSettings,
      applyPreset,
      isDefault: isDefaultSettings(state.settings),
      panelOpen,
      openPanel,
      closePanel,
      togglePanel,
      cycleTheme,
      nudge,
      announce,
      systemPrefersReducedMotion,
      resolvedMotion: resolveMotion(state.settings.motion, systemPrefersReducedMotion),
    }),
    [
      state.settings,
      state.hydrated,
      updateSettings,
      resetSettings,
      applyPreset,
      panelOpen,
      openPanel,
      closePanel,
      togglePanel,
      cycleTheme,
      nudge,
      announce,
      systemPrefersReducedMotion,
    ],
  );

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
      {/*
        Live regions live at the end of the tree so they are always present and
        never removed (removing and re-adding a live region is the classic cause
        of silent announcements). `aria-atomic` makes the whole message read.

        The polite region is also the app's single source of status text: any
        component that wants to say something to a screen reader uses
        `announce()` instead of inventing its own region.
      */}
      <div
        ref={politeRegion}
        className="sahaj-live-region"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="live-region-polite"
      />
      <div
        ref={assertiveRegion}
        className="sahaj-live-region"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        data-testid="live-region-assertive"
      />
    </AccessibilityContext.Provider>
  );
}

/**
 * Access the accessibility engine.
 * Throws when used outside the provider, because a silent fallback would hide a
 * real integration bug (a component that appears to work but ignores settings).
 */
export function useAccessibility(): AccessibilityContextValue {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility must be used inside <AccessibilityProvider>');
  }
  return context;
}
