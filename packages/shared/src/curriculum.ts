/**
 * Module registry.
 *
 * Navigation, the home screen, and the docs are all generated from this list, so
 * there is exactly one place that knows which modules are finished. A module
 * flips from `scaffold` to `implemented` here and the UI stops showing the
 * "coming next" treatment automatically.
 */

export type ModuleStatus = 'implemented' | 'scaffold';

export interface LearningModule {
  id: string;
  /** Number shown in the UI, e.g. "Module 1". */
  ordinal: number;
  title: string;
  /** One-sentence purpose, written for a non-technical staff member. */
  purpose: string;
  status: ModuleStatus;
  href: string;
  /** Bullet points shown on the module card. */
  highlights: readonly string[];
  /** WCAG success criteria this module is primarily responsible for. */
  wcagFocus: readonly string[];
}

export const LEARNING_MODULES: readonly LearningModule[] = [
  {
    id: 'accessible-ui',
    ordinal: 1,
    title: 'Accessible UI & navigation',
    purpose: 'Learners reshape the interface to fit how they read and listen.',
    status: 'implemented',
    href: '/accessibility',
    highlights: [
      'Dyslexia controls: OpenDyslexic / Lexend / Atkinson, tracking and leading',
      'Four visual filter themes, all verified at AAA for body text',
      'Reading ruler, zero-distraction mode, enhanced focus ring',
      'Voice-driven navigation with keyboard parity',
    ],
    wcagFocus: ['1.4.3', '1.4.4', '1.4.8', '1.4.12', '2.4.7', '2.5.5', '2.5.8'],
  },
  {
    id: 'nlp-engine',
    ordinal: 2,
    title: 'AI & NLP content engine',
    purpose: 'Content is simplified to the learner’s reading level and read aloud.',
    status: 'implemented',
    href: '/lessons',
    highlights: [
      'Grade-level text simplification with a preserved-term guarantee',
      'Karaoke text-to-speech at 0.5x–1.25x with word timings',
      'Speech-to-text tuned for child speech and regional accents',
      'Rule-based offline fallback for every capability',
    ],
    wcagFocus: ['1.2.1', '1.2.2', '1.4.7'],
  },
  {
    id: 'assessment',
    ordinal: 3,
    title: 'Stress-free assessment',
    purpose: 'Untimed, multimodal practice that never shows a failure screen.',
    status: 'implemented',
    href: '/quizzes',
    highlights: [
      'Visual-first, audio-prompted and voice-answered questions',
      'No timers, no red crosses, unlimited retries',
      'Positive reinforcement through motion, badges and sound-free cues',
      'Adaptive difficulty from latency and error trends',
    ],
    wcagFocus: ['2.2.1', '3.3.1', '3.3.3'],
  },
  {
    id: 'offline-first',
    ordinal: 4,
    title: 'Offline-first runtime',
    purpose: 'Lessons keep working through power and connectivity gaps.',
    status: 'implemented',
    href: '/offline',
    highlights: [
      'Service worker precaching of lessons, fonts and audio',
      'IndexedDB queue with idempotent, ordered replay',
      'Visible sync state so a learner is never blocked by a dead network',
      'Budgeted cache so a 4 GB tablet is not filled by one term of audio',
    ],
    wcagFocus: ['3.2.4', '4.1.3'],
  },
  {
    id: 'progress',
    ordinal: 5,
    title: 'Progress & analytics',
    purpose: 'Learners see growth; teachers see who needs help this week.',
    status: 'implemented',
    href: '/progress',
    highlights: [
      'Learner dashboard: streaks, badges, concept growth',
      'Teacher heatmaps of comprehension and STT accuracy',
      'Intervention flags with evidence and a suggested action',
      'Teacher-only views are announce-safe and never show other learners’ data',
    ],
    wcagFocus: ['1.4.1', '1.4.11'],
  },
];

export function findModule(id: string): LearningModule | undefined {
  return LEARNING_MODULES.find((module) => module.id === id);
}

export const IMPLEMENTED_MODULES: readonly LearningModule[] = LEARNING_MODULES.filter(
  (module) => module.status === 'implemented',
);

export const SCAFFOLD_MODULES: readonly LearningModule[] = LEARNING_MODULES.filter(
  (module) => module.status === 'scaffold',
);
