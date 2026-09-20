/**
 * Pre-hydration bootstrapping.
 *
 * The problem: settings live in localStorage, so the server cannot know them.
 * Without help, a learner who reads at 220% with the yellow-on-black theme sees
 * a flash of small grey-on-white text on every navigation — disorienting, and
 * for some learners physically uncomfortable.
 *
 * The fix: keep a *derived cache* of the exact CSS custom properties and
 * `data-*` attributes that the settings engine produces, and replay it from a
 * tiny inline script before the app bundle loads.
 *
 * Why a cache rather than re-deriving in the script: re-deriving would mean
 * shipping the theme token tables and the font stacks inside the inline script,
 * duplicating the single source of truth in `@sahaj/shared`. The cache is
 * produced by `applySettingsToElement`, the same function the running app uses,
 * so the two can never disagree. `bootstrap.test.ts` proves it.
 */

/** Cached, already-resolved values, keyed by CSS custom property / attribute. */
export const BOOTSTRAP_STORAGE_KEY = 'sahaj.a11y.bootstrap';

export interface BootstrapSnapshot {
  vars: Record<string, string>;
  attributes: Record<string, string>;
}

/**
 * Inline script injected in `<head>`. Deliberately ES5-ish and defensive:
 *  - a throw here would blank the page, so everything is wrapped in try/catch;
 *  - private-mode Safari throws on localStorage access, hence the guard;
 *  - only `--sahaj-*` properties are applied, so a tampered cache cannot inject
 *    arbitrary CSS such as a `url()` that phones home.
 */
export const BOOTSTRAP_SCRIPT = `
(function () {
  try {
    var raw = window.localStorage.getItem('${BOOTSTRAP_STORAGE_KEY}');
    if (!raw) return;
    var snapshot = JSON.parse(raw);
    var root = document.documentElement;
    var vars = snapshot && snapshot.vars ? snapshot.vars : {};
    for (var name in vars) {
      if (Object.prototype.hasOwnProperty.call(vars, name) &&
          name.lastIndexOf('--sahaj-', 0) === 0 &&
          typeof vars[name] === 'string') {
        root.style.setProperty(name, vars[name]);
      }
    }
    var attrs = snapshot && snapshot.attributes ? snapshot.attributes : {};
    for (var key in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, key) && typeof attrs[key] === 'string') {
        root.setAttribute('data-' + key, attrs[key]);
      }
    }
  } catch (error) {
    /* First paint must never depend on this succeeding. */
  }
})();
`.trim();

/**
 * Persists the resolved snapshot. Called on every settings change.
 * Never throws — a quota-exceeded tablet must still work, just with one flash.
 */
export function writeBootstrapSnapshot(snapshot: BootstrapSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BOOTSTRAP_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* storage disabled or full: acceptable degradation */
  }
}

export function readBootstrapSnapshot(): BootstrapSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(BOOTSTRAP_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as Partial<BootstrapSnapshot>;
    return {
      vars: candidate.vars ?? {},
      attributes: candidate.attributes ?? {},
    };
  } catch {
    return null;
  }
}

export function clearBootstrapSnapshot(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(BOOTSTRAP_STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}
