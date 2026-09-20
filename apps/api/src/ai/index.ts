/**
 * Adapter selection.
 *
 * One place decides which engine serves AI requests, and it always produces
 * something usable:
 *
 *   provider=local   → offline engine only
 *   provider=custom  → OpenAI-compatible endpoint (self-hosted vLLM/TGI/Ollama)
 *                      wrapped so every failure falls back to the offline engine
 *   provider=openai  → hosted OpenAI, same wrapping
 *   missing key      → offline engine, with a warning naming the variable
 *
 * A misconfiguration degrades rather than crashes. A school that pastes a wrong
 * API key should still be able to teach tomorrow morning.
 */

import type { AiAdapter, AiCapability } from '@sahaj/shared/ai';

import type { AppConfig } from '../config';
import { createFallbackAdapter } from './fallback-adapter';
import { createLocalAdapter } from './local-adapter';
import { createOpenAiAdapter } from './openai-adapter';

export interface CreateAiAdapterDeps {
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  /** Structured warning sink; defaults to `console.warn`. */
  warn?: (message: string, detail?: Record<string, unknown>) => void;
}

export function createAiAdapter(config: AppConfig, deps: CreateAiAdapterDeps = {}): AiAdapter {
  const warn = deps.warn ?? ((message, detail) => console.warn(message, detail ?? ''));
  const local = createLocalAdapter();

  if (config.forceOfflineMode) {
    warn('FORCE_OFFLINE_MODE is on: all AI requests use the offline engine.');
    return local;
  }

  if (config.ai.provider === 'local') {
    return local;
  }

  const { apiKey, baseUrl } = config.ai.remote;
  if (!apiKey) {
    warn(
      config.ai.provider === 'custom'
        ? 'AI_PROVIDER=custom but no API key is set; using the offline engine. Set OPENAI_API_KEY (any non-empty value works for most self-hosted servers).'
        : 'AI_PROVIDER is set but OPENAI_API_KEY is missing; using the offline engine.',
      { provider: config.ai.provider },
    );
    return local;
  }

  const remote = createOpenAiAdapter({
    apiKey,
    baseUrl,
    simplifyModel: config.ai.remote.simplifyModel,
    sttModel: config.ai.remote.sttModel,
    timeoutMs: config.ai.timeoutMs,
    maxRetries: config.ai.maxRetries,
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    ...(deps.sleepImpl ? { sleepImpl: deps.sleepImpl } : {}),
  });

  // The degradation counter is intentionally just a log for now; wiring it into
  // the teacher dashboard is part of Module 5.
  let degradedCount = 0;
  return createFallbackAdapter(remote, local, {
    onDegrade: ({ capability, reason, error }) => {
      degradedCount += 1;
      warn(`AI capability "${capability}" degraded to the offline engine.`, {
        reason,
        degradedCount,
        error: error instanceof Error ? error.message : String(error),
      });
    },
  });
}

/** Human-readable capability summary for the health endpoint. */
export function describeCapabilities(adapter: AiAdapter): { capability: AiCapability; via: string }[] {
  return adapter.capabilities().map((capability) => ({
    capability,
    via: adapter.offline ? 'offline-engine' : `${adapter.id}-provider`,
  }));
}
