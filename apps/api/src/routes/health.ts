import { PLATFORM, type AiAdapter } from '@sahaj/shared';
import { Router } from 'express';

import { describeCapabilities } from '../ai';
import type { AppConfig } from '../config';
import type { SyncStore } from '../store/memory-store';

/**
 * Health and capability discovery.
 *
 * Two audiences:
 *  - the **school's monitoring**, which needs a cheap, dependency-free liveness
 *    signal. It must not touch the database or an AI provider, because a healthy
 *    API with a sick database is still a working offline-first API.
 *  - the **PWA client**, which asks what this server can actually do right now so
 *    it can decide whether to spend bandwidth uploading audio. That is why
 *    capabilities are reported from the adapter rather than hard-coded.
 */
export function createHealthRouter(deps: { config: AppConfig; adapter: AiAdapter; store: SyncStore }): Router {
  const router = Router();
  const startedAt = Date.now();

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      platform: PLATFORM.slug,
      cacheVersion: PLATFORM.cacheVersion,
      uptimeMs: Date.now() - startedAt,
      offlineMode: deps.adapter.offline,
      aiProvider: deps.adapter.id,
      capabilities: describeCapabilities(deps.adapter),
      store: deps.store.stats(),
    });
  });

  return router;
}
