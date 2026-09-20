import { screen, waitFor } from '@testing-library/react';

import { ScreenRuler } from '@/components/a11y/ScreenRuler';
import { renderWithA11y } from '@/test-utils/render';

/**
 * Reading ruler.
 *
 * The ruler is positioned by writing `transform` directly in a
 * `requestAnimationFrame` callback rather than through React state, because at
 * 60 pointer events per second a re-render would visibly lag on a cheap tablet.
 * That makes the frame callback the unit worth testing, so `requestAnimationFrame`
 * is stubbed to run synchronously.
 *
 * The pointer event is dispatched by hand: jsdom has no `PointerEvent`, and the
 * handler only reads `clientY`, so a plain event carrying that property is a more
 * faithful test of the code path than a polyfilled constructor would be.
 */

function movePointerTo(clientY: number): void {
  const event = new Event('pointermove');
  Object.assign(event, { clientY });
  window.dispatchEvent(event);
}

describe('ScreenRuler', () => {
  beforeEach(() => {
    jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders nothing at all when the learner has it switched off', () => {
    renderWithA11y(<ScreenRuler />);
    expect(screen.queryByTestId('screen-ruler')).not.toBeInTheDocument();
  });

  it('is hidden from assistive technology, because the text carries the meaning', () => {
    renderWithA11y(<ScreenRuler />, { settings: { screenRuler: true } });
    expect(screen.getByTestId('screen-ruler')).toHaveAttribute('aria-hidden', 'true');
  });

  it('starts invisible and only appears once a line is tracked', () => {
    renderWithA11y(<ScreenRuler />, { settings: { screenRuler: true, rulerMode: 'pointer' } });
    const band = screen.getByTestId('screen-ruler-band');
    expect(band).toHaveStyle({ opacity: '0' });

    movePointerTo(300);

    expect(band).toHaveStyle({ opacity: '1' });
  });

  it('centres the band on the pointer', () => {
    renderWithA11y(<ScreenRuler />, {
      settings: { screenRuler: true, rulerMode: 'pointer', rulerHeightRem: 2 },
    });

    movePointerTo(300);

    // Height is 2rem = 32px at jsdom's default 16px root; centre 300 → top 284.
    expect(screen.getByTestId('screen-ruler-band').style.transform).toBe('translate3d(0, 284px, 0)');
  });

  it('never scrolls the band off the top of the viewport', () => {
    renderWithA11y(<ScreenRuler />, { settings: { screenRuler: true, rulerMode: 'pointer' } });

    movePointerTo(2);

    expect(screen.getByTestId('screen-ruler-band').style.transform).toBe('translate3d(0, 0px, 0)');
  });

  it('ignores pointer movement when it is set to follow the keyboard only', () => {
    renderWithA11y(<ScreenRuler />, { settings: { screenRuler: true, rulerMode: 'focus' } });

    movePointerTo(300);

    const band = screen.getByTestId('screen-ruler-band');
    expect(band).toHaveStyle({ opacity: '0' });
    expect(band.style.transform).toBe('');
  });

  it('follows keyboard focus when set to focus mode', async () => {
    renderWithA11y(
      <div>
        <button type="button">Target</button>
        <ScreenRuler />
      </div>,
      { settings: { screenRuler: true, rulerMode: 'focus' } },
    );

    screen.getByRole('button', { name: 'Target' }).focus();

    await waitFor(() => {
      expect(screen.getByTestId('screen-ruler-band')).toHaveStyle({ opacity: '1' });
    });
  });

  it('removes its global listeners on unmount', () => {
    const removeEventListener = jest.spyOn(window, 'removeEventListener');
    const { unmount } = renderWithA11y(<ScreenRuler />, {
      settings: { screenRuler: true, rulerMode: 'both' },
    });

    unmount();

    const removed = removeEventListener.mock.calls.map(([type]) => type);
    // A leaked pointermove listener would keep running on every navigation.
    expect(removed).toContain('pointermove');
    expect(removed).toContain('scroll');
    expect(removed).toContain('resize');
  });
});
