import type { QuizAttemptSubmission, SyncQueueItem } from '@sahaj/shared/domain';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { loadConfig } from '../src/config';

/**
 * HTTP surface.
 *
 * Every test builds its own app with an offline AI provider, so the suite needs
 * no network, no API key and no database — the same conditions a school with no
 * connectivity runs in. That is not a test convenience; it is the deployment
 * target.
 */

function buildApp(env: NodeJS.ProcessEnv = {}) {
  const config = loadConfig({ AI_PROVIDER: 'local', ...env });
  return createApp({ config });
}

const SAMPLE_TEXT = `Photosynthesis is a fundamental process that plants utilize to generate their own food.
In order to commence this process, the plant requires adequate sunlight and water.`;

describe('GET /api/health', () => {
  it('reports the offline capabilities without touching any dependency', async () => {
    const { app } = buildApp();
    const response = await request(app).get('/api/health').expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.offlineMode).toBe(true);
    expect(response.body.aiProvider).toBe('local');
    expect(response.body.capabilities.map((entry: { capability: string }) => entry.capability)).toContain(
      'simplify-text',
    );
    // A health check that needs the database would report an outage whenever the
    // network is down, which is exactly when the platform is supposed to work.
    expect(response.body.store).toEqual({ attempts: 0, devices: 0, learners: 0 });
  });

  it('echoes a request id so a support call can be traced', async () => {
    const { app } = buildApp();
    const response = await request(app).get('/api/health').expect(200);
    expect(response.headers['x-request-id']).toMatch(/[0-9a-f-]{36}/);
  });

  it('ignores a hostile request id header', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .get('/api/health')
      .set('x-request-id', 'bad id with spaces')
      .expect(200);

    expect(response.headers['x-request-id']).not.toBe('bad id with spaces');
  });
});

describe('POST /api/nlp/simplify', () => {
  it('simplifies text and says the result came from the offline engine', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post('/api/nlp/simplify')
      .send({ text: SAMPLE_TEXT, targetGrade: 3, language: 'en' })
      .expect(200);

    expect(response.body.provenance.degraded).toBe(true);
    expect(response.body.provenance.degradedReason).toMatch(/offline/i);
    expect(response.body.readabilityAfter.fleschKincaidGrade).toBeLessThan(
      response.body.readabilityBefore.fleschKincaidGrade,
    );
  });

  it('rejects an out-of-range grade with a path-prefixed message', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post('/api/nlp/simplify')
      .send({ text: SAMPLE_TEXT, targetGrade: 99, language: 'en' })
      .expect(400);

    expect(response.body.error.code).toBe('invalid-request');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'targetGrade' })]),
    );
  });

  it('rejects unknown fields instead of ignoring a client that is out of sync', async () => {
    const { app } = buildApp();
    await request(app)
      .post('/api/nlp/simplify')
      .send({ text: SAMPLE_TEXT, targetGrade: 3, language: 'en', surprise: true })
      .expect(400);
  });

  it('rejects an invalid language tag', async () => {
    const { app } = buildApp();
    await request(app)
      .post('/api/nlp/simplify')
      .send({ text: SAMPLE_TEXT, targetGrade: 3, language: 'not a tag!' })
      .expect(400);
  });

  it('reports malformed JSON as a client error, not a server error', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post('/api/nlp/simplify')
      .set('content-type', 'application/json')
      .send('{"text": ')
      .expect(400);

    expect(response.body.error.code).toBe('invalid-request');
  });

  it('refuses text past the shared length limit', async () => {
    const { app } = buildApp();
    await request(app)
      .post('/api/nlp/simplify')
      .send({ text: 'a'.repeat(20_001), targetGrade: 3, language: 'en' })
      .expect(400);
  });
});

describe('POST /api/nlp/keywords', () => {
  it('extracts concepts and suggests questions a teacher can use', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post('/api/nlp/keywords')
      .send({ text: SAMPLE_TEXT, language: 'en', limit: 5 })
      .expect(200);

    expect(response.body.keywords.length).toBeGreaterThan(0);
    expect(response.body.keywords.length).toBeLessThanOrEqual(5);
    expect(response.body.keywords[0].term).toMatch(/plant|photosynthesis|process|water|food/i);
    expect(response.body.suggestedQuestions.length).toBeLessThanOrEqual(3);
    expect(response.body.provenance.degraded).toBe(true);
  });
});

describe('server-side speech', () => {
  it('answers 501 for transcription so the client uses its own speech engine', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post('/api/nlp/transcribe')
      .send({
        audioBase64: Buffer.from([1, 2, 3, 4]).toString('base64'),
        mimeType: 'audio/webm',
        language: 'en',
      })
      .expect(501);

    expect(response.body.error.code).toBe('unsupported-capability');
  });

  it('answers 501 for synthesis rather than returning silent audio', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post('/api/nlp/synthesize')
      .send({ text: 'Hello', language: 'en', rate: 0.9 })
      .expect(501);

    expect(response.body.error.code).toBe('unsupported-capability');
  });

  it('rejects a speaking rate above 1.25x', async () => {
    const { app } = buildApp();
    await request(app)
      .post('/api/nlp/synthesize')
      .send({ text: 'Hello', language: 'en', rate: 2 })
      .expect(400);
  });
});

function attemptItem(overrides: Partial<SyncQueueItem> = {}): SyncQueueItem {
  const payload: QuizAttemptSubmission = {
    clientId: 'attempt-1',
    quizId: 'quiz-seed',
    learnerId: 'learner-a',
    startedAt: '2026-02-01T09:00:00.000Z',
    completedAt: '2026-02-01T09:04:00.000Z',
    responses: [
      {
        questionId: 'q1',
        optionId: 'a',
        responseLatencyMs: 4200,
        repeatedPrompt: true,
        hinted: false,
        correct: true,
        concepts: ['germination'],
      },
      {
        questionId: 'q2',
        transcript: 'the seed needs water',
        transcriptConfidence: 0.42,
        responseLatencyMs: 6100,
        repeatedPrompt: true,
        hinted: true,
        correct: false,
        concepts: ['germination'],
      },
    ],
  };

  return {
    clientId: 'attempt-1',
    entityType: 'quiz-attempt',
    sequence: 1,
    createdAt: '2026-02-01T09:04:00.000Z',
    payload,
    attempts: 0,
    ...overrides,
  };
}

describe('POST /api/sync/batch', () => {
  it('accepts an offline attempt and acknowledges the cursor', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post('/api/sync/batch')
      .send({ deviceId: 'device-1', cursor: 0, items: [attemptItem()] })
      .expect(200);

    expect(response.body.results).toEqual([{ clientId: 'attempt-1', status: 'accepted' }]);
    expect(response.body.acknowledgedCursor).toBe(1);
    expect(response.body.serverTime).toBeTruthy();
  });

  it('treats a replay as a duplicate, not an error, so the device can clear its queue', async () => {
    const { app } = buildApp();
    const body = { deviceId: 'device-1', cursor: 0, items: [attemptItem()] };

    await request(app).post('/api/sync/batch').send(body).expect(200);
    const replay = await request(app).post('/api/sync/batch').send(body).expect(200);

    expect(replay.body.results[0].status).toBe('duplicate');
  });

  it('refuses to advance the cursor past a gap', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post('/api/sync/batch')
      .send({
        deviceId: 'device-2',
        cursor: 0,
        items: [attemptItem({ clientId: 'attempt-gap-3', sequence: 3 })],
      })
      .expect(200);

    // Store it, but do not acknowledge past the missing sequences: the device
    // must keep retrying 1 and 2 rather than believing they were received.
    expect(response.body.acknowledgedCursor).toBe(0);
  });

  it('rejects an attempt with an implausible response time instead of poisoning the analytics', async () => {
    const { app } = buildApp();
    const bad = attemptItem({ clientId: 'attempt-bad-1' });
    (bad.payload as QuizAttemptSubmission).responses[0]!.responseLatencyMs = 60 * 60 * 1000;

    const response = await request(app)
      .post('/api/sync/batch')
      .send({ deviceId: 'device-3', cursor: 0, items: [bad] })
      .expect(200);

    expect(response.body.results[0].status).toBe('rejected');
    expect(response.body.results[0].message).toMatch(/implausible/i);
  });

  it('rejects an attempt with no answers', async () => {
    const { app } = buildApp();
    const empty = attemptItem({ clientId: 'attempt-bad-2' });
    (empty.payload as QuizAttemptSubmission).responses = [];

    const response = await request(app)
      .post('/api/sync/batch')
      .send({ deviceId: 'device-4', cursor: 0, items: [empty] })
      .expect(200);

    expect(response.body.results[0].status).toBe('rejected');
  });

  it('caps the batch size so one device cannot flood a school server', async () => {
    const { app } = buildApp();
    const items = Array.from({ length: 201 }, (_, index) =>
      attemptItem({ clientId: `item-${index}`, sequence: index + 1 }),
    );

    await request(app).post('/api/sync/batch').send({ deviceId: 'device-5', cursor: 0, items }).expect(400);
  });

  it('requires a device id that could plausibly be a device', async () => {
    const { app } = buildApp();
    await request(app).post('/api/sync/batch').send({ deviceId: 'x', cursor: 0, items: [] }).expect(400);
  });

  it('reports the server time so a device with a wrong clock can correct itself', async () => {
    const { app } = buildApp();
    const response = await request(app).get('/api/sync/state?deviceId=device-1').expect(200);

    expect(response.body.protocolVersion).toBe(1);
    expect(Date.parse(response.body.serverTime)).toBeGreaterThan(0);
  });

  it('rejects a state probe without a device id', async () => {
    const { app } = buildApp();
    await request(app).get('/api/sync/state').expect(400);
  });
});

describe('progress endpoints', () => {
  async function seed(app: ReturnType<typeof buildApp>['app']) {
    await request(app)
      .post('/api/sync/batch')
      .send({
        deviceId: 'device-progress',
        cursor: 0,
        items: [
          attemptItem({ clientId: 'progress-attempt-1', sequence: 1 }),
          attemptItem({ clientId: 'progress-attempt-2', sequence: 2 }),
        ],
      })
      .expect(200);
  }

  it('derives a learner snapshot from synced attempts', async () => {
    const { app } = buildApp();
    await seed(app);

    const response = await request(app).get('/api/progress/learners/learner-a').expect(200);

    expect(response.body.learnerId).toBe('learner-a');
    expect(response.body.concepts).toEqual(
      expect.arrayContaining([expect.objectContaining({ concept: 'germination' })]),
    );
    expect(response.body.badges).toContain('first-steps');
    expect(response.body.medianLatencyMs).toBeGreaterThan(0);
    expect(response.body.medianTranscriptConfidence).toBeCloseTo(0.42, 2);
  });

  it('returns an empty snapshot for a learner with no data rather than a 404', async () => {
    const { app } = buildApp();
    const response = await request(app).get('/api/progress/learners/unknown').expect(200);

    expect(response.body.concepts).toEqual([]);
    expect(response.body.badges).toEqual([]);
  });

  it('flags a learner whose answers needed re-prompting, with evidence and a next step', async () => {
    const { app } = buildApp();
    await seed(app);

    const response = await request(app).get('/api/progress/flags').expect(200);
    const flag = response.body.flags.find(
      (entry: { reason: string }) => entry.reason === 'high-hint-dependence',
    );

    expect(flag).toBeDefined();
    expect(flag.evidence).toMatch(/read again/i);
    expect(flag.suggestedAction.length).toBeGreaterThan(0);
    // A flag must never carry a name or a label about a child.
    expect(JSON.stringify(flag)).not.toMatch(/name|diagnos|disorder/i);
  });

  it('sorts flags by urgency, most urgent first', async () => {
    const { app } = buildApp();
    await seed(app);

    const response = await request(app).get('/api/progress/flags').expect(200);
    const severities = response.body.flags.map((flag: { severity: number }) => flag.severity);

    expect(severities.length).toBeGreaterThan(0);
    expect([...severities].sort((a: number, b: number) => b - a)).toEqual(severities);
  });

  it('honours a severity filter and treats an unparseable value as no filter', async () => {
    const { app } = buildApp();
    await seed(app);

    const all = (await request(app).get('/api/progress/flags').expect(200)).body.flags as {
      severity: number;
    }[];
    // Severity is normalised to 0–1, so an out-of-range threshold is clamped
    // rather than rejected: a teacher asking for "more than 100% urgent" still
    // gets the most urgent cases instead of an empty screen.
    const clamped = (await request(app).get('/api/progress/flags?minSeverity=2').expect(200)).body
      .flags as { severity: number }[];
    // A teacher typing a bad value gets the full list, not an error.
    const malformed = (await request(app).get('/api/progress/flags?minSeverity=abc').expect(200)).body
      .flags as { severity: number }[];

    expect(all.length).toBeGreaterThan(0);
    expect(clamped.length).toBeLessThanOrEqual(all.length);
    expect(clamped.every((flag) => flag.severity >= 1)).toBe(true);
    expect(malformed.length).toBe(all.length);
  });
});

describe('unknown routes', () => {
  it('answers a clear 404 with the request id', async () => {
    const { app } = buildApp();
    const response = await request(app).get('/api/nope').expect(404);

    expect(response.body.error.code).toBe('not-found');
    expect(response.body.error.requestId).toBeTruthy();
  });
});
