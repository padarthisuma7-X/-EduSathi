/**
 * Minimal focus trap.
 *
 * The settings panel overlays lesson content, so while it is open the tab order
 * must not wander into the content behind it — a keyboard-only learner would
 * otherwise tab into invisible-with-respect-to-the-panel controls and lose their
 * place (a WCAG 2.4.3 / 3.2.1 hazard).
 *
 * Deliberately not a dependency: `focus-trap` ships ~700 lines for features we
 * do not need (iframe guards, cross-origin focus, layered traps). This handles
 * the cases that actually occur here, and is unit-tested.
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'audio[controls]',
  'video[controls]',
  'summary',
].join(',');

/** Focusable descendants in DOM order, skipping anything not rendered. */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => isVisible(element) && !element.hasAttribute('inert'),
  );
}

function isVisible(element: HTMLElement): boolean {
  // jsdom reports zero-size boxes for everything, so `getClientRects().length`
  // cannot be used here; `hidden`, `aria-hidden`, and `display:none` via inline
  // style cover the cases the panel actually produces.
  if (element.hidden) return false;
  if (element.getAttribute('aria-hidden') === 'true') return false;
  if (element.closest('[hidden]') !== null) return false;
  return true;
}

/**
 * Traps Tab / Shift+Tab inside `container`.
 * Returns a cleanup function. Does NOT move focus — the caller decides where
 * focus should start, because only it knows which control is most useful.
 */
export function trapFocus(container: HTMLElement): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const focusable = getFocusableElements(container);
    if (focusable.length === 0) {
      // Nothing to focus: keep focus on the container itself.
      event.preventDefault();
      container.focus();
      return;
    }

    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement as HTMLElement | null;

    if (event.shiftKey) {
      if (active === first || active === container || active === null) {
        event.preventDefault();
        last.focus();
      }
      return;
    }

    if (active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  container.addEventListener('keydown', onKeyDown);
  return () => container.removeEventListener('keydown', onKeyDown);
}
