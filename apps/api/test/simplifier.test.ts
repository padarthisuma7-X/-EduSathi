import { analyzeReadability } from '@sahaj/shared/nlp';
import { describe, expect, it } from 'vitest';

import { simplifyTextOffline } from '../src/ai/local-simplifier';

/**
 * The offline simplifier.
 *
 * Two properties justify this engine existing at all, and both are tested here:
 * it must measurably reduce reading difficulty, and it must never drop a term the
 * lesson is teaching. The second one is the reason a language model is not the
 * only option — a model can be told to preserve vocabulary, but it cannot be
 * *guaranteed* to, whereas this engine reverts a sentence instead.
 */

const GRADE_9_PASSAGE = `Photosynthesis is a fundamental process that plants utilize to
 generate their own food. In order to commence this process, the plant requires
 adequate sunlight, water and carbon dioxide. The chlorophyll that resides within
 the chloroplasts is responsible for the absorption of light energy.
 Subsequently, the plant is able to convert this energy into glucose.`;

describe('simplifyTextOffline', () => {
  it('reduces the reading grade of a difficult passage', () => {
    const result = simplifyTextOffline(GRADE_9_PASSAGE, { targetGrade: 3 });

    expect(result.readabilityBefore.fleschKincaidGrade).toBeGreaterThan(6);
    expect(result.readabilityAfter.fleschKincaidGrade).toBeLessThan(
      result.readabilityBefore.fleschKincaidGrade,
    );
  });

  it('replaces formal vocabulary with everyday words', () => {
    const result = simplifyTextOffline('We must utilize the apparatus to complete the task.', {
      targetGrade: 3,
    });

    expect(result.simplifiedText).toContain('use');
    expect(result.simplifiedText).not.toContain('utilize');
    expect(result.appliedRules).toContain('simpler-vocabulary');
  });

  it('simplifies the third-person form that textbooks actually use', () => {
    const result = simplifyTextOffline('The plant requires water and generates food.', {
      targetGrade: 3,
    });

    // "requires" → "needs", not "need": grammar has to survive the substitution.
    expect(result.simplifiedText).toContain('needs');
    expect(result.simplifiedText).toContain('makes');
  });

  it('leaves -ed and -ing forms alone rather than producing broken English', () => {
    const result = simplifyTextOffline('The plant utilized the light and is generating food.', {
      targetGrade: 3,
    });

    // A formal word left in place is a smaller failure than an ungrammatical one.
    expect(result.simplifiedText).toContain('utilized');
    expect(result.simplifiedText).toContain('generating');
  });

  it('expands wordy phrases', () => {
    const result = simplifyTextOffline('In order to grow, the seed needs water.', { targetGrade: 3 });

    expect(result.simplifiedText).toContain('To grow');
    expect(result.simplifiedText).not.toMatch(/in order to/i);
    expect(result.appliedRules).toContain('shorten-phrase');
  });

  it('never rewrites a term the lesson is teaching', () => {
    // "employ" is in the substitution table, and here it is the subject of the
    // lesson, so the sentence must be left alone rather than simplified.
    const result = simplifyTextOffline('Engineers employ a lever to lift the heavy stone.', {
      targetGrade: 3,
      preserveTerms: ['employ'],
    });

    expect(result.simplifiedText).toContain('employ');
  });

  it('reverts a whole sentence rather than losing a preserved term', () => {
    const result = simplifyTextOffline('Plants utilize water in order to make food.', {
      targetGrade: 2,
      preserveTerms: ['utilize water'],
    });

    expect(result.simplifiedText).toContain('utilize water');
    expect(result.appliedRules).toContain('reverted-to-preserve-term');
  });

  it('splits sentences that are too long for the target grade', () => {
    const long = `The plant needs water and it also needs sunlight, and the leaves collect the light
      so that the plant can make its own food for growing taller every single day.`;

    const result = simplifyTextOffline(long, { targetGrade: 2 });

    expect(result.appliedRules).toContain('split-sentence');
    expect(result.simplifiedText.split('.').length).toBeGreaterThan(2);
  });

  it('keeps one segment per input sentence, so the reader can show the original', () => {
    const result = simplifyTextOffline('First sentence. Second sentence. Third sentence.', {
      targetGrade: 3,
    });

    expect(result.segments).toHaveLength(3);
    expect(result.segments[0]).toEqual({
      original: 'First sentence.',
      simplified: 'First sentence.',
    });
  });

  it('lists a term once even when it appears twice in different cases', () => {
    const result = simplifyTextOffline('Photosynthesis happens in leaves. Plants need photosynthesis.', {
      targetGrade: 3,
      preserveTerms: ['photosynthesis'],
    });

    const matches = result.glossary.filter(
      (entry) => entry.term.toLowerCase() === 'photosynthesis',
    );
    expect(matches).toHaveLength(1);
    // The caller's spelling wins, because it is what the teacher wrote.
    expect(matches[0]!.term).toBe('photosynthesis');
  });

  it('defines the subject vocabulary it can, and marks the rest as a lesson word', () => {
    const result = simplifyTextOffline('Water goes through evaporation and condensation. The xylem carries it.', {
      targetGrade: 3,
      preserveTerms: ['xylem'],
    });

    const terms = result.glossary.map((entry) => entry.term);
    expect(terms).toContain('evaporation');
    expect(terms).toContain('condensation');
    expect(terms).toContain('xylem');

    // A real definition for a word we know...
    expect(result.glossary.find((entry) => entry.term === 'evaporation')?.definition).toMatch(/water/);
    // ...and an honest placeholder rather than an invented one for a word we do not.
    expect(result.glossary.find((entry) => entry.term === 'xylem')?.definition).toContain('important word');
  });

  it('respects a word budget by dropping whole sentences', () => {
    const result = simplifyTextOffline('One two three. Four five six. Seven eight nine.', {
      targetGrade: 3,
      maxWords: 6,
    });

    expect(result.simplifiedText).toBe('One two three. Four five six.');
  });

  it('reports metrics that describe the text it actually returns', () => {
    const result = simplifyTextOffline(GRADE_9_PASSAGE, { targetGrade: 4, maxWords: 30 });

    const expected = analyzeReadability(result.simplifiedText);
    expect(result.readabilityAfter.words).toBe(expected.words);
    expect(result.readabilityAfter.fleschKincaidGrade).toBe(expected.fleschKincaidGrade);
  });

  it('handles empty and whitespace-only input without throwing', () => {
    expect(() => simplifyTextOffline('', { targetGrade: 3 })).not.toThrow();
    expect(simplifyTextOffline('   \n\n  ', { targetGrade: 3 }).simplifiedText).toBe('');
  });

  it('preserves paragraph breaks', () => {
    const result = simplifyTextOffline('First paragraph here.\n\nSecond paragraph here.', {
      targetGrade: 3,
    });

    expect(result.simplifiedText).toContain('\n\n');
  });

  it('is deterministic: the same input always produces the same output', () => {
    const first = simplifyTextOffline(GRADE_9_PASSAGE, { targetGrade: 3 });
    const second = simplifyTextOffline(GRADE_9_PASSAGE, { targetGrade: 3 });

    expect(first.simplifiedText).toBe(second.simplifiedText);
  });
});
