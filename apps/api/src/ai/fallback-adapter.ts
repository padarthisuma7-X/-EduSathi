/**
 * Degradation wrapper.
 *
 * Wraps a remote adapter with the offline engine so that no AI failure is ever
 * visible to a child as an error. This is the mechanism behind the platform's
 * central promise: a passage still gets simplified when the network is down, and
 * the result says so through `provenance.degraded` instead of failing or quietly
 * returning the original text.
 *
 * Three rules it enforces so the rest of the system can trust that flag:
 *  - A fallback result always carries `degraded: true` and a reason naming the
 *    underlying failure.
 *  - The *same* request object is replayed to the fallback. A learner who waited
 *    fifteen seconds for a timeout must not then be given a different passage.
 *  - If the fallback cannot serve the capability either (server-side speech), the
 *    original error propagates. Pretending otherwise would leave the client
 *    waiting for audio that is never coming instead of using the device voice.
 */

import {
  AiError,
  type AiAdapter,
  type AiCapability,
  type AiProvenance,
  type ExtractKeywordsRequest,
  type ExtractKeywordsResult,
  type SimplifyTextRequest,
  type SimplifyTextResult,
  type SynthesizeRequest,
  type SynthesizeResult,
  type TranscribeRequest,
  type TranscribeResult,
} from '@sahaj/shared/ai';

export interface FallbackAdapterOptions {
  /** Called on every degradation: metrics today, teacher dashboard later. */
  onDegrade?: (info: { capability: AiCapability; reason: string; error: unknown }) => void;
}

export function createFallbackAdapter(
  primary: AiAdapter,
  fallback: AiAdapter,
  options: FallbackAdapterOptions = {},
): AiAdapter {
  const capabilities = new Set<AiCapability>([...primary.capabilities(), ...fallback.capabilities()]);

  const handle = async <Request, Result extends { provenance: AiProvenance }>(
    capability: AiCapability,
    request: Request,
    runPrimary: (request: Request) => Promise<Result>,
    runFallback: (request: Request) => Promise<Result>,
  ): Promise<Result> => {
    try {
      return await runPrimary(request);
    } catch (error) {
      // A malformed request is the caller's bug and would fail identically on the
      // fallback; re-throw so it surfaces as a 400 rather than a silent degrade.
      if (error instanceof AiError && error.code === 'invalid-request') throw error;
      if (!fallback.supports(capability)) throw error;

      const reason = describeFailure(error);
      options.onDegrade?.({ capability, reason, error });

      try {
        const result = await runFallback(request);
        return {
          ...result,
          provenance: { ...result.provenance, degraded: true, degradedReason: reason },
        };
      } catch (fallbackError) {
        // Both engines failed. Surface the *primary* error, which is what an
        // operator needs, with the fallback failure attached as context.
        throw new AiError(`${capability} failed on both the provider and the offline engine.`, 'provider-error', {
          primary: error,
          fallback: fallbackError,
        });
      }
    }
  };

  return {
    id: primary.id,
    // A wrapped adapter is only as offline-capable as its fallback, and the flag
    // describes the adapter as a whole — so it is `false` and the per-call
    // `degraded` flag carries the truth.
    offline: false,
    capabilities: () => [...capabilities],
    supports: (capability) => capabilities.has(capability),

    simplifyText: (request: SimplifyTextRequest): Promise<SimplifyTextResult> =>
      handle(
        'simplify-text',
        request,
        (value) => primary.simplifyText(value),
        (value) => fallback.simplifyText(value),
      ),

    extractKeywords: (request: ExtractKeywordsRequest): Promise<ExtractKeywordsResult> =>
      handle(
        'extract-keywords',
        request,
        (value) => primary.extractKeywords(value),
        (value) => fallback.extractKeywords(value),
      ),

    transcribe: (request: TranscribeRequest): Promise<TranscribeResult> =>
      handle(
        'speech-to-text',
        request,
        (value) => primary.transcribe(value),
        (value) => fallback.transcribe(value),
      ),

    synthesize: (request: SynthesizeRequest): Promise<SynthesizeResult> =>
      handle(
        'text-to-speech',
        request,
        (value) => primary.synthesize(value),
        (value) => fallback.synthesize(value),
      ),
  };
}

function describeFailure(error: unknown): string {
  if (error instanceof AiError) {
    switch (error.code) {
      case 'offline':
        return 'The device or server is offline, so the offline engine was used.';
      case 'timeout':
        return 'The AI provider did not answer in time, so the offline engine was used.';
      case 'rate-limited':
        return 'The AI provider asked us to slow down, so the offline engine was used.';
      case 'unauthorized':
        return 'The AI provider rejected our credentials, so the offline engine was used.';
      default:
        return `${error.message} The offline engine was used instead.`;
    }
  }
  return 'The AI provider could not be reached, so the offline engine was used.';
}
