import { readFileSync } from 'node:fs';
import path from 'node:path';

import { fireEvent, screen, within } from '@testing-library/react';

import { AccessibilityToolbar } from '@/components/a11y/AccessibilityToolbar';
import { renderWithA11y } from '@/test-utils/render';

/**
 * Touch target size (WCAG 2.5.5 AAA and 2.5.8 AA).
 *
 * How this is verified, and why:
 *
 * jsdom performs no layout, so `getBoundingClientRect()` returns zeros for every
 * element and a computed-style assertion would prove nothing. Real pixel
 * verification needs a browser test (Playwright), which is listed as a gap in
 * docs/ACCESSIBILITY.md. What *is* checkable here is the enforcement chain the
 * codebase actually relies on:
 *
 *   1. every control carries a class from the documented touch-target set;
 *   2. `globals.css` defines those classes in terms of `--spacing-touch`;
 *   3. `--spacing-touch` is 3rem, which is 48px at the default root font size.
 *
 * Break any link in that chain and the test fails — which is the same failure a
 * pixel test would report, just earlier and with a clearer message.
 */

/**
 * Classes that satisfy the minimum target size.
 *
 * `sahaj-range` is separate from `sahaj-touch-target` because a slider cannot be
 * an inline-flex box: it needs the pseudo-element thumb rules in `globals.css` to
 * enlarge the draggable area. It declares the same 3rem block size there.
 */
const TOUCH_CLASSES = ['sahaj-touch-target', 'min-h-12', 'sahaj-range'];

/**
 * Controls that must meet the minimum. Inline text links are excluded under the
 * WCAG 2.5.8 "inline" exception: a link inside a sentence is exempt, and forcing
 * a 48px box on one would wreck the line spacing the same criterion protects.
 */
const CONTROL_SELECTOR = 'button, [role="switch"], input[type="range"], input[type="radio"], summary';

function hasTouchTarget(element: Element): boolean {
  let node: Element | null = element;
  while (node && node !== document.body) {
    if (TOUCH_CLASSES.some((className) => node!.classList.contains(className))) return true;
    node = node.parentElement;
  }
  return false;
}

function extractRule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) return '';
  return css.slice(start, css.indexOf('}', start));
}

function describeElement(element: Element): string {
  const label =
    element.getAttribute('aria-label') ??
    element.textContent?.trim().slice(0, 40) ??
    element.getAttribute('name') ??
    '(unlabelled)';
  return `${element.tagName.toLowerCase()} "${label}"`;
}

describe('touch targets', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('keeps --spacing-touch at 3rem, which is 48px at the default root size', () => {
    // __tests__ → ui → components → src, then into app/.
    const css = readFileSync(path.join(__dirname, '..', '..', '..', 'app', 'globals.css'), 'utf8');

    expect(css).toContain('--spacing-touch: 3rem;');

    // The classes must consume the token rather than hard-coding a size,
    // otherwise the single point of control is lost.
    const buttonRule = extractRule(css, '.sahaj-touch-target');
    expect(buttonRule).toContain('min-block-size: var(--spacing-touch)');
    expect(buttonRule).toContain('min-inline-size: var(--spacing-touch)');

    const sliderRule = extractRule(css, '.sahaj-range');
    expect(sliderRule).toContain('min-block-size: 3rem');

    // 3rem at a 16px root, and it scales with the learner's text size because it
    // is rem-based rather than px.
    expect(3 * 16).toBe(48);
  });

  it('gives every control in the settings panel a touch target', () => {
    renderWithA11y(<AccessibilityToolbar />, { full: true });
    fireEvent.click(screen.getByRole('button', { name: /^Accessibility settings/ }));

    const panel = screen.getByRole('dialog');
    // The ruler options only appear once the ruler is on, so turn it on to audit
    // the whole control set rather than the default subset.
    fireEvent.click(within(panel).getByRole('switch', { name: /Reading ruler/ }));

    const controls = Array.from(panel.querySelectorAll(CONTROL_SELECTOR));
    expect(controls.length).toBeGreaterThan(20);

    const failures = controls.filter((control) => !hasTouchTarget(control)).map(describeElement);
    expect(failures).toEqual([]);
  });

  it('scales the minimum with the learner’s text size', () => {
    // 3rem, not 48px: a learner at 200% text size gets a 96px target, which is
    // what keeps the requirement true at the zoom levels they actually use.
    const css = readFileSync(path.join(__dirname, '..', '..', '..', 'app', 'globals.css'), 'utf8');
    expect(css).toContain('--spacing-touch: 3rem;');
    expect(css).not.toMatch(/--spacing-touch:\s*\d+px/);
  });

  it('gives every control in the voice dock a touch target', async () => {
    const { VoiceControlDock } = await import('@/components/voice/VoiceControlDock');
    renderWithA11y(<VoiceControlDock />, { full: true });

    const controls = Array.from(
      screen.getByRole('region', { name: 'Voice control' }).querySelectorAll(CONTROL_SELECTOR),
    );

    const failures = controls.filter((control) => !hasTouchTarget(control)).map(describeElement);
    expect(failures).toEqual([]);
  });
});
