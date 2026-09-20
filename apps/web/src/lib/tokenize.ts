/**
 * Tokenizer for karaoke highlighting.
 *
 * The speech engine reports a *character* index at a word boundary, so the
 * reading surface needs the character offsets of every word in the exact string
 * it asked the engine to speak. Whitespace tokens are kept so the original
 * spacing can be reproduced faithfully — re-joining words with single spaces
 * would silently reformat a poem or a list.
 */

export interface TextToken {
  text: string;
  /** Inclusive start offset in the source string. */
  start: number;
  /** Exclusive end offset. */
  end: number;
  /** False for whitespace runs, which cannot be highlighted. */
  isWord: boolean;
}

const TOKEN_PATTERN = /\s+|\S+/g;

export function tokenizeWithOffsets(source: string): TextToken[] {
  const tokens: TextToken[] = [];
  for (const match of source.matchAll(TOKEN_PATTERN)) {
    const text = match[0];
    const start = match.index ?? 0;
    tokens.push({
      text,
      start,
      end: start + text.length,
      isWord: !/^\s+$/.test(text),
    });
  }
  return tokens;
}

/**
 * Index of the word token containing (or immediately preceding) `charIndex`.
 * Returns -1 when there is nothing to highlight, which callers render as "no
 * highlight" rather than guessing.
 */
export function findActiveWordIndex(tokens: readonly TextToken[], charIndex: number | null): number {
  if (charIndex === null || charIndex < 0) return -1;
  let candidate = -1;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (!token.isWord) continue;
    if (token.start <= charIndex) {
      candidate = index;
      continue;
    }
    break;
  }
  return candidate;
}

/**
 * Word index for a transcript offset in a *different* string (used by Module 2's
 * STT path, where the transcript and the lesson text are not identical).
 * Falls back to the last word before the offset, mirroring the boundary logic
 * above.
 */
export function findWordIndexByOffset(tokens: readonly TextToken[], offset: number): number {
  return findActiveWordIndex(tokens, offset);
}
