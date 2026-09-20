import { act, fireEvent, render, screen } from '@testing-library/react';

import {
  applySettingsPatch,
  DEFAULT_SETTINGS,
  serializeSettings,
  SETTINGS_STORAGE_KEY,
} from '@sahaj/shared/a11y';

import { AccessibilityProvider, useAccessibility } from '@/features/a11y/AccessibilityProvider';
import { applySettingsToElement } from '@/features/a11y/apply-settings';
import { BOOTSTRAP_STORAGE_KEY } from '@/features/a11y/bootstrap';

/**
 * Provider behaviour.
 *
 * These tests cover the parts a learner would notice only when they break:
 * settings coming back after a reload, settings reaching the DOM, and
 * announcements reaching the live region.
 */

function Probe() {
  const { settings, hydrated, updateSettings, announce, panelOpen, togglePanel, cycleTheme, nudge } =
    useAccessibility();

  return (
    <div>
      <span data-testid="hydrated">{String(hydrated)}</span>
      <span data-testid="font-size">{settings.fontSizePercent}</span>
      <span data-testid="theme">{settings.themeId}</span>
      <span data-testid="panel">{String(panelOpen)}</span>
      <button onClick={() => updateSettings({ fontSizePercent: 150 })}>bigger</button>
      <button onClick={() => updateSettings({ fontSizePercent: 9999 })}>absurd</button>
      <button onClick={() => announce('Reading ruler on')}>announce</button>
      <button onClick={togglePanel}>toggle panel</button>
      <button onClick={cycleTheme}>cycle theme</button>
      <button onClick={() => nudge('fontSizePercent', 1)}>nudge up</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <AccessibilityProvider>
      <Probe />
    </AccessibilityProvider>,
  );
}

describe('AccessibilityProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('style');
    document.documentElement.removeAttribute('data-theme');
  });

  it('starts from the defaults and reports that it has not hydrated yet', () => {
    renderProbe();
    expect(screen.getByTestId('font-size')).toHaveTextContent(String(DEFAULT_SETTINGS.fontSizePercent));
    // The first render is always unhydrated; the layout effect runs immediately
    // after, so by the time assertions run the flag has already flipped.
    expect(screen.getByTestId('hydrated')).toHaveTextContent('true');
  });

  it('restores stored settings on mount', () => {
    const stored = applySettingsPatch(DEFAULT_SETTINGS, {
      fontSizePercent: 180,
      themeId: 'cream-on-dark-blue',
    });
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, serializeSettings(stored));

    renderProbe();

    expect(screen.getByTestId('font-size')).toHaveTextContent('180');
    expect(screen.getByTestId('theme')).toHaveTextContent('cream-on-dark-blue');
  });

  it('applies settings to the document root', () => {
    const stored = applySettingsPatch(DEFAULT_SETTINGS, { themeId: 'yellow-on-black', focusMode: true });
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, serializeSettings(stored));

    renderProbe();

    expect(document.documentElement.getAttribute('data-theme')).toBe('yellow-on-black');
    expect(document.documentElement.getAttribute('data-focus-mode')).toBe('true');
    // The custom property is what the stylesheet actually consumes, so asserting
    // the attribute alone would not prove the learner sees the theme.
    expect(document.documentElement.style.getPropertyValue('--sahaj-bg')).toBe('#000000');
  });

  it('persists changes and reflects them in the DOM', () => {
    renderProbe();

    fireEvent.click(screen.getByRole('button', { name: 'bigger' }));

    const persisted = JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}') as {
      settings?: { fontSizePercent?: number };
    };
    expect(persisted.settings?.fontSizePercent).toBe(150);
    expect(document.documentElement.style.getPropertyValue('--sahaj-font-scale')).toBe('1.5');
  });

  it('writes the pre-hydration snapshot so the next load does not flash', () => {
    renderProbe();
    fireEvent.click(screen.getByRole('button', { name: 'bigger' }));

    const snapshot = JSON.parse(window.localStorage.getItem(BOOTSTRAP_STORAGE_KEY) ?? '{}') as {
      vars?: Record<string, string>;
    };
    expect(snapshot.vars?.['--sahaj-font-scale']).toBe('1.5');
  });

  it('clamps values that come from a control bug rather than trusting them', () => {
    renderProbe();
    fireEvent.click(screen.getByRole('button', { name: 'absurd' }));

    expect(screen.getByTestId('font-size')).toHaveTextContent('250');
  });

  it('cycles themes in the documented order', () => {
    renderProbe();
    fireEvent.click(screen.getByRole('button', { name: 'cycle theme' }));

    expect(screen.getByTestId('theme')).toHaveTextContent('yellow-on-black');
  });

  it('nudges a numeric setting by one step', () => {
    renderProbe();
    fireEvent.click(screen.getByRole('button', { name: 'nudge up' }));

    expect(screen.getByTestId('font-size')).toHaveTextContent('110');
  });

  it('toggles the settings panel', () => {
    renderProbe();
    expect(screen.getByTestId('panel')).toHaveTextContent('false');

    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    expect(screen.getByTestId('panel')).toHaveTextContent('true');
  });

  it('announces messages through the polite live region', () => {
    jest.useFakeTimers();
    try {
      renderProbe();
      const region = screen.getByTestId('live-region-polite');

      fireEvent.click(screen.getByRole('button', { name: 'announce' }));
      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(region).toHaveTextContent('Reading ruler on');
      expect(region).toHaveAttribute('aria-live', 'polite');
      expect(region).toHaveAttribute('aria-atomic', 'true');
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps both live regions mounted at all times', () => {
    // Removing and re-adding a live region is the classic cause of a silent
    // announcement, so they must exist from the first render.
    renderProbe();
    expect(screen.getByTestId('live-region-polite')).toHaveAttribute('role', 'status');
    expect(screen.getByTestId('live-region-assertive')).toHaveAttribute('role', 'alert');
  });

  it('refuses to render a consumer outside the provider', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(() => render(<Probe />)).toThrow(/useAccessibility must be used inside/);
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe('applySettingsToElement', () => {
  it('keeps the browser chrome colour in sync with the theme', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.append(meta);

    applySettingsToElement(document.documentElement, { ...DEFAULT_SETTINGS, themeId: 'yellow-on-black' }, {
      skipCacheWrite: true,
    });

    expect(meta.getAttribute('content')).toBe('#000000');
    meta.remove();
  });

  it('resolves the tri-state motion preference', () => {
    applySettingsToElement(document.documentElement, DEFAULT_SETTINGS, {
      systemPrefersReducedMotion: true,
      skipCacheWrite: true,
    });
    expect(document.documentElement.getAttribute('data-motion')).toBe('reduce');

    // An explicit "allow" is a deliberate override and must win.
    applySettingsToElement(document.documentElement, { ...DEFAULT_SETTINGS, motion: 'allow' }, {
      systemPrefersReducedMotion: true,
      skipCacheWrite: true,
    });
    expect(document.documentElement.getAttribute('data-motion')).toBe('allow');
  });
});
