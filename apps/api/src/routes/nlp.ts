import express, { Router } from 'express';

import type { AiAdapter } from '@sahaj/shared/ai';

import {
  decodeAudio,
  keywordsRequestSchema,
  simplifyRequestSchema,
  synthesizeRequestSchema,
  transcribeRequestSchema,
} from '../schemas';

/**
 * Module 2 endpoints: simplification, keywords, and the server-side speech path.
 *
 * Route handlers stay thin. All the decision-making (which engine, what to do
 * when it fails, how to mark degradation) lives in the adapter chain, so these
 * handlers only validate input and shape the response. When the NLP pipeline
 * grows — caching, per-school terminology, audio storage — it belongs in the
 * adapter or a service behind it, not in here.
 *
 * Error handling is delegated entirely to the central error handler: Express 5
 * forwards rejected promises from async handlers automatically, so there is no
 * `try/catch` boilerplate and no chance of a handler forgetting one.
 */
export function createNlpRouter(deps: { adapter: AiAdapter }): Router {
  const router = Router();

  router.post('/simplify', async (req, res) => {
    const request = simplifyRequestSchema.parse(req.body);
    const result = await deps.adapter.simplifyText(request);
    res.json(result);
  });

  router.post('/keywords', async (req, res) => {
    const request = keywordsRequestSchema.parse(req.body);
    const result = await deps.adapter.extractKeywords(request);
    res.json(result);
  });

  /**
   * Audio arrives as base64 JSON, so this route needs a much larger body limit
   * than the rest of the API. The parser is scoped to this route only (see
   * `app.ts`), which keeps an 11 MB body from being accepted anywhere else.
   */
  router.post('/transcribe', express.json({ limit: '12mb' }), async (req, res) => {
    const request = transcribeRequestSchema.parse(req.body);
    const result = await deps.adapter.transcribe({
      audio: decodeAudio(request),
      mimeType: request.mimeType,
      language: request.language,
      ...(request.tolerance !== undefined ? { tolerance: request.tolerance } : {}),
      ...(request.expectedPhrases !== undefined ? { expectedPhrases: request.expectedPhrases } : {}),
      ...(request.questionContext !== undefined ? { questionContext: request.questionContext } : {}),
    });
    res.json(result);
  });

  /**
   * Server-side speech synthesis.
   *
   * The client only calls this when it wants a *better voice* than the device
   * offers, or wants to cache audio for offline replay. It is never the default
   * path: the device's own speech engine costs no bandwidth and starts instantly.
   */
  router.post('/synthesize', async (req, res) => {
    const request = synthesizeRequestSchema.parse(req.body);
    const result = await deps.adapter.synthesize(request);

    res.json({
      mimeType: result.mimeType,
      durationMs: result.durationMs,
      wordTimings: result.wordTimings,
      provenance: result.provenance,
      // Base64 in JSON rather than a binary body: the client stores the result in
      // IndexedDB for offline replay, and one encoding path is easier to trust
      // than two. A future revision can stream this and cut the payload by 33%.
      audioBase64: Buffer.from(result.audio).toString('base64'),
    });
  });

  return router;
}
