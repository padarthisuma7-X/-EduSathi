'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  Quiz,
  QuizOption,
  QuizQuestion,
  QuizResponseInput,
} from '@sahaj/shared/domain';

import { useAccessibility } from '@/features/a11y/AccessibilityProvider';
import { useSync } from '@/features/offline/SyncProvider';
import { useSpeech } from '@/features/voice/SpeechProvider';
import { useSpeechRecognition, describeRecognitionError } from '@/features/voice/use-speech-recognition';
import { getLearnerId } from '@/lib/device';
import { TouchButton } from '@/components/ui/TouchButton';
import { matchTranscriptToOptions } from './match-transcript';

/**
 * QuizRunner (Module 3).
 *
 * The product rules are structural, not aspirational — each one is enforced
 * somewhere in this file, and the tests assert them:
 *
 *  - **No timers.** Nothing renders `suggestedPaceMs`; it is recorded in the
 *    type for analytics pacing only. `responseLatencyMs` is measured, never
 *    displayed, and never compared against anything.
 *  - **No failure screens.** A wrong answer produces "let's look at this
 *    again" plus a hint path — same layout, same colours, no red, no ✗. The
 *    word "wrong" never appears in feedback text.
 *  - **Unlimited retries.** "Try again" resets the attempt, re-speaks audio
 *    prompts, and can be used forever. "Move on" is always available after an
 *    attempt, so no child is ever trapped in a question.
 *  - **Positive reinforcement.** Correct answers get calm, varied praise with
 *    a soft motion cue (disabled under reduced-motion — see globals.css).
 *  - **Nothing is voice-only.** Every voice question has a typed path with the
 *    same judgement logic (WCAG 1.2.6 / 2.1.1 spirit: multimodal, not
 *    mandatory-modality).
 *  - **Local-first submission.** The attempt is enqueued in the offline queue,
 *    not POSTed directly: the tablet can be offline the moment a child taps
 *    the last answer and nothing is lost.
 */

interface QuizRunnerProps {
  quiz: Quiz;
}

type Feedback = { tone: 'celebrate' | 'retry'; text: string } | null;

const PRAISE = ['Well done!', 'You did it!', 'Nice work!', 'That is right!'];
const RETRY_LINES = ['Let’s look at this again.', 'Almost — one more look.', 'Let’s try once more.'];

/** Confidence below which the STT layer asks for a gentle re-prompt. */
const LOW_CONFIDENCE = 0.55;

export function QuizRunner({ quiz }: QuizRunnerProps) {
  const { settings, announce } = useAccessibility();
  const speech = useSpeech();
  const sync = useSync();

  const [phase, setPhase] = useState<'instructions' | 'question' | 'complete'>('instructions');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [hintShown, setHintShown] = useState(false);
  const [repeatedSincePrompt, setRepeatedSincePrompt] = useState(false);
  const [sequencePicks, setSequencePicks] = useState<string[]>([]);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [submissionState, setSubmissionState] = useState<'saved' | 'error'>('saved');

  const responses = useRef<QuizResponseInput[]>([]);
  const promptShownAt = useRef<number>(Date.now());
  const startedAt = useRef<string>('');
  const questionHeading = useRef<HTMLHeadingElement>(null);

  const question = quiz.questions[questionIndex] as QuizQuestion;

  const speakPrompt = useCallback(
    (target: QuizQuestion) => {
      if (!speech.supported) return;
      speech.speak(target.prompt, { label: quiz.title });
    },
    [quiz.title, speech],
  );

  const showQuestion = useCallback(
    (target: QuizQuestion) => {
      promptShownAt.current = Date.now();
      setRepeatedSincePrompt(false);
      setFeedback(null);
      setHintShown(false);
      setSequencePicks([]);
      setTypedAnswer('');
      if (target.kind === 'audio-prompt') {
        // Audio-first questions speak once automatically; every kind gets a
        // "Say it again" button, so nothing is ever lost to a noisy room.
        speakPrompt(target);
      }
    },
    [speakPrompt],
  );

  useEffect(() => {
    if (phase === 'question') {
      // Focus after render so the heading is in the DOM and the next Tab key
      // lands on the first meaningful action, not on a later answer button.
      questionHeading.current?.focus();
    }
  }, [phase, questionIndex]);

  const start = useCallback(() => {
    startedAt.current = new Date().toISOString();
    responses.current = [];
    setQuestionIndex(0);
    setPhase('question');
    showQuestion(quiz.questions[0] as QuizQuestion);
  }, [quiz.questions, showQuestion]);

  const recordResponse = useCallback(
    (response: QuizResponseInput) => {
      responses.current.push(response);
    },
    [],
  );

  const finish = useCallback(async () => {
    setPhase('complete');
    announce('Practice round finished. Well done.');
    try {
      await sync.enqueue('quiz-attempt', {
        clientId: generateClientId(),
        quizId: quiz.id,
        learnerId: getLearnerId(),
        startedAt: startedAt.current,
        completedAt: new Date().toISOString(),
        responses: responses.current,
        // Only the settings that change *how* a child experiences the questions
        // travel with the attempt — enough for the analytics layer to separate
        // "hard question" from "the ruler was covering half the screen".
        settingsSnapshot: {
          themeId: settings.themeId,
          fontSizePercent: settings.fontSizePercent,
          lineHeight: settings.lineHeight,
          fontFamily: settings.fontFamily,
          screenRuler: settings.screenRuler,
          focusMode: settings.focusMode,
          speechRate: settings.speechRate,
          karaokeHighlight: settings.karaokeHighlight,
        },
      });
      setSubmissionState('saved');
    } catch {
      // Storage itself failed (private mode, quota). The round still completed;
      // say so honestly rather than pretending it synced.
      setSubmissionState('error');
    }
  }, [announce, quiz.id, settings, sync]);

  const advance = useCallback(() => {
    const next = questionIndex + 1;
    if (next < quiz.questions.length) {
      setQuestionIndex(next);
      showQuestion(quiz.questions[next] as QuizQuestion);
      announce(`Question ${next + 1} of ${quiz.questions.length}`);
    } else {
      void finish();
    }
  }, [announce, finish, questionIndex, quiz.questions.length, showQuestion]);

  const praise = useCallback(
    (attemptCount: number) => {
      const text = PRAISE[attemptCount % PRAISE.length] ?? 'Well done!';
      setFeedback({ tone: 'celebrate', text });
      announce(text);
    },
    [announce],
  );

  const askRetry = useCallback(
    (attemptCount: number) => {
      const text = `${RETRY_LINES[attemptCount % RETRY_LINES.length]} You can try again, or move on.`;
      setFeedback({ tone: 'retry', text });
      announce(text);
    },
    [announce],
  );

  /** Judges one judged attempt (choice, picture-match, or a final sequence). */
  const judgeChoice = useCallback(
    (option: QuizOption, judgedSequence: boolean) => {
      const latency = Date.now() - promptShownAt.current;
      recordResponse({
        questionId: question.id,
        optionId: option.id,
        responseLatencyMs: latency,
        repeatedPrompt: repeatedSincePrompt,
        hinted: hintShown,
        correct: option.isCorrect,
        concepts: question.concepts,
      });
      if (option.isCorrect) {
        praise(responses.current.filter((entry) => entry.questionId === question.id).length - 1);
      } else if (judgedSequence) {
        // Sequence mis-orders get their own gentler line: the task was harder.
        setFeedback({ tone: 'retry', text: 'Not quite that order. Let’s walk it again together.' });
        announce('Not quite that order. Let’s walk it again together.');
      } else {
        askRetry(responses.current.filter((entry) => entry.questionId === question.id).length - 1);
      }
    },
    [askRetry, hintShown, praise, question, recordResponse, repeatedSincePrompt],
  );

  const judgeTranscript = useCallback(
    (transcript: string, confidence: number) => {
      const latency = Date.now() - promptShownAt.current;
      const labels = question.options.map((option) => option.label ?? option.altText ?? '');
      const { matchedIndex } = matchTranscriptToOptions(transcript, labels);
      const matched = matchedIndex >= 0 ? question.options[matchedIndex] : undefined;
      const correct = matched?.isCorrect === true;

      recordResponse({
        questionId: question.id,
        // Unmatched transcripts are recorded against no option: the analytics
        // layer treats "no option + low confidence" as a recognition problem,
        // not as evidence the child does not know the answer.
        optionId: matched?.id,
        transcript,
        transcriptConfidence: confidence,
        responseLatencyMs: latency,
        repeatedPrompt: repeatedSincePrompt,
        hinted: hintShown,
        correct,
        concepts: question.concepts,
      });

      if (correct) {
        praise(responses.current.filter((entry) => entry.questionId === question.id).length - 1);
        return;
      }
      const attemptCount = responses.current.filter((entry) => entry.questionId === question.id).length - 1;
      if (confidence > 0 && confidence < LOW_CONFIDENCE && !matched) {
        setFeedback({
          tone: 'retry',
          text: `I heard “${transcript}”, but I am not sure. Say it again, or type it below.`,
        });
        announce('I am not sure I heard that. Say it again, or type your answer.');
      } else {
        askRetry(attemptCount);
      }
    },
    [askRetry, hintShown, praise, question, recordResponse, repeatedSincePrompt],
  );

  const {
    supported: recognitionSupported,
    listening,
    start: startListening,
    stop: stopListening,
  } = useSpeechRecognition({
    language: typeof document === 'undefined' ? 'en' : document.documentElement.lang || 'en',
    onResult: (result) => {
      if (!result.isFinal) return;
      stopListening();
      judgeTranscript(result.transcript, result.confidence);
    },
    onError: (code) => {
      announce(describeRecognitionError(code));
    },
  });

  // Voice questions stop the microphone when unmounted or when leaving the
  // question — a mic left open after feedback is confusing and eats battery.
  useEffect(() => {
    if (question?.kind !== 'voice-answer') stopListening();
  }, [question?.kind, stopListening]);

  const sayAgain = useCallback(() => {
    promptShownAt.current = Date.now();
    setRepeatedSincePrompt(true);
    speakPrompt(question);
    announce('Here it is again.');
  }, [announce, question, speakPrompt]);

  const showHint = useCallback(() => {
    setHintShown(true);
    const text = question.hint ?? 'Take your time, and listen to the question once more.';
    setFeedback({ tone: 'retry', text: `${text} Your answer can wait — this is practice, not a test.` });
    announce(text);
  }, [announce, question.hint]);

  const attemptsForQuestion = responses.current.filter((entry) => entry.questionId === question.id).length;

  if (phase === 'instructions') {
    return (
      <section aria-labelledby="quiz-title" className="flex flex-col gap-4">
        <h2 id="quiz-title" className="text-2xl font-bold text-ink">
          {quiz.title}
        </h2>
        <p className="sahaj-prose text-lg text-ink" aria-live="polite">
          {quiz.instructions}
        </p>
        <div>
          <TouchButton variant="primary" size="large" onClick={start}>
            Start practice
          </TouchButton>
        </div>
      </section>
    );
  }

  if (phase === 'complete') {
    return (
      <section aria-labelledby="quiz-complete-title" className="flex flex-col gap-4">
        <h2 id="quiz-complete-title" className="text-2xl font-bold text-ink">
          You finished all {quiz.questions.length} questions!
        </h2>
        <p className="sahaj-prose text-lg text-ink">
          You practised {quiz.title.toLowerCase()}. Your teacher can see how you are growing — no marks,
          no compare, just your own progress.
        </p>
        <p className="text-base text-ink" data-testid="quiz-save-state">
          {submissionState === 'saved'
            ? sync.snapshot.pending > 0
              ? 'Saved on this tablet. It will sync when there is internet.'
              : 'Saved and synced.'
            : 'This device could not save the round. Nothing was lost from this page, but please tell your teacher.'}
        </p>
        <div>
          <TouchButton variant="primary" size="large" onClick={start}>
            Practice again
          </TouchButton>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="quiz-runner-title" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="quiz-runner-title" ref={questionHeading} tabIndex={0} className="text-2xl font-bold text-ink">
          Question {questionIndex + 1} of {quiz.questions.length}
        </h2>
        {/* A progress meter, not a score: how far through, never how well. */}
        <p aria-hidden="true" className="text-lg tracking-widest text-ink-muted">
          {quiz.questions.map((_entry, index) => (index <= questionIndex ? '●' : '○')).join(' ')}
        </p>
      </div>

      <p className="sahaj-prose text-xl text-ink" aria-live="polite">
        {question.prompt}
      </p>

      <div className="flex flex-wrap gap-3">
        <TouchButton variant="secondary" onClick={sayAgain}>
          Say it again
        </TouchButton>
        {attemptsForQuestion >= 2 && !hintShown ? (
          <TouchButton variant="secondary" onClick={showHint}>
            Give me a hint
          </TouchButton>
        ) : null}
      </div>

      {question.kind === 'sequence' ? (
        <SequenceQuestion
          question={question}
          picks={sequencePicks}
          onPick={(optionId) => {
            const next = [...sequencePicks, optionId];
            setSequencePicks(next);
            const complete = next.length === question.options.length;
            if (complete) {
              // Judge by position: option at index i must have been picked i-th.
              const correctOrder = next.every((id, position) => id === question.options[position]?.id);
              const finalOption = question.options.find((option) => option.id === next[next.length - 1]);
              if (finalOption) judgeChoice({ ...finalOption, isCorrect: correctOrder }, true);
            }
          }}
          disabled={feedback?.tone === 'celebrate'}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2" aria-label="Answer choices">
          {question.options.map((option) => (
            <li key={option.id}>
              <TouchButton
                variant="secondary"
                block
                onClick={() => judgeChoice(option, false)}
                aria-label={option.label ?? option.altText}
              >
                {option.iconName ? (
                  <span aria-hidden="true" className="mr-2 text-2xl">
                    {option.iconName}
                  </span>
                ) : null}
                {option.label ?? option.altText}
              </TouchButton>
            </li>
          ))}
        </ul>
      )}

      {question.kind === 'voice-answer' ? (
        <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border-2 border-line bg-surface p-4">
          <div className="flex flex-wrap gap-3">
            {listening ? (
              <TouchButton variant="primary" onClick={stopListening}>
                Stop the microphone
              </TouchButton>
            ) : (
              <TouchButton
                variant="primary"
                disabled={!recognitionSupported}
                onClick={() => {
                  setFeedback(null);
                  startListening();
                }}
              >
                Say my answer
              </TouchButton>
            )}
          </div>
          <form
            className="flex flex-wrap items-center gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const value = typedAnswer.trim();
              if (value.length === 0) return;
              // The typed path judges with the same tolerance as speech, so the
              // two modalities never disagree about what is right.
              judgeTranscript(value, 1);
              setTypedAnswer('');
            }}
          >
            <label htmlFor="quiz-typed-answer" className="text-base font-medium text-ink">
              Or type your answer
            </label>
            <input
              id="quiz-typed-answer"
              className="min-h-12 min-w-48 flex-1 rounded-[var(--radius-control)] border-2 border-line bg-elevated px-3 text-base text-ink"
              value={typedAnswer}
              onChange={(event) => setTypedAnswer(event.target.value)}
              autoComplete="off"
            />
            <TouchButton type="submit" variant="secondary">
              Send answer
            </TouchButton>
          </form>
        </div>
      ) : null}

      {/* Feedback text is announced through the app's single polite live region
          via `announce()`; keeping this container out of the `status` role avoids
          a second, competing live region on the same page. */}
      <div className="min-h-8">
        {feedback ? (
          <p
            data-testid="quiz-feedback"
            className={`sahaj-prose text-lg text-ink ${feedback.tone === 'celebrate' ? 'sahaj-reinforce' : ''}`}
          >
            <span aria-hidden="true" className="mr-2">
              {feedback.tone === 'celebrate' ? '🌟' : '↺'}
            </span>
            {feedback.text}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        {feedback?.tone === 'celebrate' ? (
          <TouchButton variant="primary" size="large" onClick={advance}>
            {questionIndex + 1 < quiz.questions.length ? 'Next question' : 'Finish'}
          </TouchButton>
        ) : null}
        {feedback?.tone === 'retry' ? (
          <TouchButton
            variant="primary"
            size="large"
            onClick={() => {
              promptShownAt.current = Date.now();
              setRepeatedSincePrompt(false);
              setFeedback(null);
              setSequencePicks([]);
              if (question.kind === 'audio-prompt') speakPrompt(question);
            }}
          >
            Try again
          </TouchButton>
        ) : null}
        {!feedback || feedback.tone === 'retry' ? (
          attemptsForQuestion >= 1 ? (
            <TouchButton variant="secondary" size="large" onClick={advance}>
              Move on
            </TouchButton>
          ) : null
        ) : null}
      </div>
    </section>
  );
}

/** Tap-in-order sequence: buttons only, no drag — motor accessibility first. */
function SequenceQuestion({
  question,
  picks,
  onPick,
  disabled,
}: {
  question: QuizQuestion;
  picks: string[];
  onPick: (optionId: string) => void;
  disabled: boolean;
}) {
  const picked = useMemo(() => new Set(picks), [picks]);
  return (
    <div className="flex flex-col gap-3">
      <p aria-live="polite" className="text-base text-ink">
        {picks.length === 0
          ? 'Tap the first step.'
          : `Picked ${picks.length} of ${question.options.length}. ${picks
              .map((id) => question.options.find((option) => option.id === id)?.label ?? '')
              .join(' → ')}`}
      </p>
      <ul className="grid gap-3 md:grid-cols-3" aria-label="Steps in order">
        {question.options.map((option) => (
          <li key={option.id}>
            <TouchButton
              variant="secondary"
              block
              disabled={disabled || picked.has(option.id)}
              onClick={() => onPick(option.id)}
            >
              {option.label ?? option.altText}
            </TouchButton>
          </li>
        ))}
      </ul>
    </div>
  );
}

function generateClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
