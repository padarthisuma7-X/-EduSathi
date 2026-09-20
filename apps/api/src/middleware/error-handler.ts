import { AiError, AI_ERROR_STATUS, type AiErrorCode } from '@sahaj/shared/ai';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

import { requestIdOf } from './request-context';

/**
 * Error translation.
 *
 * One handler maps every internal error type to an HTTP status and a message
 * that is safe to show a teacher. Notes on the choices:
 *
 *  - `AiError` carries its own status mapping (`AI_ERROR_STATUS`) so a route
 *    never has to decide that a timeout is a 504 and a rate limit a 429.
 *  - Zod failures become 400s with a *path-prefixed* list, so "grade: must be at
 *    most 12" is actionable rather than "invalid request".
 *  - Anything unexpected becomes a generic 500. Internal messages and stack
 *    traces are logged, never returned: a stack trace in a school's browser
 *    console is both a security and a support-call problem.
 */

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

export function notFoundHandler(): RequestHandler {
  return (req, res) => {
    const body: ErrorBody = {
      error: {
        code: 'not-found',
        message: `No API route matches ${req.method} ${req.path}.`,
        requestId: requestIdOf(res),
      },
    };
    res.status(404).json(body);
  };
}

export function errorHandler(options: { isProduction: boolean } = { isProduction: false }): ErrorRequestHandler {
  // Express identifies an error handler by its arity, so all four parameters must
  // stay in the signature even though `next` is unused.
  return (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    const requestId = requestIdOf(res);

    if (error instanceof AiError) {
      res.status(statusForAiError(error.code)).json({
        error: {
          code: error.code,
          message: error.message,
          requestId,
        },
      } satisfies ErrorBody);
      return;
    }

    if (error instanceof ZodError) {
      res.status(400).json({
        error: {
          code: 'invalid-request',
          message: 'Some of the values sent were not valid.',
          requestId,
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      } satisfies ErrorBody);
      return;
    }

    /**
     * Body-parser and similar middleware attach an HTTP `status`/`statusCode` to
     * the errors they throw — a malformed JSON body is a 400, an oversized one a
     * 413. Without this branch both would be reported to the learner as "something
     * went wrong on the server", which is untrue and hides a fixable client bug.
     */
    const clientStatus = extractClientStatus(error);
    if (clientStatus !== null) {
      res.status(clientStatus).json({
        error: {
          code: clientStatus === 413 ? 'payload-too-large' : 'invalid-request',
          message:
            clientStatus === 413
              ? 'That upload is too large. Try a shorter recording.'
              : 'The request body could not be read.',
          requestId,
        },
      } satisfies ErrorBody);
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ level: 'error', requestId, message }));

    res.status(500).json({
      error: {
        code: 'internal-error',
        message: options.isProduction
          ? 'Something went wrong on the server. Please try again.'
          : message,
        requestId,
      },
    } satisfies ErrorBody);
  };
}

function statusForAiError(code: AiErrorCode): number {
  return AI_ERROR_STATUS[code] ?? 502;
}

/** Reads the HTTP status a middleware attached to its error, if it is a 4xx. */
function extractClientStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const candidate = (error as { status?: unknown; statusCode?: unknown });
  const status = typeof candidate.status === 'number' ? candidate.status : candidate.statusCode;
  if (typeof status !== 'number') return null;
  return status >= 400 && status < 500 ? status : null;
}
