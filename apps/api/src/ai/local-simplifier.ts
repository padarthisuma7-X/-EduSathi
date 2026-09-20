/**
 * The offline simplifier.
 *
 * This is not a placeholder for "the real thing". It is the engine that runs in
 * every school without a working connection, and it has one guarantee a language
 * model cannot offer at any price: **it never drops a term the lesson is teaching**.
 * If a rewrite would remove a preserved term, that sentence is reverted and the
 * original is used. Vocabulary coverage beats elegance.
 *
 * What it does, in order:
 *   1. replaces formal vocabulary with everyday equivalents;
 *   2. expands or removes wordy phrases ("in order to" → "to");
 *   3. splits sentences longer than the target reading level allows;
 *   4. verifies preserved terms survived, reverting any sentence where they did not.
 *
 * Limitations, stated plainly: it cannot reorder ideas, explain a concept, or
 * understand a subject. Those need a model, and the `degraded: true` flag on
 * every result exists so the teacher dashboard can say so.
 */

import {
  analyzeReadability,
  splitSentences,
  splitWords,
  type GlossaryEntry,
  type ReadabilityMetrics,
  type SimplifiedSegment,
} from '@sahaj/shared';

/** Everyday replacements for the academic vocabulary that fills textbooks. */
const WORD_SUBSTITUTIONS: Readonly<Record<string, string>> = {
  approximately: 'about',
  additional: 'more',
  advantageous: 'helpful',
  anticipate: 'expect',
  assistance: 'help',
  attempt: 'try',
  commence: 'start',
  comprehensive: 'complete',
  consequently: 'so',
  demonstrate: 'show',
  determine: 'find out',
  difficult: 'hard',
  disclose: 'tell',
  efficient: 'quick',
  elucidate: 'explain',
  employ: 'use',
  encounter: 'meet',
  endeavor: 'try',
  establish: 'set up',
  evaluate: 'check',
  exhibit: 'show',
  facilitate: 'help',
  finalise: 'finish',
  finalize: 'finish',
  frequently: 'often',
  fundamental: 'basic',
  generate: 'make',
  illustrate: 'show',
  implement: 'do',
  indicate: 'show',
  initiate: 'start',
  inquire: 'ask',
  magnitude: 'size',
  maintain: 'keep',
  methodology: 'method',
  modification: 'change',
  numerous: 'many',
  objective: 'goal',
  obtain: 'get',
  optimum: 'best',
  participate: 'take part',
  pertaining: 'about',
  possess: 'have',
  preceding: 'earlier',
  previously: 'before',
  primary: 'main',
  provide: 'give',
  purchase: 'buy',
  regarding: 'about',
  remainder: 'rest',
  require: 'need',
  reside: 'live',
  scrutinise: 'check',
  scrutinize: 'check',
  subsequently: 'then',
  sufficient: 'enough',
  terminate: 'end',
  transmit: 'send',
  utilise: 'use',
  utilize: 'use',
  verification: 'check',
};

/** Multi-word phrases, longest first so "in order to" beats "in" . */
const PHRASE_SUBSTITUTIONS: readonly (readonly [RegExp, string])[] = [
  [/\bwith regard to\b/gi, 'about'],
  [/\bin order to\b/gi, 'to'],
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bfor the purpose of\b/gi, 'to'],
  [/\bin the event that\b/gi, 'if'],
  [/\ba number of\b/gi, 'many'],
  [/\bmake use of\b/gi, 'use'],
  [/\bis able to\b/gi, 'can'],
  [/\bat this point in time\b/gi, 'now'],
  [/\bin spite of the fact that\b/gi, 'although'],
  [/\bit is necessary that\b/gi, 'you must'],
  [/\bon a regular basis\b/gi, 'often'],
  [/\bprior to\b/gi, 'before'],
  [/\bsubsequent to\b/gi, 'after'],
  [/\bin the vicinity of\b/gi, 'near'],
];

/** Definitions for the terms that appear most often in primary-school science. */
const BUILT_IN_GLOSSARY: Readonly<Record<string, string>> = {
  photosynthesis: 'how plants use light to make their own food',
  evaporation: 'when water turns into vapour and goes up into the air',
  condensation: 'when vapour cools down and turns back into water',
  germination: 'when a seed starts to grow',
  habitat: 'the place where a plant or animal lives',
  predator: 'an animal that hunts and eats other animals',
  prey: 'an animal that is hunted and eaten by others',
  ecosystem: 'all the living things in a place, and the place itself',
  gravity: 'the pull that makes things fall down',
  friction: 'the rubbing force that slows things down',
};

export interface LocalSimplifyOptions {
  targetGrade: number;
  preserveTerms?: readonly string[];
  maxWords?: number;
}

export interface LocalSimplifyOutput {
  simplifiedText: string;
  segments: SimplifiedSegment[];
  glossary: GlossaryEntry[];
  readabilityBefore: ReadabilityMetrics;
  readabilityAfter: ReadabilityMetrics;
  /** Rules that were applied, for teacher transparency and debugging. */
  appliedRules: string[];
}

export function simplifyTextOffline(text: string, options: LocalSimplifyOptions): LocalSimplifyOutput {
  const targetGrade = clampGrade(options.targetGrade);
  const preserveTerms = (options.preserveTerms ?? []).map((term) => term.trim()).filter(Boolean);
  const maxWordsPerSentence = maxWordsForGrade(targetGrade);
  const appliedRules = new Set<string>();

  const paragraphs = text.split(/\n{2,}/);
  const segments: SimplifiedSegment[] = [];

  const simplifiedParagraphs = paragraphs.map((paragraph) => {
    const sentences = splitSentences(paragraph);
    if (sentences.length === 0) return '';

    const rewritten = sentences.map((sentence) => {
      const result = simplifySentence(sentence, {
        maxWordsPerSentence,
        preserveTerms,
        appliedRules,
      });
      segments.push({ original: sentence, simplified: result });
      return result;
    });

    return rewritten.join(' ');
  });

  // Metrics are computed from the text that is actually returned, not from an
  // intermediate draft: a teacher comparing before/after must see the numbers
  // for the passage in front of them.
  const joined = postProcess(simplifiedParagraphs.join('\n\n'));
  const finalText = options.maxWords ? trimToWordBudget(joined, options.maxWords) : joined;

  return {
    simplifiedText: finalText,
    segments,
    glossary: buildGlossary(text, finalText, preserveTerms),
    readabilityBefore: analyzeReadability(text),
    readabilityAfter: analyzeReadability(finalText),
    appliedRules: [...appliedRules],
  };
}

interface SentenceOptions {
  maxWordsPerSentence: number;
  preserveTerms: readonly string[];
  appliedRules: Set<string>;
}

function simplifySentence(sentence: string, options: SentenceOptions): string {
  const original = sentence.trim();
  if (original.length === 0) return original;

  let working = original;

  // 1. Wordy phrases first: they contain the single words we replace next.
  for (const [pattern, replacement] of PHRASE_SUBSTITUTIONS) {
    if (pattern.test(working)) {
      working = working.replace(pattern, replacement);
      options.appliedRules.add('shorten-phrase');
    }
  }

  // 2. Single-word substitutions, preserving capitalisation at sentence start.
  working = replaceWords(working, (word) => {
    const key = word.toLowerCase();
    // Never rewrite a term the lesson is teaching.
    if (options.preserveTerms.some((term) => term.toLowerCase() === key)) return word;

    const replacement = lookupReplacement(key);
    if (!replacement) return word;
    options.appliedRules.add('simpler-vocabulary');
    return matchCase(word, replacement);
  });

  // 3. Split over-long sentences at a coordinating boundary near the middle.
  working = splitLongSentence(working, options.maxWordsPerSentence, options.appliedRules);

  // 4. Restore the capital letter. Phrase substitutions are lowercase so that
  //    they read correctly mid-sentence, which loses the capital when the phrase
  //    opened the sentence ("In order to grow" → "to grow").
  if (/^\p{Lu}/u.test(original) && /^\p{Ll}/u.test(working)) {
    working = working.charAt(0).toUpperCase() + working.slice(1);
  }

  // 5. Guarantee: every preserved term still present, or keep the original.
  if (!preservedTermsSurvive(options.preserveTerms, original, working)) {
    options.appliedRules.add('reverted-to-preserve-term');
    return original;
  }

  return working;
}

/**
 * Looks up a simpler word, including the third-person singular form.
 *
 * "requires" and "utilizes" are the forms that actually appear in textbooks, so
 * a plain dictionary lookup would miss most of the substitutions that matter.
 * Only the trailing `-s` is handled: `-ed` and `-ing` forms need part-of-speech
 * knowledge to keep the sentence grammatical ("the plant used sunlight" is
 * correct, but "the plant hard sunlight" is not, and the table mixes verbs with
 * adjectives). Leaving a formal word in place is a much smaller failure than
 * producing broken English a child has to decode.
 */
function lookupReplacement(lowercaseWord: string): string | undefined {
  const direct = WORD_SUBSTITUTIONS[lowercaseWord];
  if (direct) return direct;

  if (lowercaseWord.length > 3 && lowercaseWord.endsWith('s')) {
    const singular = WORD_SUBSTITUTIONS[lowercaseWord.slice(0, -1)];
    if (singular) return `${singular}s`;
  }

  return undefined;
}

function replaceWords(sentence: string, replacer: (word: string) => string): string {
  // Keep punctuation attached by matching word characters only.
  return sentence.replace(/[\p{L}\p{N}’'-]+/gu, (word) => replacer(word));
}

function matchCase(source: string, replacement: string): string {
  if (source.length > 1 && source === source.toUpperCase()) return replacement.toUpperCase();
  if (source[0] === source[0]?.toUpperCase() && /[A-Z]/.test(source[0] ?? '')) {
    return replacement[0]!.toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/**
 * Splits a sentence at a comma, semicolon or coordinating conjunction near the
 * middle. Only one split per pass: over-splitting produces "The plant grew. Up."
 * which is harder to read, not easier.
 */
function splitLongSentence(sentence: string, maxWords: number, appliedRules: Set<string>): string {
  const words = splitWords(sentence);
  if (words.length <= maxWords) return sentence;

  const breakpoints: number[] = [];
  const candidates = [', ', '; ', ' and ', ' but ', ' because ', ' so '];
  for (const candidate of candidates) {
    let index = sentence.indexOf(candidate);
    while (index !== -1) {
      breakpoints.push(index + candidate.length);
      index = sentence.indexOf(candidate, index + 1);
    }
  }

  const midpoint = Math.floor(sentence.length / 2);
  const best = breakpoints
    .filter((index) => index < sentence.length - 12) // never leave a stub
    .sort((a, b) => Math.abs(a - midpoint) - Math.abs(b - midpoint))[0];

  if (best === undefined) return sentence;

  const head = sentence.slice(0, best).trim().replace(/[,;]$/, '');
  const tailRaw = sentence.slice(best).trim();
  if (head.length === 0 || tailRaw.length === 0) return sentence;

  appliedRules.add('split-sentence');
  const tail = tailRaw[0]!.toUpperCase() + tailRaw.slice(1);
  return `${ensureTerminator(head)} ${tail}`;
}

function ensureTerminator(sentence: string): string {
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

function preservedTermsSurvive(
  terms: readonly string[],
  original: string,
  candidate: string,
): boolean {
  if (terms.length === 0) return true;
  const originalLower = original.toLowerCase();
  const candidateLower = candidate.toLowerCase();
  return terms.every((term) => {
    const key = term.toLowerCase();
    // Only enforce terms that were actually in this sentence.
    if (!originalLower.includes(key)) return true;
    return candidateLower.includes(key);
  });
}

function buildGlossary(
  original: string,
  simplified: string,
  preserveTerms: readonly string[],
): GlossaryEntry[] {
  /*
   * Keyed by lowercase form so "Photosynthesis" (found in the text) and
   * "photosynthesis" (listed as a preserved term) produce one entry, not two.
   * First write wins, and preserved terms are written first, so the teacher's
   * spelling is the one a learner sees.
   */
  const candidates = new Map<string, string>();
  for (const term of preserveTerms) {
    const key = term.toLowerCase();
    if (!candidates.has(key)) candidates.set(key, term);
  }

  // Surface the subject vocabulary of the passage even when the caller did not
  // list it, so the reader can define what the lesson is actually about.
  for (const word of splitWords(original)) {
    const key = word.toLowerCase();
    if (BUILT_IN_GLOSSARY[key] && !candidates.has(key)) candidates.set(key, word);
  }

  const simplifiedLower = simplified.toLowerCase();
  return [...candidates].map(([key, term]) => ({
    term,
    // When there is no real definition, say so in the definition itself rather
    // than inventing one: a wrong definition is worse than none for a learner.
    definition: BUILT_IN_GLOSSARY[key] ?? `an important word in this lesson: “${term}”`,
    // -1 means "defined, but not linked to a word in this passage"; the reader
    // shows those in the glossary section only rather than highlighting nothing.
    firstIndex: simplifiedLower.indexOf(key),
  }));
}

function postProcess(text: string): string {
  return text
    .replace(/ {2,}/g, ' ')
    .replace(/ ([.,;:!?])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function trimToWordBudget(text: string, maxWords: number): string {
  const sentences = splitSentences(text);
  const kept: string[] = [];
  let count = 0;
  for (const sentence of sentences) {
    const length = splitWords(sentence).length;
    if (count + length > maxWords && kept.length > 0) break;
    kept.push(sentence);
    count += length;
  }
  return kept.join(' ');
}

function maxWordsForGrade(grade: number): number {
  // Class 2 learners read about 12 words at a time; Class 8 about 18.
  return Math.max(8, Math.min(18, Math.round(grade * 1.6 + 8)));
}

function clampGrade(grade: number): number {
  if (!Number.isFinite(grade)) return 3;
  return Math.min(Math.max(Math.round(grade), 1), 12);
}
