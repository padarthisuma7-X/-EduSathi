'use client';

import { useEffect, useMemo, useRef } from 'react';

import { normalizeForSpeech } from '@sahaj/shared/nlp';

import { useAccessibility } from '@/features/a11y/AccessibilityProvider';
import { useSpeech } from '@/features/voice/SpeechProvider';
import { findActiveWordIndex, tokenizeWithOffsets } from '@/lib/tokenize';
import { TouchButton } from '@/components/ui/TouchButton';

/**
 * A passage with synchronised read-aloud (Module 2 audio sync, built on the
 * Module 1 accessibility layer).
 *
 * Why the text is tokenised from `normalizeForSpeech(text)` and not from the raw
 * prop: the speech engine receives the normalised string, so its boundary
 * character offsets only line up against that same string. Normalising in both
 * places is what keeps the highlight on the word being spoken instead of drifting
 * a few words ahead — the single most common karaoke bug.
 *
 * Accessibility notes:
 *  - The highlight is a *supplement*. `aria-hidden` is not used on the text, and
 *    the active word keeps full contrast (see `--sahaj-highlight-*` tokens, proven
 *    at AAA in the contrast report), so a learner who cannot perceive the
 *    highlight loses nothing but still has the audio.
 *  - Controls are real buttons with text labels; the state is in the button's own
 *    label ("Read aloud" ↔ "Stop reading"), so no separate status is needed.
 */
export interface ReadingSurfaceProps {
  /** Announced before reading and shown as the heading. */
  title: string;
  text: string;
  /** Reading grade of the passage, shown for teacher transparency. */
  gradeLevel?: number;
}

export function ReadingSurface({ title, text, gradeLevel }: ReadingSurfaceProps) {
  const { settings, announce } = useAccessibility();
  const speech = useSpeech();
  const { registerSpeakTarget, speak, stop } = speech;

  const normalized = useMemo(() => normalizeForSpeech(text), [text]);
  const tokens = useMemo(() => tokenizeWithOffsets(normalized), [normalized]);
  const headingId = `reading-surface-${slugify(title)}`;

  const activeWordIndex = useMemo(
    () => (settings.karaokeHighlight ? findActiveWordIndex(tokens, speech.activeCharIndex) : -1),
    [settings.karaokeHighlight, tokens, speech.activeCharIndex],
  );

  // Register this passage as the target of the "read this" voice command.
  // Depends only on stable callbacks, never on the speech context object, which
  // changes on every state update and would loop.
  useEffect(() => {
    registerSpeakTarget({ text: normalized, label: title });
    return () => registerSpeakTarget(null);
  }, [normalized, title, registerSpeakTarget]);

  // Auto-read once per passage when the learner has asked for it.
  const autoRead = useRef(false);
  useEffect(() => {
    if (autoRead.current) return;
    if (!settings.speechAutoRead || !speech.supported) return;
    autoRead.current = true;
    speak(normalized, { label: title });
  }, [settings.speechAutoRead, normalized, speak, speech.supported, title]);

  // Stop reading when the learner navigates away: a voice that keeps talking
  // after the content has gone is disorienting.
  useEffect(() => () => stop(), [stop]);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} className="text-2xl font-bold text-ink">
          {title}
        </h2>
        {typeof gradeLevel === 'number' ? (
          <p className="text-sm text-ink-muted">Reading level {gradeLevel}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        {speech.speaking ? (
          <TouchButton
            variant="primary"
            size="large"
            onClick={() => {
              stop();
              announce('Stopped reading');
            }}
          >
            Stop reading
          </TouchButton>
        ) : (
          <TouchButton
            variant="primary"
            size="large"
            disabled={!speech.supported}
            onClick={() => {
              speak(normalized, { label: title });
              announce(`Reading ${title}`);
            }}
          >
            Read aloud
          </TouchButton>
        )}

        <TouchButton
          variant="secondary"
          size="large"
          disabled={!speech.supported}
          onClick={() => {
            speak(normalized, { label: title });
            announce(`Reading ${title} again`);
          }}
        >
          Read again
        </TouchButton>
      </div>

      <p className="sahaj-prose text-lg text-ink">
        {tokens.map((token, index) => {
          if (!token.isWord) {
            // Whitespace is rendered as-is so line breaks and indentation of the
            // original passage survive tokenisation.
            return <span key={`space-${token.start}`}>{token.text}</span>;
          }
          const isActive = index === activeWordIndex;
          return (
            <span
              key={`word-${token.start}`}
              className={isActive ? 'sahaj-word-active' : undefined}
              data-active={isActive ? 'true' : undefined}
            >
              {token.text}
            </span>
          );
        })}
      </p>
    </section>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
