/**
 * HTTP plumbing for provider calls.
 *
 * Every AI call in this service goes through here, because the failure modes are
 * the same every time and each one has bitten a school deployment:
 *  - a hung request must time out rather than hold a child's device for 60s;
 *  - a 429 or 5xx should be retried a couple of times, a 400 never should;
 *  - retries need jitter, otherwise a class of forty tablets retries in lockstep
 *    and takes the endpoint down again;
 *  - a caller that aborted (learner navigated away) must not trigger a retry.
 */

export interface FetchWithRetryOptions {
  timeoutMs: number;
  maxRetries: number;
  /** Attempted once at t=0, then with backoff. */
  label: string;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
  /** Sleep, injected for tests so retries do not slow the suite down. */
  sleepImpl?: (ms: number) => Promise<void>;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly body?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: FetchWithRetryOptions,
): Promise<Response> {
  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleepImpl ?? defaultSleep;
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    // A fresh signal per attempt: an `AbortSignal.timeout` is single-use.
    const signal = combineSignals(init.signal, AbortSignal.timeout(options.timeoutMs));

    try {
      const response = await doFetch(url, { ...init, signal });

      if (response.ok) return response;

      const body = await safeReadText(response);
      const retryable = RETRYABLE_STATUS.has(response.status);
      lastError = new HttpError(
        `${options.label} failed with ${response.status}`,
        response.status,
        retryable,
        body,
      );

      if (!retryable || attempt === options.maxRetries) throw lastError;
    } catch (error) {
      // Caller-cancelled requests are terminal: retrying would be wasted work.
      if (isAbortError(error) && init.signal?.aborted === true) throw error;
      lastError = error;
      if (attempt === options.maxRetries) break;
    }

    await sleep(backoffDelayMs(attempt));
  }

  throw lastError instanceof Error ? lastError : new Error(`${options.label} failed`);
}

/** 250ms, 500ms, 1s… with up to 40% jitter to de-synchronise a whole classroom. */
export function backoffDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = 250 * 2 ** attempt;
  const jitter = base * 0.4 * random();
  return Math.round(base - base * 0.2 + jitter);
}

function combineSignals(callerSignal: AbortSignal | null | undefined, timeoutSignal: AbortSignal): AbortSignal {
  if (!callerSignal) return timeoutSignal;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([callerSignal, timeoutSignal]);
  return timeoutSignal;
}

async function safeReadText(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text();
    // Provider errors can echo the request back; keep the log readable.
    return text.slice(0, 2000);
  } catch {
    return undefined;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
