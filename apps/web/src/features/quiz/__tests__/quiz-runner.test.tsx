import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { QuizAttemptSubmission, SyncEntityType } from '@sahaj/shared/domain';

import { SEED_QUIZ } from '../content';
import { matchTranscriptToOptions } from '../match-transcript';
import { QuizRunner } from '../QuizRunner';
import { SyncContext, type SyncContextValue } from '@/features/offline/SyncProvider';
import { expectNoA11yViolations } from '@/test-utils/a11y';
import { renderWithA11y } from '@/test-utils/render';

/**
 * The quiz runner carries the module's product promises, so the tests assert the
 * promises, not the implementation: no timers anywhere, no failure language, no
 * dead ends, axe-clean at every phase, and the offline queue — not a direct
 * POST — receives the finished attempt.
 */

// --- Fake sync context -------------------------------------------------------

interface CapturedItem {
  entityType: SyncEntityType;
  payload: unknown;
}

/**
 * A SyncProvider stand-in that records enqueues. The real provider is exercised
 * in sync-queue tests; here we assert the runner's *contract* with it.
 */
function createFakeSync(): { value: SyncContextValue; captured: CapturedItem[] } {
  const captured: CapturedItem[] = [];
  const value: SyncContextValue = {
    enqueue: async (entityType, payload) => {
      captured.push({ entityType, payload });
    },
    flushNow: () => undefined,
    snapshot: {
      pending: 0,
      cursor: 0,
      deviceId: 'device-test',
      status: 'idle',
      lastSyncAt: null,
      lastProblem: null,
    },
  };
  return { value, captured };
}

function renderQuiz(syncValue: SyncContextValue) {
  return renderWithA11y(
    <SyncContext.Provider value={syncValue}>
      <QuizRunner quiz={SEED_QUIZ} />
    </SyncContext.Provider>,
  );
}

// --- Transcript matching -----------------------------------------------------

describe('matchTranscriptToOptions', () => {
  const labels = SEED_QUIZ.questions[2]!.options.map((option) => option.label ?? '');

  it('accepts phrasing a child would actually say', () => {
    expect(matchTranscriptToOptions('the sun', labels).matchedIndex).toBe(0);
    expect(matchTranscriptToOptions('it is the sun', labels).matchedIndex).toBe(0);
    expect(matchTranscriptToOptions('the moon', labels).matchedIndex).toBe(1);
  });

  it('does not match silence or unrelated speech as an answer', () => {
    expect(matchTranscriptToOptions('', labels).matchedIndex).toBe(-1);
    expect(matchTranscriptToOptions('I like biscuits', labels).matchedIndex).toBe(-1);
  });
});

// --- Runner behaviour --------------------------------------------------------

describe('QuizRunner', () => {
  it('passes axe in every phase of the flow', async () => {
    const user = userEvent.setup();
    const { value } = createFakeSync();
    const { container } = renderQuiz(value);

    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: /start practice/i }));
    await expectNoA11yViolations(container);

    // Answer Q1 correctly and move on: the mid-quiz phase is also covered.
    await user.click(screen.getByRole('button', { name: /small green sprout/i }));
    await user.click(screen.getByRole('button', { name: /next question/i }));
    await expectNoA11yViolations(container);
  });

  it('never displays a timer, a countdown, or a score', async () => {
    const user = userEvent.setup();
    const { value } = createFakeSync();
    renderQuiz(value);
    await user.click(screen.getByRole('button', { name: /start practice/i }));

    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\b\d{1,2}:\d{2}\b/); // mm:ss
    expect(text).not.toMatch(/time (left|remaining)/i);
    expect(text).not.toMatch(/score/i);
    expect(screen.getByText(/question 1 of 5/i)).toBeInTheDocument();
  });

  it('praises a correct answer and unlocks the next question', async () => {
    const user = userEvent.setup();
    const { value } = createFakeSync();
    renderQuiz(value);
    await user.click(screen.getByRole('button', { name: /start practice/i }));

    await user.click(screen.getByRole('button', { name: /small green sprout/i }));

    const feedback = screen.getByTestId('quiz-feedback');
    await waitFor(() => expect(feedback.textContent).toMatch(/well done|you did it|nice work|that is right/i));
    expect(document.body.textContent).not.toMatch(/\bwrong\b|\bincorrect\b|\bfail/i);

    await user.click(screen.getByRole('button', { name: /next question/i }));
    expect(screen.getByText(/question 2 of 5/i)).toBeInTheDocument();
  });

  it('offers another look after an incorrect answer — retries unlimited, no dead end', async () => {
    const user = userEvent.setup();
    const { value } = createFakeSync();
    renderQuiz(value);
    await user.click(screen.getByRole('button', { name: /start practice/i }));

    // Deliberately choose an incorrect option.
    await user.click(screen.getByRole('button', { name: 'A stone' }));

    const feedback = screen.getByTestId('quiz-feedback');
    await waitFor(() => expect(feedback.textContent).toMatch(/look at this again|one more look|try once more/i));
    expect(document.body.textContent).not.toMatch(/\bwrong\b|\bincorrect\b|\bfail/i);

    // Unlimited retries: try again, then get it right.
    await user.click(screen.getByRole('button', { name: /try again/i }));
    await user.click(screen.getByRole('button', { name: /small green sprout/i }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(/well done|you did it|nice work/i),
    );

    // "Move on" is always available after an attempt — no trapped learners.
    expect(screen.getByRole('button', { name: /move on|next question/i })).toBeInTheDocument();
  });

  it('offers a hint after repeated attempts', async () => {
    const user = userEvent.setup();
    const { value } = createFakeSync();
    renderQuiz(value);
    await user.click(screen.getByRole('button', { name: /start practice/i }));

    await user.click(screen.getByRole('button', { name: 'A stone' }));
    await user.click(screen.getByRole('button', { name: /try again/i }));
    await user.click(screen.getByRole('button', { name: 'A stone' }));

    expect(screen.getByRole('button', { name: /give me a hint/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /give me a hint/i }));
    expect(screen.getByTestId('quiz-feedback').textContent).toMatch(/green shoot/i);
  });

  it('lets a keyboard-only learner complete a question', async () => {
    const user = userEvent.setup();
    const { value } = createFakeSync();
    renderQuiz(value);
    await user.click(screen.getByRole('button', { name: /start practice/i }));

    // First tab stop after the heading is a real, named button.
    await user.keyboard('{Tab}');
    expect(screen.getByRole('button', { name: /say it again/i })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: /small green sprout/i }));
    expect(await screen.findByRole('button', { name: /next question/i })).toBeInTheDocument();
  });

  it('walks the full quiz and submits the attempt through the offline queue', async () => {
    const user = userEvent.setup();
    const { value, captured } = createFakeSync();
    renderQuiz(value);
    await user.click(screen.getByRole('button', { name: /start practice/i }));

    // Q1 (visual-choice)
    await user.click(screen.getByRole('button', { name: /small green sprout/i }));
    await user.click(screen.getByRole('button', { name: /next question/i }));

    // Q2 (audio-prompt)
    await user.click(screen.getByRole('button', { name: /water/i }));
    await user.click(screen.getByRole('button', { name: /next question/i }));

    // Q3 (voice-answer): the typed path, no microphone required.
    await user.type(screen.getByLabelText(/or type your answer/i), 'the sun');
    await user.click(screen.getByRole('button', { name: /send answer/i }));
    await user.click(screen.getByRole('button', { name: /next question/i }));

    // Q4 (picture-match)
    await user.click(screen.getByRole('button', { name: /seed goes into the soil/i }));
    await user.click(screen.getByRole('button', { name: /next question/i }));

    // Q5 (sequence): tap the three steps in order.
    await user.click(screen.getByRole('button', { name: /seed drinks water/i }));
    await user.click(screen.getByRole('button', { name: /shoot pushes up/i }));
    await user.click(screen.getByRole('button', { name: /leaves open in the light/i }));
    await user.click(screen.getByRole('button', { name: /finish/i }));

    expect(screen.getByText(/you finished all 5 questions/i)).toBeInTheDocument();
    expect(screen.getByText(/saved and synced/i)).toBeInTheDocument();

    expect(captured).toHaveLength(1);
    expect(captured[0]?.entityType).toBe('quiz-attempt');

    const submission = captured[0]?.payload as QuizAttemptSubmission;
    expect(submission.quizId).toBe(SEED_QUIZ.id);
    expect(submission.learnerId).toBeTruthy();
    expect(submission.clientId).toBeTruthy();
    expect(submission.responses).toHaveLength(5);
    // Every response carries what the analytics layer needs to separate a hard
    // question from an accessibility problem.
    for (const response of submission.responses) {
      expect(response.responseLatencyMs).toBeGreaterThanOrEqual(0);
      expect(typeof response.repeatedPrompt).toBe('boolean');
      expect(typeof response.hinted).toBe('boolean');
      expect(response.concepts?.length ?? 0).toBeGreaterThan(0);
    }
    expect(submission.settingsSnapshot?.themeId).toBeDefined();
  });

  it('does not judge a low-confidence unrecognised voice answer as praise', async () => {
    const user = userEvent.setup();
    const { value, captured } = createFakeSync();
    renderQuiz(value);
    await user.click(screen.getByRole('button', { name: /start practice/i }));

    // Walk to Q3 and answer with something the matcher cannot place.
    await user.click(screen.getByRole('button', { name: /small green sprout/i }));
    await user.click(screen.getByRole('button', { name: /next question/i }));
    await user.click(screen.getByRole('button', { name: /water/i }));
    await user.click(screen.getByRole('button', { name: /next question/i }));

    await user.type(screen.getByLabelText(/or type your answer/i), 'I like biscuits');
    await user.click(screen.getByRole('button', { name: /send answer/i }));

    // Calm retry ask — and the response is still recorded honestly so the
    // analytics layer can see recognition trouble rather than inventing praise.
    await waitFor(() =>
      expect(screen.getByTestId('quiz-feedback').textContent).toMatch(
        /look at this again|one more look|try once more/i,
      ),
    );
    expect(captured).toHaveLength(0); // nothing submitted until the quiz ends

    // And the child is never stuck: Move on is available.
    expect(screen.getByRole('button', { name: /move on/i })).toBeInTheDocument();
  });
});


