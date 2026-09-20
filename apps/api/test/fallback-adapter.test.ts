import { AiError, type AiAdapter, type SimplifyTextRequest, type SimplifyTextResult } from '@sahaj/shared/ai';
import { describe, expect, it, vi } from 'vitest';

import { createFallbackAdapter } from '../src/ai/fallback-adapter';
import { createLocalAdapter } from '../src/ai/local-adapter';

/**
 * Degradation.
 *
 * The promise this file protects: a learner never sees an error because an AI
 * provider is down. Every failure must produce usable output, marked as degraded
 * so the teacher dashboard can be honest about it — and a capability the fallback
 * genuinely cannot serve must still fail loudly, because the client needs to know
 * to use the device's own voice instead of waiting for audio that will not come.
 */

const REQUEST: SimplifyTextRequest = {
  text: 'Photosynthesis is a fundamental process that plants utilize to generate food.',
  targetGrade: 3,
  language: 'en',
};

function failingPrimary(error: unknown): AiAdapter {
  const local = createLocalAdapter();
  return {
    ...local,
    id: 'custom',
    offline: false,
    capabilities: () => ['simplify-text', 'extract-keywords', 'speech-to-text'],
    supports: (capability) => capability !== 'text-to-speech',
    simplifyText: vi.fn(async () => {
      throw error;
    }),
    extractKeywords: vi.fn(async () => {
      throw error;
    }),
    transcribe: vi.fn(async () => {
      throw error;
    }),
  };
}

describe('createFallbackAdapter', () => {
  it('passes a successful provider response straight through, marked live', async () => {
    const local = createLocalAdapter();
    const live: SimplifyTextResult = {
      simplifiedText: 'Plants make food.',
      segments: [{ original: 'Plants make food.', simplified: 'Plants make food.' }],
      glossary: [],
      readabilityBefore: {
        words: 4,
        sentences: 1,
        syllables: 5,
        avgWordsPerSentence: 4,
        avgSyllablesPerWord: 1.25,
        fleschReadingEase: 100,
        fleschKincaidGrade: 3,
        longWordRatio: 0,
      },
      readabilityAfter: {
        words: 4,
        sentences: 1,
        syllables: 5,
        avgWordsPerSentence: 4,
        avgSyllablesPerWord: 1.25,
        fleschReadingEase: 100,
        fleschKincaidGrade: 3,
        longWordRatio: 0,
      },
      provenance: { provider: 'openai', model: 'test-model', degraded: false, latencyMs: 12 },
    };

    const primary: AiAdapter = { ...failingPrimary(new Error('unused')), simplifyText: async () => live };
    const adapter = createFallbackAdapter(primary, local);

    const result = await adapter.simplifyText(REQUEST);

    expect(result.provenance.degraded).toBe(false);
    expect(result.simplifiedText).toBe('Plants make food.');
  });

  it('falls back to the offline engine on a provider timeout', async () => {
    const onDegrade = vi.fn();
    const adapter = createFallbackAdapter(
      failingPrimary(new AiError('provider timed out', 'timeout')),
      createLocalAdapter(),
      { onDegrade },
    );

    const result = await adapter.simplifyText(REQUEST);

    expect(result.simplifiedText.length).toBeGreaterThan(0);
    expect(result.provenance.degraded).toBe(true);
    expect(result.provenance.degradedReason).toMatch(/did not answer in time/i);
    expect(result.provenance.provider).toBe('local');
    expect(onDegrade).toHaveBeenCalledWith(
      expect.objectContaining({ capability: 'simplify-text' }),
    );
  });

  it('explains a rate limit in words a teacher can act on', async () => {
    const adapter = createFallbackAdapter(
      failingPrimary(new AiError('429', 'rate-limited')),
      createLocalAdapter(),
    );

    const result = await adapter.simplifyText(REQUEST);

    expect(result.provenance.degradedReason).toMatch(/slow down/i);
  });

  it('explains a rejected credential rather than reporting a generic failure', async () => {
    const adapter = createFallbackAdapter(
      failingPrimary(new AiError('bad key', 'unauthorized')),
      createLocalAdapter(),
    );

    const result = await adapter.simplifyText(REQUEST);

    expect(result.provenance.degradedReason).toMatch(/credentials/i);
  });

  it('does not fall back when the request itself was invalid', async () => {
    const adapter = createFallbackAdapter(
      failingPrimary(new AiError('text is empty', 'invalid-request')),
      createLocalAdapter(),
    );

    await expect(adapter.simplifyText(REQUEST)).rejects.toThrow(/empty/);
  });

  it('propagates a failure the offline engine cannot serve', async () => {
    const adapter = createFallbackAdapter(
      failingPrimary(new AiError('provider down', 'provider-error')),
      createLocalAdapter(),
    );

    // The offline adapter has no server-side transcription, so the caller must
    // hear about the failure and use the browser's own speech recognition.
    await expect(
      adapter.transcribe({
        audio: new Uint8Array([1, 2, 3]),
        mimeType: 'audio/webm',
        language: 'en',
      }),
    ).rejects.toThrow(/provider down/);
  });

  it('reports the union of both engines when asked what it can do', () => {
    const adapter = createFallbackAdapter(failingPrimary(new Error('x')), createLocalAdapter());

    expect(adapter.supports('simplify-text')).toBe(true);
    expect(adapter.supports('speech-to-text')).toBe(true);
    expect(adapter.capabilities()).toContain('extract-keywords');
  });

  it('reports a combined failure when both engines fail', async () => {
    const brokenFallback: AiAdapter = {
      ...createLocalAdapter(),
      simplifyText: async () => {
        throw new Error('offline engine exploded');
      },
    };

    const adapter = createFallbackAdapter(
      failingPrimary(new AiError('provider down', 'provider-error')),
      brokenFallback,
    );

    await expect(adapter.simplifyText(REQUEST)).rejects.toThrow(/both the provider and the offline engine/);
  });
});
