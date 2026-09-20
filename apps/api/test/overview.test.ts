import type { QuizAttemptSubmission, SyncQueueItem } from '@sahaj/shared/domain';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { loadConfig } from '../src/config';

/**
 * GET /api/progress/overview (Module 5).
 *
 * The overview is what the teacher dashboard renders, so these tests assert the
 * shapes and the *suppression-adjacent* properties the UI depends on: rates come
 * with sample sizes, medians never divide by zero, and the endpoint works on a
 * freshly booted server with no data at all — the normal state of a pilot.
 */

function buildApp(env: NodeJS.ProcessEnv = {}) {
  const config = loadConfig({ AI_PROVIDER: 'local', ...env });
  return createApp({ config });
}

function attemptItem(overrides: Partial<SyncQueueItem> = {}, payload?: Partial<QuizAttemptSubmission>): SyncQueueItem {
  const base: QuizAttemptSubmission = {
    clientId: 'attempt-1',
    quizId: 'quiz-plants',
    learnerId: 'learner-a',
    startedAt: '2026-02-01T09:00:00.000Z',
    completedAt: '2026-02-01T09:04:00.000Z',
    responses: [
      {
        questionId: 'q1',
        optionId: 'a',
        responseLatencyMs: 4000,
        repeatedPrompt: false,
        hinted: false,
        correct: true,
        concepts: ['germination'],
      },
      {
        questionId: 'q2',
        transcript: 'the seed needs water',
        transcriptConfidence: 0.8,
        responseLatencyMs: 6000,
        repeatedPrompt: false,
        hinted: false,
        correct: false,
        concepts: ['plant-needs'],
      },
    ],
    ...payload,
  };

  return {
    clientId: 'attempt-1',
    entityType: 'quiz-attempt',
    sequence: 1,
    createdAt: '2026-02-01T09:04:00.000Z',
    payload: base,
    attempts: 0,
    ...overrides,
  };
}

describe('GET /api/progress/overview', () => {
  it('answers with an empty, well-formed overview on a fresh server', async () => {
    const { app } = buildApp();
    const response = await request(app).get('/api/progress/overview').expect(200);

    expect(response.body.heatmap).toEqual([]);
    expect(response.body.speech).toEqual([]);
    expect(response.body.pacing).toEqual([]);
    expect(Date.parse(response.body.generatedAt)).toBeGreaterThan(0);
  });

  it('derives comprehension rates with sample sizes per lesson and concept', async () => {
    const { app } = buildApp();
    await request(app)
      .post('/api/sync/batch')
      .send({
        deviceId: 'device-overview',
        cursor: 0,
        items: [
          attemptItem({ clientId: 'ov-1', sequence: 1 }),
          attemptItem({ clientId: 'ov-2', sequence: 2 }),
        ],
      })
      .expect(200);

    const response = await request(app).get('/api/progress/overview').expect(200);

    const germination = response.body.heatmap.find(
      (cell: { concept: string }) => cell.concept === 'germination',
    );
    // Two attempts × one germination response each: 2 right, 0 wrong.
    expect(germination).toMatchObject({ lessonId: 'quiz-plants', rate: 1, sampleSize: 2 });

    const plantNeeds = response.body.heatmap.find(
      (cell: { concept: string }) => cell.concept === 'plant-needs',
    );
    // Two attempts × one plant-needs response each, both incorrect.
    expect(plantNeeds).toMatchObject({ lessonId: 'quiz-plants', rate: 0, sampleSize: 2 });
  });

  it('reports speech quality only for lessons that had voice answers', async () => {
    const { app } = buildApp();
    await request(app)
      .post('/api/sync/batch')
      .send({
        deviceId: 'device-overview',
        cursor: 0,
        items: [attemptItem({ clientId: 'ov-voice', sequence: 1 })],
      })
      .expect(200);

    const response = await request(app).get('/api/progress/overview').expect(200);

    expect(response.body.speech).toHaveLength(1);
    expect(response.body.speech[0]).toMatchObject({
      lessonId: 'quiz-plants',
      voiceAnswers: 1,
      medianTranscriptConfidence: 0.8,
    });
    // Pacing is median latency across all responses in the lesson.
    const pacing = response.body.pacing[0];
    expect(pacing).toMatchObject({ lessonId: 'quiz-plants', attempts: 2, medianLatencyMs: 5000 });
  });

  it('aggregates across learners without ever carrying a name or a label', async () => {
    const { app } = buildApp();
    await request(app)
      .post('/api/sync/batch')
      .send({
        deviceId: 'device-overview',
        cursor: 0,
        items: [
          attemptItem({ clientId: 'ov-a', sequence: 1 }, { learnerId: 'learner-a' }),
          attemptItem({ clientId: 'ov-b', sequence: 2 }, { learnerId: 'learner-b' }),
        ],
      })
      .expect(200);

    const response = await request(app).get('/api/progress/overview').expect(200);
    // Both learners' answers feed the same concept cell: aggregated, not
    // per-child, because a heatmap is about the class.
    const germination = response.body.heatmap.find(
      (cell: { concept: string }) => cell.concept === 'germination',
    );
    expect(germination.sampleSize).toBe(2);
    expect(JSON.stringify(response.body)).not.toMatch(/name|diagnos|disorder/i);
  });
});
