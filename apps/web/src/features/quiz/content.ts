import type { Quiz } from '@sahaj/shared/domain';

/**
 * The seed quiz bank (Module 3).
 *
 * Content lives in one module rather than inline in the component, so that:
 *  - the strings sit in exactly one place to hand a translator later (the app
 *    is built to localize; shipping one language today is a resourcing fact,
 *    not an architecture one);
 *  - questions can be replaced by a server bank without touching the runner,
 *    because they already match the `Quiz` contract in `@sahaj/shared`.
 *
 * Every rule of the module is visible in the data: no `timeLimit` field exists,
 * every wrong option is simply not correct (there is no "trick" metadata), and
 * icon-only options carry `altText` so a screen reader gets the same question
 * a sighted child sees.
 */

/**
 * The lesson this quiz assesses. Sharing the id with the lessons page means the
 * teacher heatmap can join comprehension to the lesson it belongs to.
 */
export const SEED_LESSON_ID = 'lesson-seed-growth';

export const SEED_QUIZ: Quiz = {
  id: 'quiz-seed-growth',
  lessonId: SEED_LESSON_ID,
  title: 'How a seed grows',
  instructions: 'There is no clock here. Take all the time you want. You can try each question as many times as you like.',
  mode: 'practice',
  questions: [
    {
      id: 'q1-seed-picture',
      index: 0,
      kind: 'visual-choice',
      prompt: 'Which picture shows a seed starting to grow?',
      options: [
        { id: 'o1-sprout', label: 'A small green sprout', iconName: '🌱', altText: 'A small green sprout in soil', isCorrect: true },
        { id: 'o1-sun', label: 'The sun', iconName: '☀️', altText: 'The sun', isCorrect: false },
        { id: 'o1-rock', label: 'A stone', iconName: '🪨', altText: 'A grey stone', isCorrect: false },
        { id: 'o1-cloud', label: 'A cloud', iconName: '☁️', altText: 'A cloud in the sky', isCorrect: false },
      ],
      hint: 'A seed starts to grow a little green shoot.',
      concepts: ['germination'],
      promptGrade: 1,
    },
    {
      id: 'q2-what-seed-drinks',
      index: 1,
      kind: 'audio-prompt',
      prompt: 'What does a seed drink when it rains?',
      options: [
        { id: 'o2-water', label: 'Water', isCorrect: true },
        { id: 'o2-sand', label: 'Sand', isCorrect: false },
        { id: 'o2-juice', label: 'Juice', isCorrect: false },
      ],
      hint: 'Think about what falls from the clouds.',
      concepts: ['plant-needs'],
      promptGrade: 1,
    },
    {
      id: 'q3-voice-light',
      index: 2,
      kind: 'voice-answer',
      prompt: 'Say your answer: what gives the plant light to grow?',
      options: [
        { id: 'o3-sun', label: 'the sun', isCorrect: true },
        { id: 'o3-moon', label: 'the moon', isCorrect: false },
        { id: 'o3-stone', label: 'a stone', isCorrect: false },
      ],
      hint: 'It is very bright in the sky in the day.',
      concepts: ['plant-needs'],
      promptGrade: 1,
    },
    {
      id: 'q4-first-step',
      index: 3,
      kind: 'picture-match',
      prompt: 'What happens first, before anything else?',
      options: [
        { id: 'o4-seed', label: 'A seed goes into the soil', iconName: '🌰', altText: 'A seed in soil', isCorrect: true },
        { id: 'o4-flowers', label: 'The plant makes flowers', iconName: '🌸', altText: 'A flower', isCorrect: false },
        { id: 'o4-leaves', label: 'Two leaves open in the light', iconName: '🌿', altText: 'Two small leaves', isCorrect: false },
      ],
      hint: 'Everything starts from something very small and hard.',
      concepts: ['germination', 'plant-growth-order'],
      promptGrade: 2,
    },
    {
      id: 'q5-growth-order',
      index: 4,
      kind: 'sequence',
      prompt: 'Tap the steps in order, from first to last.',
      options: [
        { id: 's1-seed', label: 'The seed drinks water', isCorrect: true },
        { id: 's2-shoot', label: 'A green shoot pushes up', isCorrect: true },
        { id: 's3-leaves', label: 'Two leaves open in the light', isCorrect: true },
      ],
      // For sequence questions every option is a step in the correct order;
      // `isCorrect` marks the *position* order (options are listed first-last).
      hint: 'Rain comes first, then the little green shoot, then the leaves.',
      concepts: ['plant-growth-order'],
      promptGrade: 2,
    },
  ],
};
