/**
 * Prompt construction for the provider adapter.
 *
 * Prompts are treated as product surface, not strings: the output goes in front
 * of a seven-year-old with a learning difficulty, so the constraints are
 * explicit and non-negotiable, and every one of them exists because of a failure
 * mode observed when a general-purpose instruction is used:
 *
 *  - **Do not add facts.** A model that "helpfully" explains photosynthesis while
 *    simplifying a sentence about a seed introduces vocabulary the lesson has not
 *    taught and can be factually wrong.
 *  - **Do not remove the vocabulary being taught.** The `preserveTerms` contract
 *    is restated in the prompt *and* enforced after the response, because a model
 *    cannot be trusted to follow it every time.
 *  - **One output sentence per input sentence.** This is what makes the "show me
 *    the original" toggle and the per-sentence difficulty analysis possible.
 *  - **JSON only.** Parsed strictly; anything unparseable is treated as a provider
 *    failure so the caller falls back to the offline engine instead of shipping
 *    half-simplified text.
 *  - **No meta-commentary.** Instructions like "Here is the simplified text:" end
 *    up read aloud verbatim by the text-to-speech layer.
 */

export interface SimplifyPromptInput {
  text: string;
  targetGrade: number;
  language: string;
  preserveTerms: readonly string[];
  /** Expected number of sentences, so the model cannot merge or drop them. */
  sentenceCount: number;
}

export interface PromptPair {
  system: string;
  user: string;
}

const SIMPLIFY_SYSTEM = [
  'You rewrite school lessons so that children with dyslexia and other reading difficulties can read them.',
  '',
  'Rules, in priority order:',
  '1. Keep every fact exactly as it is. Never add information, never explain, never give examples.',
  '2. Return exactly one rewritten sentence for each input sentence, in the same order.',
  '3. Use short sentences. Aim for at most 12 words per sentence.',
  '4. Use everyday words a young child already knows. Replace formal vocabulary with plain words.',
  '5. Never change, translate, remove or rename any word listed in "Keep these words exactly".',
  '6. Keep numbers, names, units and scientific terms unchanged.',
  '7. Use active voice. Prefer "The plant makes food" over "Food is made by the plant".',
  '8. Do not add greetings, headings, summaries, bullet points or commentary.',
  '9. Write in the language given by "Language".',
  '',
  'Reply with JSON only, in this exact shape:',
  '{"sentences":[{"original":"<input sentence>","simplified":"<rewritten sentence>"}],',
  ' "glossary":[{"term":"<word from the text>","definition":"<at most 12 words, child friendly>"}]}',
].join('\n');

export function buildSimplifyPrompt(input: SimplifyPromptInput): PromptPair {
  const keepTerms =
    input.preserveTerms.length > 0 ? input.preserveTerms.join(', ') : '(none)';

  return {
    system: SIMPLIFY_SYSTEM,
    user: [
      `Reading level to aim for: grade ${input.targetGrade} (age ${input.targetGrade + 5}).`,
      `Language: ${input.language}.`,
      `Keep these words exactly: ${keepTerms}`,
      `Number of sentences in the text: ${input.sentenceCount}.`,
      '',
      'Text to rewrite:',
      input.text,
    ].join('\n'),
  };
}

export interface KeywordsPromptInput {
  text: string;
  language: string;
  limit: number;
}

const KEYWORDS_SYSTEM = [
  'You find the key concepts in a short school lesson so a teacher can build practice questions.',
  '',
  'Rules:',
  '1. Choose terms that the lesson is actually teaching, not words that merely appear often.',
  '2. Prefer the subject vocabulary a child must learn over general words.',
  '3. Every term must appear in the text.',
  '4. Definitions must be at most 12 words and understandable by a young child.',
  '5. Questions must be answerable from the text alone, and must not be yes/no questions.',
  '6. Do not add commentary.',
  '',
  'Reply with JSON only, in this exact shape:',
  '{"keywords":[{"term":"<term from the text>","weight":<number 0-1>,"definition":"<short definition>"}],',
  ' "questions":["<question>"]}',
].join('\n');

export function buildKeywordsPrompt(input: KeywordsPromptInput): PromptPair {
  return {
    system: KEYWORDS_SYSTEM,
    user: [
      `Language: ${input.language}.`,
      `Return at most ${input.limit} keywords, most important first.`,
      '',
      'Text:',
      input.text,
    ].join('\n'),
  };
}
