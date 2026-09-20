import { findActiveWordIndex, findWordIndexByOffset, tokenizeWithOffsets } from '@/lib/tokenize';

/**
 * The tokenizer is what keeps the karaoke highlight on the word being spoken.
 * Off-by-one errors here are invisible in a unit test but glaring in a lesson:
 * the highlight lands one word behind and never catches up.
 */

describe('tokenizeWithOffsets', () => {
  it('records exact offsets for every token', () => {
    const source = 'The seed grew.';
    const tokens = tokenizeWithOffsets(source);

    for (const token of tokens) {
      expect(source.slice(token.start, token.end)).toBe(token.text);
    }
  });

  it('separates words from the whitespace between them', () => {
    const tokens = tokenizeWithOffsets('one two');
    expect(tokens.map((token) => [token.text, token.isWord])).toEqual([
      ['one', true],
      [' ', false],
      ['two', true],
    ]);
  });

  it('preserves the original spacing so line breaks survive', () => {
    const tokens = tokenizeWithOffsets('first line\n\nsecond line');
    expect(tokens.map((token) => token.text).join('')).toBe('first line\n\nsecond line');
  });

  it('keeps hyphenated and apostrophised words whole', () => {
    const tokens = tokenizeWithOffsets("well-known don't");
    const words = tokens.filter((token) => token.isWord).map((token) => token.text);
    expect(words).toEqual(['well-known', "don't"]);
  });

  it('returns nothing for empty input', () => {
    expect(tokenizeWithOffsets('')).toEqual([]);
  });
});

describe('findActiveWordIndex', () => {
  const tokens = tokenizeWithOffsets('The seed grew.');

  it('finds the word that starts at the given character', () => {
    // "seed" starts at index 4.
    expect(tokens[findActiveWordIndex(tokens, 4)]?.text).toBe('seed');
  });

  it('finds the word containing a middle offset', () => {
    // Index 6 is inside "seed" (4-8).
    expect(tokens[findActiveWordIndex(tokens, 6)]?.text).toBe('seed');
  });

  it('returns -1 when there is no boundary yet', () => {
    expect(findActiveWordIndex(tokens, null)).toBe(-1);
    expect(findActiveWordIndex(tokens, -1)).toBe(-1);
  });

  it('never returns a whitespace token', () => {
    for (let index = 0; index < 14; index += 1) {
      const token = tokens[findActiveWordIndex(tokens, index)];
      if (token) expect(token.isWord).toBe(true);
    }
  });

  it('clamps an offset past the end to the last word', () => {
    expect(tokens[findActiveWordIndex(tokens, 9999)]?.text).toBe('grew.');
  });
});

describe('findWordIndexByOffset', () => {
  it('matches the boundary behaviour, for the STT path', () => {
    const tokens = tokenizeWithOffsets('A short line');
    expect(tokens[findWordIndexByOffset(tokens, 2)]?.text).toBe('short');
  });
});
