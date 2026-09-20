import type { ReactNode } from 'react';

import { findModule } from '@sahaj/shared';

/**
 * The honest placeholder used by modules that are not built yet.
 *
 * It is not an apology page. Each scaffold states what the module will do, which
 * WCAG success criteria it owns, and what already works today — so a teacher
 * evaluating the platform can see the roadmap without guessing, and a future
 * contributor knows exactly what belongs in this file's folder.
 *
 * Written as a server component: it renders no interactive state.
 */
export function ModuleScaffold({ moduleId, children }: { moduleId: string; children?: ReactNode }) {
  const learningModule = findModule(moduleId);
  if (!learningModule) {
    throw new Error(`ModuleScaffold: unknown module "${moduleId}"`);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-ink-muted">Module {learningModule.ordinal}</p>
        <h1 className="text-3xl font-bold text-ink">{learningModule.title}</h1>
        <p className="sahaj-prose text-lg text-ink">{learningModule.purpose}</p>
        <p className="inline-flex w-fit min-h-12 items-center gap-2 rounded-full border-2 border-line bg-surface px-3 text-base font-medium text-ink">
          <span aria-hidden="true">{learningModule.status === 'implemented' ? '✓' : '◔'}</span>
          {learningModule.status === 'implemented'
            ? 'Live in this build'
            : 'Being built — the accessibility layer it needs is already done'}
        </p>
      </header>

      <section
        aria-labelledby="module-plan-heading"
        className="rounded-[var(--radius-card)] border-2 border-line bg-surface p-4"
      >
        <h2 id="module-plan-heading" className="mb-3 text-xl font-semibold text-ink">
          {learningModule.status === 'implemented' ? 'What this module does' : 'What this module will do'}
        </h2>
        <ul className="flex list-disc flex-col gap-2 pl-6 text-base text-ink">
          {learningModule.highlights.map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="module-wcag-heading" className="flex flex-col gap-3">
        <h2 id="module-wcag-heading" className="text-xl font-semibold text-ink">
          Accessibility it is responsible for
        </h2>
        {/*
          Rendered as plain text, not links. A bare "WCAG 1.4.3" link is a
          meaningless link name out of context (WCAG 2.4.4), and deep-linking
          every criterion would need a mapping table this file has no business
          owning. The mapping lives in docs/ACCESSIBILITY.md, which is the
          document a contributor actually needs.
        */}
        <ul className="flex flex-wrap gap-2">
          {learningModule.wcagFocus.map((criterion) => (
            <li
              key={criterion}
              className="rounded-full border-2 border-line bg-elevated px-3 py-1 text-base text-ink"
            >
              WCAG {criterion}
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink-muted">
          See <code>docs/ACCESSIBILITY.md</code> for what each criterion requires here.
        </p>
      </section>

      {children}
    </div>
  );
}
