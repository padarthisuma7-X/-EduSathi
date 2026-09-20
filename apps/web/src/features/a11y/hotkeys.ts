/**
 * Keyboard shortcuts.
 *
 * Every accessibility feature is reachable by keyboard *and* by voice, and the
 * two share one command registry (`commands.ts`) so they can never drift apart.
 * Shortcuts deliberately use `Alt` + a letter: `Ctrl`/`Cmd` combos are reserved
 * by browsers and assistive technology, and bare letters would break typing.
 */

export type AccessibilityCommandId =
  | 'toggle-panel'
  | 'toggle-ruler'
  | 'toggle-focus'
  | 'toggle-voice'
  | 'toggle-speech'
  | 'cycle-theme'
  | 'increase-text'
  | 'decrease-text'
  | 'reset-settings';

export interface HotkeyDefinition {
  id: AccessibilityCommandId;
  /** Key code (lowercase, matches `event.key.toLowerCase()`). */
  key: string;
  /** Display form, e.g. "Alt + A". */
  label: string;
  /** Announced to screen readers and shown in the keyboard help list. */
  description: string;
}

export const ACCESSIBILITY_HOTKEYS: readonly HotkeyDefinition[] = [
  {
    id: 'toggle-panel',
    key: 'a',
    label: 'Alt + A',
    description: 'Open or close accessibility settings',
  },
  { id: 'toggle-ruler', key: 'r', label: 'Alt + R', description: 'Turn the reading ruler on or off' },
  { id: 'toggle-focus', key: 'f', label: 'Alt + F', description: 'Turn focus mode on or off' },
  { id: 'toggle-voice', key: 'v', label: 'Alt + V', description: 'Turn voice control on or off' },
  { id: 'toggle-speech', key: 's', label: 'Alt + S', description: 'Turn read-aloud on or off' },
  { id: 'cycle-theme', key: 't', label: 'Alt + T', description: 'Switch to the next colour theme' },
  {
    id: 'increase-text',
    key: '=',
    label: 'Alt + +',
    description: 'Make all text bigger',
  },
  {
    id: 'decrease-text',
    key: '-',
    label: 'Alt + -',
    description: 'Make all text smaller',
  },
  {
    id: 'reset-settings',
    key: '0',
    label: 'Alt + 0',
    description: 'Reset accessibility settings to their defaults',
  },
];

const BY_KEY = new Map<string, HotkeyDefinition[]>();
for (const hotkey of ACCESSIBILITY_HOTKEYS) {
  const existing = BY_KEY.get(hotkey.key) ?? [];
  existing.push(hotkey);
  BY_KEY.set(hotkey.key, existing);
}

/**
 * Resolves a keyboard event to a command.
 *
 * `=` and `+` are the same physical key on most layouts, so both map to
 * "increase text" — a learner who presses the shifted key must not be ignored.
 */
export function resolveHotkey(event: KeyboardEvent): AccessibilityCommandId | null {
  if (!event.altKey || event.ctrlKey || event.metaKey) return null;
  // AltGr on many layouts reports altKey + ctrlKey; already excluded above.
  const raw = event.key.toLowerCase();
  const normalised = raw === '+' || raw === '=' ? '=' : raw === '_' ? '-' : raw;
  const matches = BY_KEY.get(normalised);
  if (!matches || matches.length === 0) return null;
  return matches[0]!.id;
}

/** Shortcut list for the on-screen help, grouped for display. */
export function hotkeyHelpText(id: AccessibilityCommandId): string {
  return ACCESSIBILITY_HOTKEYS.find((hotkey) => hotkey.id === id)?.label ?? '';
}
