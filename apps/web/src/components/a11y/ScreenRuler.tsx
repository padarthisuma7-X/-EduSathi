'use client';

import { useEffect, useRef } from 'react';

import { useAccessibility } from '@/features/a11y/AccessibilityProvider';

/**
 * The reading ruler.
 *
 * A horizontal band that follows the pointer or the keyboard focus, so a learner
 * can hold one line at a time. Position is written straight to `transform` from
 * a `requestAnimationFrame` callback instead of React state: at 60 pointer events
 * per second, re-rendering the tree would drop frames on the cheap tablets this
 * runs on, and a laggy ruler is worse than none.
 *
 * It deliberately does NOT dim or mask the rest of the page. Greying out content
 * lowers its contrast (a WCAG 1.4.3 problem) and some learners find the
 * "spotlight" effect more distracting than helpful. The band alone adds a cue
 * without taking anything away.
 *
 * Everything here is `aria-hidden`: the information it conveys is a visual aid
 * to tracking, and there is no non-visual equivalent that would not be noise.
 */
export function ScreenRuler() {
  const { settings } = useAccessibility();
  const bandRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const hasPosition = useRef(false);

  const { screenRuler, rulerMode, rulerHeightRem } = settings;

  useEffect(() => {
    if (!screenRuler) {
      hasPosition.current = false;
      return;
    }

    const root = document.documentElement;

    /** Height in CSS pixels, honouring the learner's text scale. */
    const bandHeight = (): number => {
      const rootFontSize = Number.parseFloat(getComputedStyle(root).fontSize) || 16;
      return rulerHeightRem * rootFontSize;
    };

    const place = (centreY: number) => {
      const band = bandRef.current;
      if (!band) return;
      const height = bandHeight();
      const top = Math.max(0, Math.min(window.innerHeight - height, centreY - height / 2));
      band.style.transform = `translate3d(0, ${top}px, 0)`;
      band.style.height = `${height}px`;
      if (!hasPosition.current) {
        hasPosition.current = true;
        band.style.opacity = '1';
      }
    };

    // Coalesces bursts of pointer or scroll events into one write per frame.
    const schedule = (getCentreY: () => number) => {
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        place(getCentreY());
      });
    };

    const onPointerMove = (event: PointerEvent) => {
      if (rulerMode !== 'pointer' && rulerMode !== 'both') return;
      schedule(() => event.clientY);
    };

    const onFocusIn = (event: FocusEvent) => {
      if (rulerMode !== 'focus' && rulerMode !== 'both') return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      schedule(() => {
        const rect = target.getBoundingClientRect();
        return rect.top + rect.height / 2;
      });
    };

    const onScrollOrResize = () => {
      // Keep the band aligned with the content it is tracking after scrolling.
      const active = document.activeElement;
      if (rulerMode !== 'focus' && rulerMode !== 'both') return;
      if (!(active instanceof HTMLElement)) return;
      schedule(() => {
        const rect = active.getBoundingClientRect();
        return rect.top + rect.height / 2;
      });
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('focusin', onFocusIn);
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      hasPosition.current = false;
    };
  }, [screenRuler, rulerMode, rulerHeightRem]);

  if (!screenRuler) return null;

  return (
    <div aria-hidden="true" data-testid="screen-ruler" className="pointer-events-none fixed inset-0 z-40">
      <div
        ref={bandRef}
        data-testid="screen-ruler-band"
        className="absolute left-0 right-0 border-y-2"
        style={{
          // `opacity: 0` until the first tracked position, so the band does not
          // appear pinned to the top of the page before the learner moves.
          opacity: 0,
          borderColor: 'var(--sahaj-focus)',
          backgroundColor: 'color-mix(in oklab, var(--sahaj-highlight-bg) 55%, transparent)',
          borderRadius: '0.25rem',
        }}
      />
    </div>
  );
}
