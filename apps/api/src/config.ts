/**
 * Runtime configuration.
 *
 * Every value has a working default, and the default for AI is `local`. That is
 * the whole deployment philosophy in one line: a school with no API key, no
 * internet and a proxy that blocks everything still gets a functioning platform.
 * Providers are an optimisation, never a requirement.
 *
 * Environment parsing is hand-written rather than schema-driven because the only
 * failure that matters here is "value missing", and the fallback must be usable
 * rather than fatal — a server that refuses to boot because a model name is
 * misspelled is worse than one that degrades to the rule-based engine.
 */

import type { AiProviderId } from '@sahaj/shared/ai';

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  corsAllowedOrigins: string[];
  forceOfflineMode: boolean;
  ai: {
    provider: AiProviderId;
    timeoutMs: number;
    maxRetries: number;
    /**
     * A single OpenAI-compatible endpoint. OpenAI, Azure gateways, and
     * self-hosted vLLM / TGI / Ollama / LM Studio all speak this shape, so one
     * adapter covers every provider the project supports — including the
     * on-premises case where lesson text never leaves the school.
     */
    remote: { apiKey: string | null; baseUrl: string; simplifyModel: string; sttModel: string };
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    nodeEnv: parseNodeEnv(env.NODE_ENV),
    port: parseInteger(env.API_PORT, 4000, { min: 1, max: 65_535 }),
    corsAllowedOrigins: (env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    forceOfflineMode: env.FORCE_OFFLINE_MODE === 'true',
    ai: {
      provider: parseProvider(env.AI_PROVIDER),
      timeoutMs: parseInteger(env.AI_REQUEST_TIMEOUT_MS, 15_000, { min: 500, max: 120_000 }),
      maxRetries: parseInteger(env.AI_MAX_RETRIES, 2, { min: 0, max: 5 }),
      remote: {
        apiKey: emptyToNull(env.OPENAI_API_KEY),
        baseUrl: (env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
        simplifyModel: env.OPENAI_SIMPLIFY_MODEL ?? 'gpt-4o-mini',
        sttModel: env.OPENAI_STT_MODEL ?? 'whisper-1',
      },
    },
  };
}

function parseNodeEnv(value: string | undefined): AppConfig['nodeEnv'] {
  if (value === 'production' || value === 'test') return value;
  return 'development';
}

function parseProvider(value: string | undefined): AiProviderId {
  if (value === 'local' || value === 'openai' || value === 'custom') return value;
  // 'huggingface' routes through the OpenAI-compatible path (point
  // OPENAI_BASE_URL at a Text Generation Inference endpoint). It is accepted
  // here so an existing deployment's config keeps working.
  if (value === 'huggingface') return 'custom';
  return 'local';
}

function parseInteger(value: string | undefined, fallback: number, bounds: { min: number; max: number }): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, bounds.min), bounds.max);
}

function emptyToNull(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
