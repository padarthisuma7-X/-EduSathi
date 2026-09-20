import { fireEvent, screen, within } from '@testing-library/react';

import { AccessibilityToolbar } from '@/components/a11y/AccessibilityToolbar';
import { expectNoA11yViolations } from '@/test-utils/a11y';
import { renderWithA11y } from '@/test-utils/render';

/**
 * The settings dialog.
 *
 * The most important assertions here are not "does it render" but:
 *  - axe finds no violations in the panel, which is the densest control surface
 *    in the app and the one most likely to regress;
 *  - focus lands on the dialog on open and returns to the launcher on close, so
 *    a keyboard user is never dropped into the page with no idea where they are;
 *  - Escape closes it, which is the one shortcut every screen-reader user tries.
 */

/**
 * The full provider chain is mounted because the panel contains speech and voice
 * controls. That is also the realistic setup, so the test would catch a control
 * that only works when its neighbours happen to be absent.
 */
function renderToolbar() {
  return renderWithA11y(<AccessibilityToolbar />, { full: true });
}

function openPanel(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: /^Accessibility settings/ }));
  return screen.getByRole('dialog');
}

describe('AccessibilityToolbar', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('style');
  });

  it('renders a launcher that is not hidden by focus mode', () => {
    renderToolbar();
    const launcher = screen.getByRole('button', { name: /^Accessibility settings/ });

    // Focus mode hides chrome; the launcher must stay reachable, because it is
    // the only way out of focus mode for a learner who cannot use a shortcut.
    expect(launcher.closest('[data-focus-mode-hide]')).toBeNull();
    expect(launcher).toHaveAttribute('aria-expanded', 'false');
    expect(launcher).toHaveAttribute('aria-controls', 'sahaj-accessibility-panel');
  });

  it('opens a modal dialog labelled by its heading', () => {
    renderToolbar();
    const panel = openPanel();

    expect(panel).toHaveAttribute('aria-modal', 'true');
    expect(panel).toHaveAccessibleName('Accessibility settings');
    expect(screen.getByRole('button', { name: /^Accessibility settings/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('moves focus into the dialog on open', () => {
    renderToolbar();
    const panel = openPanel();
    expect(document.activeElement).toBe(panel);
  });

  it('has no axe violations while open', async () => {
    renderToolbar();
    const panel = openPanel();

    await expectNoA11yViolations(panel);
  });

  it('closes on Escape and returns focus to the launcher', () => {
    renderToolbar();
    const panel = openPanel();

    fireEvent.keyDown(panel, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Accessibility settings/ }));
  });

  it('closes from the Done button', () => {
    renderToolbar();
    const panel = openPanel();

    fireEvent.click(within(panel).getByRole('button', { name: 'Done' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('groups every family of controls under a legend', () => {
    renderToolbar();
    const panel = openPanel();

    for (const legend of [
      'Ready-made set-ups',
      'Letters and lines',
      'Colour theme',
      'Letter style',
      'Seeing and focusing',
      'Listening and speaking',
      'Keyboard shortcuts',
    ]) {
      expect(within(panel).getByRole('group', { name: new RegExp(legend) })).toBeInTheDocument();
    }
  });

  it('shows the keyboard shortcut beside the controls it drives', () => {
    renderToolbar();
    const panel = openPanel();
    // Two toggles advertise Alt+R / Alt+F; the help list repeats them.
    expect(within(panel).getAllByText('Alt + R').length).toBeGreaterThanOrEqual(1);
    expect(within(panel).getAllByText('Alt + F').length).toBeGreaterThanOrEqual(1);
  });

  it('states the word for the state, not only a colour', () => {
    renderToolbar();
    const panel = openPanel();

    const ruler = within(panel).getByRole('switch', { name: /Reading ruler/ });
    expect(ruler).toHaveAttribute('aria-checked', 'false');
    expect(within(ruler).getByText('Off')).toBeInTheDocument();

    fireEvent.click(ruler);
    expect(ruler).toHaveAttribute('aria-checked', 'true');
    expect(within(ruler).getByText('On')).toBeInTheDocument();
  });

  it('reveals the ruler options only when the ruler is on', () => {
    renderToolbar();
    const panel = openPanel();

    expect(within(panel).queryByRole('group', { name: /How the ruler follows you/ })).not.toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('switch', { name: /Reading ruler/ }));

    expect(within(panel).getByRole('group', { name: /How the ruler follows you/ })).toBeInTheDocument();
  });

  it('resets everything and keeps focus inside the dialog', () => {
    renderToolbar();
    const panel = openPanel();

    fireEvent.click(within(panel).getByRole('switch', { name: /Focus mode/ }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Reset everything' }));

    expect(within(panel).getByRole('switch', { name: /Focus mode/ })).toHaveAttribute('aria-checked', 'false');
    // Focus must stay in the dialog: dropping it to the body strands a keyboard
    // user with no visible focus indicator.
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it('counts changed settings in the launcher’s accessible name', () => {
    renderToolbar();
    const panel = openPanel();

    fireEvent.click(within(panel).getByRole('switch', { name: /Focus mode/ }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Done' }));

    // The visible label ("Accessibility") is a prefix of the accessible name, so
    // this does not break WCAG 2.5.3 (Label in Name).
    expect(screen.getByRole('button', { name: /1 settings changed/ })).toBeInTheDocument();
  });

  it('previews link and button styling inside the dialog', () => {
    renderToolbar();
    const panel = openPanel();

    expect(within(panel).getByRole('link', { name: 'A link looks like this' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'A button' })).toBeInTheDocument();
  });
});
