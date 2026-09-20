'use client';

import { useCallback, useMemo, useState } from 'react';

import type {
  ExtractKeywordsResult,
  SimplifyTextResult,
} from '@sahaj/shared/ai';

import { ApiError, apiFetch } from '@/lib/api-client';

/**
 * The client half of the Module 2 pipeline.
 *
 * Design points that are easy to get wrong, done deliberately:
 *  - **Degraded output is still displayed.** `provenance.degraded` is surfaced
 *    as a visible, calm notice ("simplified by the built-in tool"), never an
 *    error — the rule-based offline engine is a feature of this platform, and
 *    a school must know which engine answered without being alarmed by it.
 *  - **Failure never blocks reading.** If the API cannot be reached, the page
 *    keeps the original passage with an honest one-line notice. A learner is
 *    never shown an empty screen because a server is down.
 *  - **Requests are bounded.** The text sent up is capped well under the API's
 *    own limit, so one enormous paste cannot stall a school server.
 */

export type SimplifierStatus = 'idle' | 'loading' | 'ready' | 'offline' | 'error';

export interface SimplifierState {
  status: SimplifierStatus;
  result: SimplifyTextResult | null;
  keywords: ExtractKeywordsResult | null;
  /** True when the learner asked to see the unsimplified words. */
  showOriginal: boolean;
  /** One calm sentence about why the original words are showing. */
  notice: string | null;
}

export interface UseSimplifierReturn extends SimplifierState {
  simplify: () => Promise<void>;
  toggleOriginal: () => void;
  /** The text to render right now: simplified when we have it, original otherwise. */
  activeText: string;
  /** True when `activeText` is the simplified variant. */
  isSimplified: boolean;
}

/** Generous but bounded: the API limit is 20k; we send at most 6k characters. */
const MAX_SEND_LENGTH = 6_000;

export function useSimplifier(
  originalText: string,
  targetGrade: number,
  preserveTerms: readonly string[] = [],
): UseSimplifierReturn {
  const [status, setStatus] = useState<SimplifierStatus>('idle');
  const [result, setResult] = useState<SimplifyTextResult | null>(null);
  const [keywords, setKeywords] = useState<ExtractKeywordsResult | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const simplify = useCallback(async () => {
    setStatus('loading');
    setNotice(null);
    try {
      const text = originalText.slice(0, MAX_SEND_LENGTH);
      const [simplified, extracted] = await Promise.all([
        apiFetch<SimplifyTextResult>('/api/nlp/simplify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text, targetGrade, language: 'en', preserveTerms }),
        }),
        apiFetch<ExtractKeywordsResult>('/api/nlp/keywords', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text, language: 'en', targetGrade, limit: 8 }),
        }),
      ]);
      setResult(simplified);
      setKeywords(extracted);
      setShowOriginal(false);
      setStatus('ready');
    } catch (error) {
      if (error instanceof ApiError && (error.code === 'network' || error.code === 'timeout')) {
        setStatus('offline');
        setNotice('The simplifier needs the internet right now. The original lesson is below, and read-aloud still works.');
      } else {
        setStatus('error');
        setNotice('The simplifier could not finish this time. The original lesson is below.');
      }
    }
  }, [originalText, preserveTerms, targetGrade]);

  const toggleOriginal = useCallback(() => {
    setShowOriginal((current) => !current);
  }, []);

  const isSimplified = status === 'ready' && result !== null && !showOriginal;
  const activeText = useMemo(
    () => (isSimplified && result ? result.simplifiedText : originalText),
    [isSimplified, originalText, result],
  );

  return { status, result, keywords, showOriginal, notice, simplify, toggleOriginal, activeText, isSimplified };
}

/** Teacher-facing one-liner for the provenance banner. */
export function describeProvenance(result: SimplifyTextResult): string {
  if (!result.provenance.degraded) {
    return `Simplified by ${result.provenance.model}.`;
  }
  return `Simplified by the built-in offline tool (${result.provenance.degradedReason ?? 'no network'}).`;
}

export { MAX_SEND_LENGTH };
