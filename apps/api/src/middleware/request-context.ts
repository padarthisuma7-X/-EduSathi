import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

/**
 * Per-request context.
 *
 * A request id is generated here (or taken from a trusted proxy header when one
 * is present) so that a teacher reporting "saving my class failed" can be traced
 * across the device, the school gateway and this service. It is echoed back in
 * the response header and included in error bodies.
 *
 * Deliberately no logging of the request body: it contains children's names in
 * free text for some teachers, and answer transcripts for others. Only the
 * method, path, status and duration are logged.
 */
export function requestContext() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.header('x-request-id');
    const requestId = incoming && isSafeId(incoming) ? incoming : randomUUID();
    res.locals['requestId'] = requestId;
    res.setHeader('x-request-id', requestId);

    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      // One line, machine-parseable, no PII.
      console.log(
        JSON.stringify({
          level: res.statusCode >= 500 ? 'error' : 'info',
          requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Math.round(durationMs),
        }),
      );
    });

    next();
  };
}

/** Guards against a caller injecting log-breaking characters via the header. */
function isSafeId(value: string): boolean {
  return value.length > 0 && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value);
}

export function requestIdOf(res: Response): string {
  const value = res.locals['requestId'];
  return typeof value === 'string' ? value : 'unknown';
}
