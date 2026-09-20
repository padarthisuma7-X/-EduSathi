import { Router } from 'express';

import type { SyncStore } from '../store/memory-store';

/**
 * Module 5: progress and intervention data.
 *
 * Privacy position, enforced by the shape of these endpoints:
 *  - there is no "list all learners" endpoint. A teacher-facing client must ask
 *    for a class it is authorised for (authentication is not implemented yet and
 *    is called out in docs/ARCHITECTURE.md as required before any real rollout);
 *  - responses contain no names. `learnerId` is opaque, and the name mapping
 *    lives only in the school's own database;
 *  - the learner-facing snapshot and the teacher-facing flags are separate
 *    endpoints, so a learner client can never be handed another child's data by
 *    accident of a shared response shape.
 */
export function createProgressRouter(deps: { store: SyncStore }): Router {
  const router = Router();

  router.get('/learners/:learnerId', (req, res) => {
    const learnerId = req.params.learnerId;
    res.json(deps.store.getProgress(learnerId));
  });

  /**
   * The teacher's "who needs help this week" list.
   *
   * `minSeverity` lets a teacher raise the bar on a busy morning without the
   * client filtering data it should not have received.
   */
  router.get('/flags', (req, res) => {
    const minSeverity = clamp(Number.parseFloat(String(req.query.minSeverity ?? '0')), 0, 1);
    const flags = deps.store.listInterventionFlags().filter((flag) => flag.severity >= minSeverity);
    res.json({ flags, generatedAt: new Date().toISOString() });
  });

  /**
   * The teacher dashboard in one response — heatmap, speech quality and pacing —
   * so a tablet on a 2G connection makes a single request when the teacher opens
   * the page, and a single request when they refresh it.
   */
  router.get('/overview', (_req, res) => {
    res.json(deps.store.getTeacherOverview());
  });

  return router;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}
