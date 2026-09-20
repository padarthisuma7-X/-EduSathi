import {
  applySettingsPatch,
  clampToBounds,
  coerceSettings,
  countActiveAdjustments,
  DEFAULT_SETTINGS,
  isDefaultSettings,
  parseStoredSettings,
  serializeSettings,
  SETTINGS_BOUNDS,
  SETTINGS_PRESETS,
  SETTINGS_VERSION,
} from '@sahaj/shared/a11y';

/**
 * The settings model is the trust boundary for everything a learner has stored
 * on a device. These tests exist because the failure mode is severe: a corrupt
 * or hostile localStorage value that throws during render leaves a child with a
 * blank page and no way to recover.
 */

describe('coerceSettings', () => {
  it('never throws, whatever it is given', () => {
    const inputs: unknown[] = [
      null,
      undefined,
      'not an object',
      42,
      [],
      { fontFamily: 12345 },
      { themeId: 'chartreuse' },
      { lineHeight: 'tall' },
    ];

    for (const input of inputs) {
      expect(() => coerceSettings(input)).not.toThrow();
    }
  });

  it('clamps out-of-range numbers instead of rejecting them', () => {
    const settings = coerceSettings({ fontSizePercent: 9999, lineHeight: 0.1, letterSpacingEm: -5 });

    expect(settings.fontSizePercent).toBe(SETTINGS_BOUNDS.fontSizePercent.max);
    expect(settings.lineHeight).toBe(SETTINGS_BOUNDS.lineHeight.min);
    expect(settings.letterSpacingEm).toBe(SETTINGS_BOUNDS.letterSpacingEm.min);
  });

  it('snaps values to the declared step, removing floating-point dust', () => {
    const settings = coerceSettings({ lineHeight: 1.7000000000000002 });
    expect(settings.lineHeight).toBe(1.7);
  });

  it('accepts numeric strings, which is what range inputs hand back', () => {
    expect(coerceSettings({ fontSizePercent: '180' }).fontSizePercent).toBe(180);
  });

  it('falls back to the default for unknown enumerations', () => {
    const settings = coerceSettings({ fontFamily: 'comic-sans', themeId: 'hotdog-stand' });
    expect(settings.fontFamily).toBe(DEFAULT_SETTINGS.fontFamily);
    expect(settings.themeId).toBe(DEFAULT_SETTINGS.themeId);
  });

  it('drops unknown keys rather than carrying them into state', () => {
    const settings = coerceSettings({ somethingElse: true, fontSizePercent: 120 });
    expect(Object.keys(settings).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });

  it('ignores non-boolean values for switch settings', () => {
    expect(coerceSettings({ focusMode: 'yes' }).focusMode).toBe(DEFAULT_SETTINGS.focusMode);
    expect(coerceSettings({ focusMode: true }).focusMode).toBe(true);
  });
});

describe('bounds', () => {
  it('puts every default value exactly on its step grid', () => {
    /*
     * If a default is not representable by its own step, `clampToBounds` moves it
     * on the first read — so a learner who never touched a control would still
     * see "2 settings changed", and their spacing would shift on first load.
     * This caught exactly that: a 0.05em word-spacing step against a 0.08em default.
     */
    for (const key of Object.keys(SETTINGS_BOUNDS) as (keyof typeof SETTINGS_BOUNDS)[]) {
      expect(clampToBounds(key, DEFAULT_SETTINGS[key])).toBe(DEFAULT_SETTINGS[key]);
    }
  });

  it('keeps the WCAG 1.4.12 text spacing baselines reachable', () => {
    // A learner who needs the criterion's values must be able to reach them.
    expect(clampToBounds('lineHeight', 1.5)).toBe(1.5);
    expect(clampToBounds('letterSpacingEm', 0.12)).toBe(0.12);
    expect(clampToBounds('wordSpacingEm', 0.16)).toBe(0.16);
  });

  it('reaches every declared maximum', () => {
    for (const key of Object.keys(SETTINGS_BOUNDS) as (keyof typeof SETTINGS_BOUNDS)[]) {
      expect(clampToBounds(key, SETTINGS_BOUNDS[key].max)).toBe(SETTINGS_BOUNDS[key].max);
    }
  });

  it('is idempotent: clamping a clamped value changes nothing', () => {
    for (const key of Object.keys(SETTINGS_BOUNDS) as (keyof typeof SETTINGS_BOUNDS)[]) {
      const once = clampToBounds(key, SETTINGS_BOUNDS[key].max);
      expect(clampToBounds(key, once)).toBe(once);
    }
  });
});

describe('clampToBounds', () => {
  it('applies each setting’s own step', () => {
    expect(clampToBounds('fontSizePercent', 117)).toBe(120);
    expect(clampToBounds('letterSpacingEm', 0.123)).toBe(0.12);
    expect(clampToBounds('rulerHeightRem', 2.55)).toBe(2.6);
  });

  it('returns the minimum for NaN rather than poisoning the layout', () => {
    expect(clampToBounds('lineHeight', Number.NaN)).toBe(SETTINGS_BOUNDS.lineHeight.min);
  });
});

describe('persistence', () => {
  it('round-trips through serialize/parse', () => {
    const custom = applySettingsPatch(DEFAULT_SETTINGS, {
      fontSizePercent: 180,
      themeId: 'yellow-on-black',
      fontFamily: 'opendyslexic',
    });

    expect(parseStoredSettings(serializeSettings(custom))).toEqual(custom);
  });

  it('writes a version so older payloads can be migrated', () => {
    const envelope = JSON.parse(serializeSettings(DEFAULT_SETTINGS)) as { version: number };
    expect(envelope.version).toBe(SETTINGS_VERSION);
  });

  it('recovers from truncated JSON (a write killed by a full disk)', () => {
    expect(parseStoredSettings('{"version":2,"settings":{"fontSizePercent":1')).toEqual(DEFAULT_SETTINGS);
  });

  it('upgrades a version 1 payload, which stored settings bare', () => {
    const legacy = JSON.stringify({ fontSizePercent: 150, themeId: 'yellow-on-black' });
    const settings = parseStoredSettings(legacy);
    expect(settings.fontSizePercent).toBe(150);
    expect(settings.themeId).toBe('yellow-on-black');
  });

  it('treats an absent value as defaults', () => {
    expect(parseStoredSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseStoredSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(parseStoredSettings('')).toEqual(DEFAULT_SETTINGS);
  });
});

describe('presets', () => {
  it.each(SETTINGS_PRESETS.map((preset) => [preset.id, preset] as const))(
    'applies "%s" without leaving the allowed bounds',
    (_id, preset) => {
      const applied = applySettingsPatch(DEFAULT_SETTINGS, preset.patch);
      const revalidated = coerceSettings(applied);
      // If a preset contained an out-of-bounds value, coercion would change it.
      expect(revalidated).toEqual(applied);
      expect(countActiveAdjustments(applied)).toBeGreaterThan(0);
    },
  );

  it('has a unique id for every preset', () => {
    const ids = SETTINGS_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('helpers', () => {
  it('detects the default state', () => {
    expect(isDefaultSettings(DEFAULT_SETTINGS)).toBe(true);
    expect(isDefaultSettings(applySettingsPatch(DEFAULT_SETTINGS, { screenRuler: true }))).toBe(false);
  });

  it('counts how many settings differ from the defaults', () => {
    const adjusted = applySettingsPatch(DEFAULT_SETTINGS, { screenRuler: true, fontSizePercent: 150 });
    expect(countActiveAdjustments(adjusted)).toBe(2);
    expect(countActiveAdjustments(DEFAULT_SETTINGS)).toBe(0);
  });

  it('applies a patch immutably', () => {
    const before = { ...DEFAULT_SETTINGS };
    const after = applySettingsPatch(before, { focusMode: true });
    expect(before.focusMode).toBe(false);
    expect(after.focusMode).toBe(true);
  });
});
