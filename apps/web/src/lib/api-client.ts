/**
 * The one place the web app talks to the API.
 *
 * Every call goes through `apiFetch`, so the behaviours a school network needs
 * exist once and cannot be forgotten per call site:
 *  - a timeout (`AbortController`), because a hung proxy must not hang a learner's
 *    screen;
 *  - a typed error, so callers can distinguish "the network is down" (stay calm,
 *    keep the local copy) from "the server refused us" (a bug to fix);
 *  - no retries here. The sync queue owns retries for anything that mutates
 *    state; read paths re-fetch on user action, which is retry enough.
 *
 * The base URL is baked at build time (`NEXT_PUBLIC_API_URL`). In a school
 * deployment the API is typically on the same LAN host as the web server, so the
 * default assumes co-location on localhost for development.
 */

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type ApiErrorCode = 'network' | 'timeout' | 'server' | 'client';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  /** HTTP status, when the server answered at all. */
  readonly status: number | null;

  constructor(message: string, code: ApiErrorCode, status: number | null = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(new URL(path, API_BASE_URL), {
      ...init,
      signal: controller.signal,
      headers: { accept: 'application/json', ...init.headers },
    });

    if (!response.ok) {
      const code: ApiErrorCode = response.status >= 500 ? 'server' : 'client';
      throw new ApiError(`The server answered ${response.status} for ${path}`, code, response.status);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(`The request to ${path} timed out.`, 'timeout');
    }
    throw new ApiError(`Could not reach the server for ${path}.`, 'network');
  } finally {
    clearTimeout(timer);
  }
}
