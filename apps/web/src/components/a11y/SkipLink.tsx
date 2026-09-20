/**
 * Skip link (WCAG 2.4.1 Bypass Blocks).
 *
 * Must be the first focusable element on the page. The styling lives in
 * `globals.css` as `.sahaj-skip-link` because the "hidden until focused" pattern
 * needs coordinated resets of size, clipping and position — expressed as a single
 * class it is auditable, whereas a chain of `focus:` utilities is where this
 * component quietly breaks.
 */
export function SkipLink({
  href = '#main',
  children = 'Skip to the lesson',
}: {
  href?: string;
  children?: string;
}) {
  return (
    <a href={href} className="sahaj-skip-link">
      {children}
    </a>
  );
}
