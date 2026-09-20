import Link from 'next/link';

export const metadata = { title: 'Page not found' };

/**
 * 404 page.
 *
 * Blame-free wording matters more than usual here: many learners using this
 * platform already associate screens with failure. It also states what to do
 * next rather than only what went wrong (WCAG 3.3.3 Error Suggestion).
 */
export default function NotFound() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold text-ink">This page is not here</h1>
      <p className="sahaj-prose text-lg text-ink">
        The page you asked for may have moved, or the address may have a small mistake in it. Nothing is
        broken, and nothing you did caused this.
      </p>
      <p>
        <Link
          href="/"
          className="sahaj-touch-target rounded-[var(--radius-control)] border-2 border-line bg-elevated px-6 py-3 text-lg font-medium text-ink"
        >
          Go back to the start
        </Link>
      </p>
    </div>
  );
}
