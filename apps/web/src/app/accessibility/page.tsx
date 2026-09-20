import Link from 'next/link';
import type { Metadata } from 'next';

import {
  formatRatio,
  themeContrastReport,
  THEME_LIST,
  type ThemeDefinition,
} from '@sahaj/shared/a11y';

import { OpenSettingsButton } from '@/components/a11y/OpenSettingsButton';
import { ACCESSIBILITY_HOTKEYS } from '@/features/a11y/hotkeys';
import { VOICE_HELP_COMMANDS } from '@/features/voice/grammar';

export const metadata: Metadata = {
  title: 'Accessibility',
  description: 'Every accessibility control, shortcut and voice command, with the measured contrast of each theme.',
};

/**
 * The accessibility page.
 *
 * Two jobs: it is the learner-facing "here is everything you can change" page,
 * and it is the evidence page for a teacher, therapist or auditor. The contrast
 * table is generated from the same function the test suite asserts on, so it can
 * never claim a ratio that is not actually shipped.
 */
export default function AccessibilityPage() {
  const audits = THEME_LIST.map((theme) => auditTheme(theme));

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-4xl font-bold text-ink">Accessibility</h1>
        <p className="sahaj-prose text-xl text-ink">
          You decide how this place looks and sounds. Nothing you change can break anything, and you can
          always press Reset everything.
        </p>
        <OpenSettingsButton />
      </header>

      <section aria-labelledby="controls-heading" className="flex flex-col gap-4">
        <h2 id="controls-heading" className="text-2xl font-bold text-ink">
          What you can change
        </h2>
        <ul className="grid gap-4 md:grid-cols-2">
          <FeatureCard
            title="Text size and spacing"
            body="Make all the words bigger — up to two and a half times. Add space between lines, letters and words to stop them crowding each other."
          />
          <FeatureCard
            title="Colour themes"
            body="Four checked colour sets, including yellow on black and cream on dark blue. Each one says how strong its contrast is."
          />
          <FeatureCard
            title="Letter style"
            body="Choose OpenDyslexic, Lexend, Atkinson Hyperlegible, Inter, or your device’s own font. Each option is shown in its own lettering."
          />
          <FeatureCard
            title="Reading ruler"
            body="A band that follows your finger, mouse or keyboard so you can keep to one line at a time."
          />
          <FeatureCard
            title="Focus mode"
            body="Hides menus and side panels. Only the lesson stays on screen."
          />
          <FeatureCard
            title="Read aloud"
            body="Each word lights up as it is spoken. Reading speed goes from very slow (0.5×) up to 1.25×, and never faster, so words stay clear."
          />
          <FeatureCard
            title="Voice control"
            body="Hands-free control: say “read this”, “bigger text”, “change colours”, or “stop”."
          />
          <FeatureCard
            title="Less movement"
            body="Turn animation off entirely, or follow your device’s own reduce-motion setting."
          />
        </ul>
      </section>

      <section aria-labelledby="shortcuts-heading" className="flex flex-col gap-4">
        <h2 id="shortcuts-heading" className="text-2xl font-bold text-ink">
          Keyboard shortcuts
        </h2>
        <p className="text-base text-ink">
          Every voice command also works with the keyboard, so nothing depends on a working microphone.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-base text-ink">
            <caption className="mb-2 text-left text-sm text-ink-muted">
              Keys to press, and what happens.
            </caption>
            <thead>
              <tr>
                <th scope="col" className="border-b-2 border-line py-2 pr-4">
                  Keys
                </th>
                <th scope="col" className="border-b-2 border-line py-2">
                  What it does
                </th>
              </tr>
            </thead>
            <tbody>
              {ACCESSIBILITY_HOTKEYS.map((hotkey) => (
                <tr key={hotkey.id}>
                  <th scope="row" className="border-b border-line py-3 pr-4 font-semibold">
                    {hotkey.label}
                  </th>
                  <td className="border-b border-line py-3">{hotkey.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="voice-heading" className="flex flex-col gap-4">
        <h2 id="voice-heading" className="text-2xl font-bold text-ink">
          Things you can say
        </h2>
        <p className="text-base text-ink">
          You do not have to say the words exactly. Close is enough — “reed this” and “big text” both work.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {VOICE_HELP_COMMANDS.map((command) => (
            <li
              key={command.id}
              className="rounded-[var(--radius-control)] border-2 border-line bg-surface px-3 py-2 text-base text-ink"
            >
              {command.example}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="contrast-heading" className="flex flex-col gap-4">
        <h2 id="contrast-heading" className="text-2xl font-bold text-ink">
          Contrast check
        </h2>
        <p className="sahaj-prose text-base text-ink">
          Contrast is how strongly text stands out from its background. WCAG asks for at least 7:1 for
          body text at the highest level, and 3:1 for things like outlines and borders. These numbers are
          measured from the exact colours the app ships, every time the tests run.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-base text-ink">
            <caption className="mb-2 text-left text-sm text-ink-muted">
              Measured contrast per colour theme.
            </caption>
            <thead>
              <tr>
                <th scope="col" className="border-b-2 border-line py-2 pr-4">
                  Theme
                </th>
                <th scope="col" className="border-b-2 border-line py-2 pr-4">
                  Lowest text contrast
                </th>
                <th scope="col" className="border-b-2 border-line py-2 pr-4">
                  Lowest outline contrast
                </th>
                <th scope="col" className="border-b-2 border-line py-2">
                  Result
                </th>
              </tr>
            </thead>
            <tbody>
              {audits.map((audit) => (
                <tr key={audit.id}>
                  <th scope="row" className="border-b border-line py-3 pr-4 font-semibold">
                    {audit.label}
                  </th>
                  <td className="border-b border-line py-3 pr-4">
                    {formatRatio(audit.lowestTextRatio)} ({audit.lowestTextLevel})
                  </td>
                  <td className="border-b border-line py-3 pr-4">
                    {formatRatio(audit.lowestNonTextRatio)}
                  </td>
                  <td className="border-b border-line py-3">
                    {/* Text, not a tick: "Passed" survives forced colors, colour
                        blindness and screen readers. */}
                    {audit.failures.length === 0
                      ? 'Passed'
                      : `${audit.failures.length} check(s) failed: ${audit.failures
                          .map((failure) => failure.pair)
                          .join(', ')}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        aria-labelledby="limits-heading"
        className="rounded-[var(--radius-card)] border-2 border-line bg-surface p-4"
      >
        <h2 id="limits-heading" className="mb-2 text-xl font-semibold text-ink">
          What is verified, and what is not
        </h2>
        <ul className="flex list-disc flex-col gap-2 pl-6 text-base text-ink">
          <li>
            Verified automatically: colour contrast for all four themes, touch-target size, the settings
            model’s bounds, and that every panel control has an accessible name (see{' '}
            <code>docs/ACCESSIBILITY.md</code>).
          </li>
          <li>
            Not yet verified: real screen-reader behaviour (NVDA, TalkBack) and speech-recognition accuracy
            for child speech. Both need testing with learners and their teachers, which no automated check
            can replace.
          </li>
          <li>
            Voice features use the browser’s own engine and run on the device. Where the browser does not
            support them, the buttons and keyboard shortcuts do the same work.
          </li>
        </ul>
        <p className="mt-3 text-base text-ink">
          Want the details? Read <Link href="/offline">how offline works</Link> or{' '}
          <Link href="/progress">how progress is recorded</Link>.
        </p>
      </section>
    </div>
  );
}

interface ThemeAudit {
  id: string;
  label: string;
  lowestTextRatio: number;
  lowestTextLevel: string;
  lowestNonTextRatio: number;
  failures: { pair: string }[];
}

function auditTheme(theme: ThemeDefinition): ThemeAudit {
  const checks = themeContrastReport(theme.id);
  const textChecks = checks.filter((check) => check.required !== 'AA-nontext');
  const nonTextChecks = checks.filter((check) => check.required === 'AA-nontext');

  const lowestText = textChecks.reduce((lowest, check) => (check.ratio < lowest.ratio ? check : lowest));
  const lowestNonText = nonTextChecks.reduce((lowest, check) => (check.ratio < lowest.ratio ? check : lowest));

  return {
    id: theme.id,
    label: theme.label,
    lowestTextRatio: lowestText.ratio,
    lowestTextLevel: lowestText.level,
    lowestNonTextRatio: lowestNonText.ratio,
    failures: checks.filter((check) => !check.passes),
  };
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <li className="flex flex-col gap-1 rounded-[var(--radius-card)] border-2 border-line bg-surface p-4">
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <p className="text-base text-ink">{body}</p>
    </li>
  );
}
