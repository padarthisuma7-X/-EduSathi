import { fireEvent } from '@testing-library/dom';

import { getFocusableElements, trapFocus } from '@/lib/focus-trap';

/**
 * Focus trap tests.
 *
 * The trap exists so a keyboard-only learner cannot tab into the lesson content
 * hidden behind the settings dialog. When it breaks, the symptom is not a crash
 * but a learner silently stuck on an invisible control — so it is worth testing
 * directly, including the cases that are easy to get wrong: disabled controls,
 * shift-tab from the first element, and an empty container.
 */

function buildContainer(html: string): HTMLElement {
  document.body.innerHTML = `<div id="panel">${html}</div>`;
  const panel = document.getElementById('panel');
  if (!panel) throw new Error('test setup failed');
  return panel;
}

describe('getFocusableElements', () => {
  it('finds focusable elements in DOM order', () => {
    const panel = buildContainer(`
      <button id="first">First</button>
      <input id="second" type="text" />
      <a id="third" href="#target">Link</a>
    `);

    expect(getFocusableElements(panel).map((element) => element.id)).toEqual(['first', 'second', 'third']);
  });

  it('skips disabled controls, hidden inputs and tabindex="-1"', () => {
    const panel = buildContainer(`
      <button id="enabled">Enabled</button>
      <button id="disabled" disabled>Disabled</button>
      <input id="hidden" type="hidden" />
      <div id="skip" tabindex="-1">Not in the order</div>
    `);

    expect(getFocusableElements(panel).map((element) => element.id)).toEqual(['enabled']);
  });

  it('skips elements hidden with the hidden attribute', () => {
    const panel = buildContainer(`
      <button id="visible">Visible</button>
      <div hidden><button id="hidden-child">Hidden</button></div>
    `);

    expect(getFocusableElements(panel).map((element) => element.id)).toEqual(['visible']);
  });

  it('returns an empty list for a container with no controls', () => {
    const panel = buildContainer('<p>Just text</p>');
    expect(getFocusableElements(panel)).toEqual([]);
  });
});

describe('trapFocus', () => {
  it('wraps forward from the last control to the first', () => {
    const panel = buildContainer(`
      <button id="first">First</button>
      <button id="last">Last</button>
    `);
    const release = trapFocus(panel);
    const last = panel.querySelector<HTMLButtonElement>('#last')!;
    last.focus();

    fireEvent.keyDown(last, { key: 'Tab' });

    expect(document.activeElement?.id).toBe('first');
    release();
  });

  it('wraps backward from the first control to the last', () => {
    const panel = buildContainer(`
      <button id="first">First</button>
      <button id="last">Last</button>
    `);
    const release = trapFocus(panel);
    const first = panel.querySelector<HTMLButtonElement>('#first')!;
    first.focus();

    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });

    expect(document.activeElement?.id).toBe('last');
    release();
  });

  it('leaves Tab alone in the middle of the group', () => {
    const panel = buildContainer(`
      <button id="first">First</button>
      <button id="middle">Middle</button>
      <button id="last">Last</button>
    `);
    const release = trapFocus(panel);
    const middle = panel.querySelector<HTMLButtonElement>('#middle')!;
    middle.focus();

    const event = fireEvent.keyDown(middle, { key: 'Tab' });

    // Not prevented: the browser moves focus to the next element normally.
    expect(event).toBe(true);
    expect(document.activeElement?.id).toBe('middle');
    release();
  });

  it('ignores keys other than Tab', () => {
    const panel = buildContainer('<button id="only">Only</button>');
    const release = trapFocus(panel);
    const only = panel.querySelector<HTMLButtonElement>('#only')!;
    only.focus();

    const event = fireEvent.keyDown(only, { key: 'Escape' });
    expect(event).toBe(true);
    release();
  });

  it('keeps focus on the container when it holds no controls', () => {
    const panel = buildContainer('<p>Nothing to focus</p>');
    panel.tabIndex = -1;
    const release = trapFocus(panel);
    panel.focus();

    fireEvent.keyDown(panel, { key: 'Tab' });

    expect(document.activeElement).toBe(panel);
    release();
  });

  it('stops trapping after release', () => {
    const panel = buildContainer(`
      <button id="first">First</button>
      <button id="last">Last</button>
    `);
    const release = trapFocus(panel);
    release();

    const last = panel.querySelector<HTMLButtonElement>('#last')!;
    last.focus();
    const event = fireEvent.keyDown(last, { key: 'Tab' });

    expect(event).toBe(true);
    expect(document.activeElement?.id).toBe('last');
  });
});
