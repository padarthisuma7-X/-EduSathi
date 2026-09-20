/**
 * Joins class names, dropping falsy entries.
 *
 * Deliberately three lines rather than a dependency: the app has no other need
 * for `clsx`-style merging, and `tailwind-merge` conflict resolution is not
 * needed because components expose semantic variants instead of accepting
 * arbitrary conflicting utility overrides.
 */
export type ClassValue = string | false | null | undefined;

export function cx(...values: ClassValue[]): string {
  return values.filter((value): value is string => Boolean(value)).join(' ');
}
