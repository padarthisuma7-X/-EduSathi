import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

import { AccessibilityProvider, useAccessibility } from '@/features/a11y/AccessibilityProvider';
import { useAppCommands } from '@/features/commands/use-app-commands';
import { SpeechProvider } from '@/features/voice/SpeechProvider';

/**
 * The command dispatcher.
 *
 * This is the single place that keyboard shortcuts and voice commands both go
 * through (WCAG 2.1.1: nothing may be voice-only). These tests assert the two
 * properties that make that worthwhile:
 *  - a command changes the setting it claims to change;
 *  - it reports back a message describing the *new state*, which is what the
 *    live region announces, and returns `ok: false` when it did nothing.
 */

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AccessibilityProvider>
      <SpeechProvider>{children}</SpeechProvider>
    </AccessibilityProvider>
  );
}

function useHarness() {
  return { run: useAppCommands(), a11y: useAccessibility() };
}

function renderHarness() {
  return renderHook(() => useHarness(), { wrapper });
}

describe('useAppCommands', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('style');
  });

  it('turns the reading ruler on and reports the new state', () => {
    const { result } = renderHarness();

    let outcome: { ok: boolean; message: string } | undefined;
    act(() => {
      outcome = result.current.run('toggle-ruler');
    });

    expect(outcome).toEqual({ ok: true, message: 'Reading ruler on' });
    expect(result.current.a11y.settings.screenRuler).toBe(true);
  });

  it('toggles back off on a second press', () => {
    const { result } = renderHarness();

    /*
     * Each command runs in its own `act`, which is not test ceremony: a command
     * reads the settings value it was created with, so calling two in the same
     * tick would apply both against the same snapshot. Real input cannot do that
     * — every keydown and every recognised phrase is followed by a render — but
     * it is worth being explicit that this is the contract.
     */
    act(() => {
      result.current.run('toggle-ruler');
    });
    act(() => {
      result.current.run('toggle-ruler');
    });

    expect(result.current.a11y.settings.screenRuler).toBe(false);
  });

  it('steps text size and names the resulting size', () => {
    const { result } = renderHarness();

    act(() => {
      result.current.run('increase-text');
    });

    expect(result.current.a11y.settings.fontSizePercent).toBe(110);
    expect(result.current.run('increase-text').message).toBe('Text size 120 percent');
  });

  it('does not exceed the maximum text size', () => {
    const { result } = renderHarness();

    for (let index = 0; index < 30; index += 1) {
      act(() => {
        result.current.run('increase-text');
      });
    }

    expect(result.current.a11y.settings.fontSizePercent).toBe(250);
  });

  it('cycles through every theme and back to the start', () => {
    const { result } = renderHarness();
    const seen: string[] = [];

    for (let index = 0; index < 4; index += 1) {
      act(() => {
        result.current.run('cycle-theme');
      });
      seen.push(result.current.a11y.settings.themeId);
    }

    expect(new Set(seen).size).toBe(4);
    expect(seen[3]).toBe('calm');
  });

  it('opens and closes the settings panel', () => {
    const { result } = renderHarness();

    act(() => {
      result.current.run('toggle-panel');
    });
    expect(result.current.a11y.panelOpen).toBe(true);

    act(() => {
      result.current.run('close-panel');
    });
    expect(result.current.a11y.panelOpen).toBe(false);
  });

  it('reports a no-op command rather than announcing a false success', () => {
    const { result } = renderHarness();

    const outcome = result.current.run('close-panel');

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toBe('Settings are already closed');
  });

  it('resets every setting', () => {
    const { result } = renderHarness();

    for (const command of ['toggle-ruler', 'toggle-focus', 'increase-text'] as const) {
      act(() => {
        result.current.run(command);
      });
    }
    act(() => {
      result.current.run('reset-settings');
    });

    expect(result.current.a11y.isDefault).toBe(true);
  });

  it('explains that there is nothing to read when no passage is registered', () => {
    const { result } = renderHarness();

    const outcome = result.current.run('speak-current');

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/nothing to read/i);
  });

  it('lists what it can do when asked for help', () => {
    const { result } = renderHarness();

    const outcome = result.current.run('help');

    expect(outcome.ok).toBe(true);
    expect(outcome.message).toContain('read this');
  });

  it('stops speech on request, and says so when it was not speaking', () => {
    const { result } = renderHarness();

    const outcome = result.current.run('stop-speaking');

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/not reading/i);
  });
});
