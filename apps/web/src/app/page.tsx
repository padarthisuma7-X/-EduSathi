import { LEARNING_MODULES, PLATFORM } from '@sahaj/shared';

import { ReadingSurface } from '@/components/reading/ReadingSurface';
import { TouchLink } from '@/components/ui/TouchLink';

const WELCOME_TEXT =
  'Welcome. This is your learning place. You can make the words bigger. You can change the colours. You can ask me to read out loud. Press Alt and A to change how things look.';

export default function HomePage() {
  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="welcome-heading" className="flex flex-col gap-4">
        <h1 id="welcome-heading" className="text-4xl font-bold text-ink">
          {PLATFORM.name}
        </h1>
        <p className="sahaj-prose text-xl text-ink">{PLATFORM.tagline}.</p>
        <div className="flex flex-wrap gap-3">
          <TouchLink href="/lessons" variant="primary" size="large">
            Start a lesson
          </TouchLink>
          <TouchLink href="/accessibility" variant="secondary" size="large">
            Change how things look
          </TouchLink>
        </div>
      </section>

      {/*
        The welcome text is a real `ReadingSurface`, not a paragraph: it proves on
        first load that read-aloud, karaoke highlighting and the learner's
        typography settings all work together.
      */}
      <ReadingSurface title="Welcome" text={WELCOME_TEXT} gradeLevel={2} />

      <section aria-labelledby="modules-heading" className="flex flex-col gap-4">
        <h2 id="modules-heading" className="text-2xl font-bold text-ink">
          What is inside
        </h2>
        <ul className="grid gap-4 md:grid-cols-2">
          {LEARNING_MODULES.map((learningModule) => (
            <li
              key={learningModule.id}
              className="flex flex-col gap-3 rounded-[var(--radius-card)] border-2 border-line bg-surface p-4"
            >
              <p className="text-sm font-semibold text-ink-muted">Module {learningModule.ordinal}</p>
              <h3 className="text-xl font-semibold text-ink">{learningModule.title}</h3>
              <p className="text-base text-ink">{learningModule.purpose}</p>
              <p className="w-fit rounded-full border-2 border-line bg-elevated px-3 py-1 text-sm font-medium text-ink">
                {learningModule.status === 'implemented' ? 'Ready to use' : 'Being built'}
              </p>
              <div className="mt-auto">
                {/*
                  The link text names the destination and is unique per module,
                  so a screen-reader user listing links hears "Open module 2:
                  AI and NLP content engine" rather than six identical "Open"s.
                */}
                <TouchLink href={learningModule.href} variant="secondary" block>
                  Open module {learningModule.ordinal}: {learningModule.title}
                </TouchLink>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="help-heading"
        className="rounded-[var(--radius-card)] border-2 border-line bg-surface p-4"
      >
        <h2 id="help-heading" className="mb-2 text-xl font-semibold text-ink">
          Need help?
        </h2>
        <ul className="flex list-disc flex-col gap-1 pl-6 text-base text-ink">
          <li>Press Alt and A to open the accessibility settings.</li>
          <li>Press Alt and V, then say “read this” to have a page read to you.</li>
          <li>Press Alt and R for the reading ruler, Alt and F for focus mode.</li>
          <li>Nothing you do here can be wrong. You can always try again.</li>
        </ul>
      </section>
    </div>
  );
}
