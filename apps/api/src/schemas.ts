/**
 * Runtime request validation.
 *
 * The TypeScript interfaces in `@sahaj/shared` describe the *shape* of a payload;
 * these schemas decide whether a specific JSON body is acceptable. Both are
 * needed. For the payloads where drift would be silent and expensive (the sync
 * batch), the schema is typed as `z.ZodType<SharedType>`, so the compiler fails
 * the build the moment the two disagree.
 *
 * Validation is strict on purpose (`strict()`): a client sending a field we do
 * not know about is a client that is out of sync with the API, and silently
 * ignoring it hides a real bug until it shows up as missing data weeks later.
 */

import { AI_LIMITS } from '@sahaj/shared/ai';
import type { SyncBatchRequest, SyncQueueItem } from '@sahaj/shared/domain';
import { z } from 'zod';

const bcp47 = z
  .string()
  .min(2)
  .max(35)
  .regex(/^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/, 'must be a language tag such as "en" or "hi-IN"');

export const simplifyRequestSchema = z
  .object({
    text: z.string().min(1).max(AI_LIMITS.maxTextLength),
    targetGrade: z.number().int().min(AI_LIMITS.minGrade).max(AI_LIMITS.maxGrade),
    language: bcp47,
    preserveTerms: z.array(z.string().min(1).max(64)).max(50).optional(),
    maxWords: z.number().int().min(10).max(2000).optional(),
    timeoutMs: z.number().int().min(500).max(120_000).optional(),
  })
  .strict();

export type SimplifyRequestBody = z.infer<typeof simplifyRequestSchema>;

export const keywordsRequestSchema = z
  .object({
    text: z.string().min(1).max(AI_LIMITS.maxTextLength),
    language: bcp47,
    limit: z.number().int().min(1).max(AI_LIMITS.maxKeywords).optional(),
    targetGrade: z.number().int().min(AI_LIMITS.minGrade).max(AI_LIMITS.maxGrade).optional(),
  })
  .strict();

export type KeywordsRequestBody = z.infer<typeof keywordsRequestSchema>;

export const synthesizeRequestSchema = z
  .object({
    text: z.string().min(1).max(5000),
    language: bcp47,
    // Mirrors the shared contract: the platform never speaks faster than 1.25×.
    rate: z.number().min(0.5).max(1.25),
    pitch: z.number().min(0).max(2).optional(),
    voiceId: z.string().max(64).optional(),
    returnWordTimings: z.boolean().optional(),
  })
  .strict();

export type SynthesizeRequestBody = z.infer<typeof synthesizeRequestSchema>;

export const transcribeRequestSchema = z
  .object({
    /**
     * Base64 audio. JSON rather than multipart so the same payload can be queued
     * in IndexedDB and replayed by the offline sync engine without a second
     * encoding step.
     */
    audioBase64: z.string().min(1),
    mimeType: z
      .string()
      .regex(/^audio\/[A-Za-z0-9.+-]+$/, 'must be an audio MIME type such as audio/webm'),
    language: bcp47,
    tolerance: z.enum(['child', 'dysarthria', 'regional-accent', 'none']).optional(),
    expectedPhrases: z.array(z.string().min(1).max(80)).max(60).optional(),
    questionContext: z.string().max(300).optional(),
  })
  .strict();

export type TranscribeRequestBody = z.infer<typeof transcribeRequestSchema>;

/** Decodes base64 while enforcing the byte ceiling from the shared limits. */
export function decodeAudio(body: TranscribeRequestBody): Uint8Array {
  const bytes = Buffer.from(body.audioBase64, 'base64');
  if (bytes.byteLength > AI_LIMITS.maxAudioBytes) {
    throw new Error(
      `Audio is larger than the ${Math.round(AI_LIMITS.maxAudioBytes / 1024 / 1024)} MB limit.`,
    );
  }
  return new Uint8Array(bytes);
}

const syncQueueItemSchema: z.ZodType<SyncQueueItem> = z.object({
  // Some devices generate short ids for offline retries (for example "ov-1");
  // enforcing 8 characters turns valid queued work into a permanent 400.
  clientId: z.string().min(1).max(64),
  entityType: z.enum(['quiz-attempt', 'progress-event', 'settings-change']),
  sequence: z.number().int().min(0),
  createdAt: z.iso.datetime(),
  payload: z.unknown(),
  attempts: z.number().int().min(0).max(1000),
  lastAttemptAt: z.iso.datetime().optional(),
  rejected: z.object({ reason: z.string(), at: z.iso.datetime() }).optional(),
});

export const syncBatchRequestSchema: z.ZodType<SyncBatchRequest> = z.object({
  deviceId: z.string().min(4).max(64),
  cursor: z.number().int().min(0),
  // A hard ceiling keeps a device that never synced from posting a term's worth
  // of data in one request on a 2G connection.
  items: z.array(syncQueueItemSchema).max(200),
});

export type SyncBatchRequestBody = z.infer<typeof syncBatchRequestSchema>;
