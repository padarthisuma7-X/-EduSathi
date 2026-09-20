import { Router } from 'express';

import { syncBatchRequestSchema } from '../schemas';
import type { SyncStore } from '../store/memory-store';

/**
 * Module 4: offline sync intake.
 *
 * The client is the source of truth for *what happened* (it recorded the answer
 * while offline) and the server is the source of truth for *what has been
 * accepted*. Three properties make that work:
 *
 *  - **Idempotent.** Every item carries a client-generated id; a replay returns
 *    `duplicate`, which tells the client to drop it from its queue.
 *  - **Ordered.** The acknowledged cursor only advances contiguously, so a gap
 *    caused by a failed item keeps the device retrying it instead of silently
 *    skipping ahead.
 *  - **Offline-tolerant by design.** A `rejected` item is a *data* problem and is
 *    dropped by the client; a transport failure is a *network* problem and is
 *    retried. Conflating the two is how queues end up stuck forever.
 *
 * The route always answers 200 when the request is well-formed, even if some
 * items were rejected: a batch is a set of independent outcomes, and a non-2xx
 * would make the client retry the whole batch — including the items it should
 * have dropped.
 */
export function createSyncRouter(deps: { store: SyncStore }): Router {
  const router = Router();

  router.post('/batch', (req, res) => {
    const batch = syncBatchRequestSchema.parse(req.body);
    const response = deps.store.recordBatch(batch);
    res.json(response);
  });

  /**
   * Lightweight state probe so a device can find out what the server already has
   * before uploading — useful after a tablet is restored from an image, or after
   * a parent clears app data.
   */
  router.get('/state', (req, res) => {
    const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : '';
    if (deviceId.length < 4) {
      res.status(400).json({
        error: {
          code: 'invalid-request',
          message: 'A deviceId query parameter is required.',
          requestId: res.locals['requestId'] ?? 'unknown',
        },
      });
      return;
    }

    res.json({
      deviceId,
      // A real implementation reads this from `sync_cursors`. Returning the
      // server time is the part the client actually needs today: it is how a
      // device with a wrong clock corrects its latency statistics.
      serverTime: new Date().toISOString(),
      protocolVersion: 1,
    });
  });

  return router;
}
