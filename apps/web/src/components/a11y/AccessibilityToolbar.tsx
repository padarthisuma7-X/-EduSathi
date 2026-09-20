'use client';

import { useEffect, useRef } from 'react';

import { countActiveAdjustments } from '@sahaj/shared/a11y';

import { useAccessibility } from '@/features/a11y/AccessibilityProvider';
import { ACCESSIBILITY_HOTKEYS } from '@/features/a11y/hotkeys';
import { getFocusableElements, trapFocus } from '@/lib/focus-trap';
import { Fieldset } from '@/components/ui/Fieldset';
import { TouchButton } from '@/components/ui/TouchButton';
import { FontControl } from './controls/FontControl';
import { PresetControl } from './controls/PresetControl';
import { SpeechControls } from './controls/SpeechControls';
import { ThemeControl } from './controls/ThemeControl';
import { TypographyControls } from './controls/TypographyControls';
import { VisualControls } from './controls/VisualControls';

/**
 * The accessibility settings surface (Module 1).
 *
 * Accessibility decisions worth knowing about:
 *
 *  - **Modal dialog.** `role="dialog"` + `aria-modal="true"` + a focus trap,
 *    because the drawer covers lesson content. Without the trap, a keyboard-only
 *    learner tabs into controls they cannot see. The trade-off — not being able
 *    to read the lesson while adjusting — is handled by `PanelPreview` inside the
 *    panel, and by Alt + A / Escape to close at any time.
 *  - **The launcher is never hidden by focus mode.** It is the only way out of
 *    focus mode for a learner who cannot use a keyboard shortcut.
 *  - **The launcher stays visible and 48px** even at 250% text size, because it
 *    is positioned from the viewport edge with a rem-based inset.
 */
export function AccessibilityToolbar() {
  const { panelOpen, closePanel, togglePanel, settings, hydrated, resetSettings, announce } =
    useAccessibility();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const previouslyOpen = useRef(false);

  const activeAdjustments = hydrated ? countActiveAdjustments(settings) : 0;

  // Focus management: move into the dialog on open, trap Tab, close on Escape,
  // and hand focus back to the launcher on close so the learner does not lose
  // their place in the tab order.
  useEffect(() => {
    const panel = panelRef.current;
    if (panelOpen && panel) {
      const release = trapFocus(panel);
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          closePanel();
        }
      };
      panel.addEventListener('keydown', onKeyDown);
      // Focus the dialog container itself first: it is labelled by the heading,
      // so the dialog's name and purpose are announced before the controls.
      panel.focus();
      return () => {
        release();
        panel.removeEventListener('keydown', onKeyDown);
      };
    }

    if (previouslyOpen.current && !panelOpen) {
      launcherRef.current?.focus();
    }
    return undefined;
  }, [panelOpen, closePanel]);

  useEffect(() => {
    previouslyOpen.current = panelOpen;
  }, [panelOpen]);

  return (
    <>
      {/*
        This wrapper deliberately does NOT carry `data-focus-mode-hide`.
        Focus mode hides chrome, and the launcher looks like chrome — but hiding
        it strands any learner who cannot use a keyboard shortcut, with no way
        back. Caught by `accessibility-toolbar.test.tsx`.
      */}
      <div
        className="fixed right-4 top-4 z-50 flex items-center gap-2"
        style={{ insetInlineEnd: 'max(1rem, env(safe-area-inset-right))' }}
      >
        <TouchButton
          ref={launcherRef}
          variant="primary"
          size="large"
          aria-expanded={panelOpen}
          aria-controls="sahaj-accessibility-panel"
          // The visible text "Accessibility" is a prefix of the accessible name,
          // which satisfies WCAG 2.5.3 (Label in Name) while still telling a
          // screen-reader user how many settings differ from the defaults.
          aria-label={
            activeAdjustments === 0
              ? 'Accessibility settings'
              : `Accessibility settings, ${activeAdjustments} settings changed`
          }
          onClick={togglePanel}
        >
          <span aria-hidden="true" className="text-xl leading-none">
            ◍
          </span>
          <span>Accessibility</span>
          {hydrated && activeAdjustments > 0 ? (
            <span
              aria-hidden="true"
              className="rounded-full border border-on-accent px-2 text-sm font-bold"
            >
              {activeAdjustments}
            </span>
          ) : null}
        </TouchButton>
      </div>

      {panelOpen ? (
        <>
          {/* Mouse-only affordance; keyboard users have Escape and the close button. */}
          <div aria-hidden="true" onClick={closePanel} className="fixed inset-0 z-50 bg-black/40" />

          <div
            ref={panelRef}
            id="sahaj-accessibility-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sahaj-accessibility-heading"
            tabIndex={-1}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col overflow-y-auto border-l-2 border-line bg-canvas p-4 shadow-xl"
          >
            <header className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="sahaj-accessibility-heading" className="text-2xl font-bold text-ink">
                  Accessibility settings
                </h2>
                <p className="text-sm text-ink-muted">
                  These settings stay on this device. Nothing is sent anywhere.
                </p>
              </div>
              <TouchButton iconOnly aria-label="Close accessibility settings" onClick={closePanel}>
                <span aria-hidden="true" className="text-2xl leading-none">
                  ×
                </span>
              </TouchButton>
            </header>

            <div className="flex flex-col gap-8 pb-8">
              <PanelPreview />

              <PresetControl />
              <TypographyControls />
              <ThemeControl />
              <FontControl />
              <VisualControls />
              <SpeechControls />

              <Fieldset
                legend="Keyboard shortcuts"
                description="Every voice command also works with the keyboard."
              >
                <ul className="flex flex-col gap-2">
                  {ACCESSIBILITY_HOTKEYS.map((hotkey) => (
                    <li key={hotkey.id} className="flex flex-wrap items-baseline gap-2 text-base text-ink">
                      <kbd className="rounded border-2 border-line bg-surface px-2 py-1 font-sans text-sm font-semibold">
                        {hotkey.label}
                      </kbd>
                      <span>{hotkey.description}</span>
                    </li>
                  ))}
                </ul>
              </Fieldset>

              <div className="flex flex-wrap gap-3 border-t-2 border-line pt-4">
                <TouchButton
                  variant="danger"
                  onClick={() => {
                    resetSettings();
                    announce('All settings reset to their starting values');
                    // Keep focus inside the dialog so the learner is not dropped
                    // back into the page with no idea where they are.
                    const panel = panelRef.current;
                    if (panel) getFocusableElements(panel)[0]?.focus();
                  }}
                >
                  Reset everything
                </TouchButton>
                <TouchButton variant="primary" onClick={closePanel}>
                  Done
                </TouchButton>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

/**
 * In-panel preview.
 *
 * Because the dialog is modal, this is how a learner checks a change without
 * losing their place: it uses the same tokens, the same `.sahaj-prose` rules and
 * a real link and button, so what they see here is what the lesson will look like.
 */
function PanelPreview() {
  const { settings, announce } = useAccessibility();

  return (
    <section
      aria-labelledby="sahaj-preview-heading"
      className="rounded-[var(--radius-card)] border-2 border-line bg-elevated p-4"
    >
      <h3 id="sahaj-preview-heading" className="mb-2 text-lg font-semibold text-ink">
        Preview
      </h3>
      <p className="sahaj-prose mb-3 text-ink">
        The little seed needs water and light. It grows a green shoot.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {/* A demonstration link: it must look real without navigating away
            from the settings the learner is still adjusting. */}
        <a
          href="#sahaj-preview-heading"
          className="text-base"
          onClick={(event) => {
            event.preventDefault();
            announce('This is a preview link. It does not go anywhere.');
          }}
        >
          A link looks like this
        </a>
        <TouchButton variant="primary" onClick={() => announce('This is a preview button')}>
          A button
        </TouchButton>
      </div>
      <p className="mt-3 text-sm text-ink-muted">
        Theme: {settings.themeId.replace(/-/g, ' ')} · Text size {settings.fontSizePercent}%
      </p>
    </section>
  );
}
