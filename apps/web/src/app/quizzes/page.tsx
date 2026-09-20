import type { Metadata } from 'next';

import { ModuleScaffold } from '@/components/layout/ModuleScaffold';
import { QuizRunner } from '@/features/quiz/QuizRunner';
import { SEED_QUIZ } from '@/features/quiz/content';

export const metadata: Metadata = { title: 'Practice' };

/**
 * Practice page (Module 3).
 *
 * The runner is real: untimed, multimodal, retry-unlimited, and submitted
 * through the offline queue so an answer given in a classroom with no signal is
 * waiting for the network, not lost by it.
 */
export default function QuizzesPage() {
  return (
    <ModuleScaffold moduleId="assessment">
      <QuizRunner quiz={SEED_QUIZ} />
    </ModuleScaffold>
  );
}
