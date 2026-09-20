'use client';

import { ModuleScaffold } from '@/components/layout/ModuleScaffold';
import { ReadingSurface } from '@/components/reading/ReadingSurface';
import { TouchButton } from '@/components/ui/TouchButton';
import { useAccessibility } from '@/features/a11y/AccessibilityProvider';
import { describeProvenance, useSimplifier } from '@/features/lessons/use-simplifier';

const SAMPLE_LESSON = `A seed is small and hard. It sits in the soil.
When it rains, the seed drinks the water. The sun is warm.
The seed starts to grow. A green shoot pushes up.
Soon two small leaves open in the light.
The plant will make flowers. The flowers make new seeds.`;

const LESSON_TITLE = 'How a seed grows';
const TARGET_GRADE = 2;
/** The lesson's actual vocabulary — the simplifier may define these, never drop them. */
const PRESERVE_TERMS = ['seed', 'soil', 'shoot', 'leaves'];

/**
 * Lessons page (Module 2).
 *
 * The simplification pipeline is wired end to end: the passage is simplified by
 * the API (rule-based offline engine included), readability is shown before and
 * after for teacher transparency, and the karaoke read-aloud works on whichever
 * text is on screen — the learner's accessibility settings apply identically to
 * both variants.
 */
export default function LessonsPage() {
  const { announce } = useAccessibility();
  const simplifier = useSimplifier(SAMPLE_LESSON, TARGET_GRADE, PRESERVE_TERMS);
  const { status, result, keywords, notice, activeText, isSimplified } = simplifier;

  return (
    <ModuleScaffold moduleId="nlp-engine">
      <section aria-labelledby="simplify-heading" className="flex flex-col gap-4">
        <h2 id="simplify-heading" className="text-xl font-semibold text-ink">
          Make the words easier
        </h2>

        <div className="flex flex-wrap gap-3">
          <TouchButton
            variant="primary"
            size="large"
            disabled={status === 'loading'}
            onClick={() => {
              void simplifier.simplify().then(() => announce('Easier words are ready.'));
            }}
          >
            {status === 'loading' ? 'Making it easier…' : 'Make it easier'}
          </TouchButton>

          {result ? (
            <TouchButton variant="secondary" size="large" onClick={simplifier.toggleOriginal}>
              {isSimplified ? 'Show original words' : 'Show easier words'}
            </TouchButton>
          ) : null}
        </div>

        {/* Degraded provenance is a notice, not an error: the offline engine is
            supposed to be here, and a teacher should know which one answered. */}
        {result && isSimplified ? (
          <p className="rounded-[var(--radius-control)] border-2 border-line bg-elevated p-3 text-base text-ink" role="status">
            {describeProvenance(result)}
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-[var(--radius-control)] border-2 border-line bg-elevated p-3 text-base text-ink" role="status">
            {notice}
          </p>
        ) : null}

        {result && isSimplified ? (
          <dl className="grid gap-2 sm:grid-cols-2" aria-label="Reading level before and after">
            <div className="rounded-[var(--radius-control)] border-2 border-line bg-elevated p-3">
              <dt className="text-sm font-semibold text-ink-muted">Reading level before</dt>
              <dd className="text-base text-ink">
                grade {result.readabilityBefore.fleschKincaidGrade}
              </dd>
            </div>
            <div className="rounded-[var(--radius-control)] border-2 border-line bg-elevated p-3">
              <dt className="text-sm font-semibold text-ink-muted">Reading level after</dt>
              <dd className="text-base text-ink">grade {result.readabilityAfter.fleschKincaidGrade}</dd>
            </div>
          </dl>
        ) : null}
      </section>

      <ReadingSurface title={LESSON_TITLE} text={activeText} gradeLevel={TARGET_GRADE} />

      {result && isSimplified && result.glossary.length > 0 ? (
        <section aria-labelledby="glossary-heading" className="flex flex-col gap-3">
          <h2 id="glossary-heading" className="text-xl font-semibold text-ink">
            New words in this lesson
          </h2>
          <ul className="flex flex-col gap-2">
            {result.glossary.map((entry) => (
              <li
                key={entry.term}
                className="rounded-[var(--radius-control)] border-2 border-line bg-elevated p-3"
              >
                <span className="font-semibold text-ink">{entry.term}</span>
                <span className="text-ink"> — {entry.definition}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {keywords && keywords.keywords.length > 0 ? (
        <section aria-labelledby="keywords-heading" className="flex flex-col gap-3">
          <h2 id="keywords-heading" className="text-xl font-semibold text-ink">
            The big ideas in this lesson
          </h2>
          <ul className="flex flex-wrap gap-2">
            {keywords.keywords.map((keyword) => (
              <li
                key={keyword.term}
                className="rounded-full border-2 border-line bg-elevated px-3 py-1 text-base text-ink"
              >
                {keyword.term}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </ModuleScaffold>
  );
}
