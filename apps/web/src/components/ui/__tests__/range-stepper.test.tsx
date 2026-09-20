import { fireEvent, screen } from '@testing-library/react';

import { RangeStepper } from '@/components/ui/RangeStepper';
import { expectNoA11yViolations } from '@/test-utils/a11y';
import { renderWithA11y } from '@/test-utils/render';

/**
 * The adjustable-setting control.
 *
 * The assertions that matter most are about how the value is *spoken*: a range
 * input that only announces "180" leaves a screen-reader user with no idea what
 * they are changing or in which direction. `aria-valuetext` ("180 percent") is
 * the difference between usable and not.
 */

const onValueChange = jest.fn();

function renderStepper(overrides: Partial<React.ComponentProps<typeof RangeStepper>> = {}) {
  const props = {
    label: 'Text size',
    value: 120,
    min: 100,
    max: 250,
    step: 10,
    onValueChange,
    formatValue: (value: number) => `${value}%`,
    describeValue: (value: number) => `${value} percent`,
    increaseLabel: 'Make all text bigger',
    decreaseLabel: 'Make all text smaller',
    hint: 'The whole page grows, including buttons.',
    ...overrides,
  };

  return renderWithA11y(<RangeStepper {...props} />);
}

describe('RangeStepper', () => {
  beforeEach(() => {
    onValueChange.mockClear();
  });

  it('labels the slider and groups it with its nudge buttons', () => {
    renderStepper();

    const slider = screen.getByRole('slider', { name: 'Text size' });
    expect(slider).toHaveAttribute('aria-valuemin', '100');
    expect(slider).toHaveAttribute('aria-valuemax', '250');
    expect(screen.getByRole('group', { name: 'Text size' })).toBeInTheDocument();
  });

  it('announces the value in words, not as a bare number', () => {
    renderStepper();
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '120 percent');
  });

  it('shows the formatted value as output linked to the slider', () => {
    renderStepper();
    const output = screen.getByText('120%');
    expect(output.tagName).toBe('OUTPUT');
    expect(output).toHaveAttribute('for', screen.getByRole('slider').id);
  });

  it('describes the slider with its hint', () => {
    renderStepper();
    const describedBy = screen.getByRole('slider').getAttribute('aria-describedby') ?? '';
    const ids = describedBy.split(' ').filter(Boolean);

    // `aria-describedby` holds ids, not text, and the description lives on the
    // slider rather than the group: announcing it on both would read the same
    // sentence twice as the learner tabs in.
    expect(ids).toHaveLength(1);
    expect(document.getElementById(ids[0]!)?.textContent).toBe(
      'The whole page grows, including buttons.',
    );
  });

  it('omits the description attribute when there is no hint', () => {
    renderStepper({ hint: undefined });
    expect(screen.getByRole('slider')).not.toHaveAttribute('aria-describedby');
  });

  it('reports nudge-button presses distinctly so callers can announce them', () => {
    renderStepper();

    fireEvent.click(screen.getByRole('button', { name: 'Make all text bigger' }));
    expect(onValueChange).toHaveBeenCalledWith(130, 'step');

    fireEvent.click(screen.getByRole('button', { name: 'Make all text smaller' }));
    expect(onValueChange).toHaveBeenCalledWith(110, 'step');
  });

  it('reports slider drags as coming from the slider', () => {
    renderStepper();
    fireEvent.change(screen.getByRole('slider'), { target: { value: '180' } });
    expect(onValueChange).toHaveBeenCalledWith(180, 'slider');
  });

  it('disables the nudge buttons at the bounds', () => {
    const { unmount } = renderStepper({ value: 100 });
    expect(screen.getByRole('button', { name: 'Make all text smaller' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Make all text bigger' })).toBeEnabled();
    unmount();

    renderStepper({ value: 250 });
    expect(screen.getByRole('button', { name: 'Make all text bigger' })).toBeDisabled();
  });

  it('clamps a value typed past the bounds', () => {
    renderStepper();
    fireEvent.change(screen.getByRole('slider'), { target: { value: '9000' } });
    expect(onValueChange).toHaveBeenCalledWith(250, 'slider');
  });

  it('keeps floating-point steps free of rounding dust', () => {
    renderStepper({
      label: 'Space between lines',
      value: 1.7,
      min: 1.5,
      max: 2.5,
      step: 0.1,
      formatValue: (value: number) => `${value.toFixed(1)}x`,
      describeValue: (value: number) => `${value.toFixed(1)} times`,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Make all text bigger' }));
    // Not 1.7999999999999998, which would render as "1.8x" but announce oddly.
    expect(onValueChange).toHaveBeenCalledWith(1.8, 'step');
  });

  it('has no axe violations', async () => {
    const { container } = renderStepper();
    await expectNoA11yViolations(container);
  });
});
