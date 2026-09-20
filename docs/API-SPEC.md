# API specification

Base URL: `http://localhost:4000` (see `.env.example`). All bodies are JSON.
There is no version prefix yet: the only client is the PWA in this repository, and
it reports its own capabilities from `GET /api/health`. **Add `/v1` before a
third-party integration exists**, not after.

## Contents

- [Conventions](#conventions)
- [Errors](#errors)
- [Health](#get-apihealth)
- [NLP](#nlp-endpoints)
- [Sync](#sync-endpoints)
- [Progress](#progress-endpoints)
- [Client integration notes](#client-integration-notes)

## Conventions

- **Request id.** Every response carries `x-request-id`. Send your own
  (`[A-Za-z0-9_-]{1,128}`) to correlate across services; anything unparseable is
  replaced rather than echoed.
- **Time.** ISO-8601 UTC. The server never trusts a device clock for anything
  except measuring the learner's own pacing.
- **No PII in sync payloads.** A learner is an opaque `learnerId`. See
  [DATA-MODEL.md](DATA-MODEL.md#privacy-rules).
- **Provenance.** Every AI response includes `provenance.degraded`. When it is
  `true`, the content came from the offline rule-based engine, and the UI is
  expected to say so rather than imply a model produced it.
- **Limits** (`@sahaj/shared/ai`): text 20 000 characters, audio 8 MB, grades
  1–12, 40 keywords, 200 sync items per batch.

## Errors

```json
{
  "error": {
    "code": "invalid-request",
    "message": "Some of the values sent were not valid.",
    "requestId": "0f9c…",
    "details": [{ "path": "targetGrade", "message": "Too big: expected number to be <=12" }]
  }
}
```

| Code                      | HTTP | Meaning                                                        | Client action                                    |
| ------------------------- | ---- | -------------------------------------------------------------- | ------------------------------------------------ |
| `invalid-request`         | 400  | Schema violation; `details` names each field.                   | Fix the payload; never retry unchanged.           |
| `payload-too-large`       | 413  | Body exceeded the limit (256 KB, or 12 MB for audio).            | Shorten the recording.                            |
| `not-found`               | 404  | No route matches.                                               | Bug.                                              |
| `rate-limited`            | 429  | Provider asked us to slow down.                                 | Back off with jitter; the offline engine also works. |
| `unsupported-capability`  | 501  | This deployment cannot serve it (e.g. server-side speech in offline mode). | Use the device API — do **not** retry.   |
| `offline`                 | 503  | Upstream unreachable.                                           | Queue locally; retry later.                       |
| `timeout`                 | 504  | Provider exceeded `AI_REQUEST_TIMEOUT_MS`.                       | Retry once, then accept the degraded result.      |
| `provider-error`          | 502  | Provider failed or returned unusable output.                     | Retry once; degraded output is usually already returned instead. |
| `internal-error`           | 500  | Bug.                                                            | Report with the request id.                       |

## `GET /api/health`

Liveness **and** capability discovery. It touches no dependency: a healthy API
with an unreachable database is still a working offline-first API, so the health
check must not report an outage for it.

```json
{
  "status": "ok",
  "platform": "sahaj-shiksha",
  "cacheVersion": "v1",
  "uptimeMs": 8412,
  "offlineMode": true,
  "aiProvider": "local",
  "capabilities": [
    { "capability": "simplify-text", "via": "offline-engine" },
    { "capability": "extract-keywords", "via": "offline-engine" }
  ],
  "store": { "attempts": 0, "devices": 0, "learners": 0 }
}
```

**Client rule:** upload audio only if `capabilities` includes `speech-to-text`.
Otherwise use `SpeechRecognition` on the device, which is faster and works
offline.

## NLP endpoints

### `POST /api/nlp/simplify`

| Field           | Type     | Required | Notes                                                     |
| --------------- | -------- | -------- | --------------------------------------------------------- |
| `text`          | string   | yes      | ≤ 20 000 characters.                                       |
| `targetGrade`   | integer  | yes      | 1–12. Drives sentence length and vocabulary.               |
| `language`      | string   | yes      | BCP-47, e.g. `en`, `hi-IN`.                                |
| `preserveTerms` | string[] | no       | Vocabulary that must survive verbatim. Max 50.             |
| `maxWords`      | integer  | no       | Trims whole sentences, never cuts mid-sentence.            |
| `timeoutMs`     | integer  | no       | Per-request provider timeout.                              |

```json
{
  "simplifiedText": "A seed is small. It sits in the soil. When it rains, the seed drinks water.",
  "segments": [{ "original": "…", "simplified": "…" }],
  "glossary": [
    { "term": "germination", "definition": "when a seed starts to grow", "firstIndex": 42 }
  ],
  "readabilityBefore": { "fleschKincaidGrade": 9.2, "words": 61, "sentences": 4, "…": "…" },
  "readabilityAfter": { "fleschKincaidGrade": 3.4, "words": 48, "sentences": 7, "…": "…" },
  "provenance": {
    "provider": "local",
    "model": "rule-based-v1",
    "degraded": true,
    "degradedReason": "No AI provider is available, so this text was simplified by the offline rule-based engine on the school server.",
    "latencyMs": 4
  }
}
```

Guarantees:

- `segments.length` equals the number of input sentences, so a reader can always
  offer the original per sentence.
- Every term in `preserveTerms` present in the input is present in the output. A
  provider that drops one is rejected and the offline engine (which reverts such
  a sentence) answers instead.
- `readabilityAfter` describes `simplifiedText` exactly, including after
  `maxWords` trimming.
- `glossary[].firstIndex` is `-1` when the term is defined but not linked to a
  word in the passage; the UI shows it in the glossary section only.

### `POST /api/nlp/keywords`

```json
{ "text": "…", "language": "en", "limit": 8 }
```

```json
{
  "keywords": [{ "term": "water", "weight": 1, "occurrences": 4 }],
  "suggestedQuestions": ["What does “water” mean?"],
  "provenance": { "provider": "local", "model": "rule-based-v1", "degraded": true, "latencyMs": 2 }
}
```

Terms are always present in the input (verified after generation), so a
hallucinated keyword cannot reach a quiz.

### `POST /api/nlp/transcribe`

Audio is base64 JSON so the same payload can be queued in IndexedDB and replayed
without re-encoding. The route has its own 12 MB body parser; every other route
caps at 256 KB.

```json
{
  "audioBase64": "GkXfo59Ch…",
  "mimeType": "audio/webm",
  "language": "en",
  "tolerance": "child",
  "expectedPhrases": ["the seed needs water"],
  "questionContext": "What does a seed need to grow?"
}
```

- `tolerance` (`child` | `dysarthria` | `regional-accent` | `none`) asks the
  provider to prefer recall over precision. Low confidence must **re-prompt
  gently**, never mark an answer wrong.
- `expectedPhrases` and `questionContext` bias decoding toward the lesson's
  vocabulary, which is the largest accuracy win for child speech on a known topic.

Response: `{ text, confidence, alternatives, words[], matchedExpectedPhrase?, provenance }`
where `words[]` are `{ word, startMs, endMs, confidence }`.

In offline mode this returns **501** (`unsupported-capability`) by design: use the
browser's own recognition instead of waiting.

### `POST /api/nlp/synthesize`

```json
{ "text": "The seed grew.", "language": "en", "rate": 0.9, "returnWordTimings": true }
```

```json
{
  "mimeType": "audio/mpeg",
  "durationMs": 1400,
  "wordTimings": [{ "word": "The", "charIndex": 0, "startMs": 0, "endMs": 220 }],
  "provenance": { "provider": "openai", "model": "tts-1", "degraded": false, "latencyMs": 610 },
  "audioBase64": "SUQzB…"
}
```

`rate` is clamped to **0.5–1.25** in the schema; requests above it are rejected
rather than silently slowed, so a client cannot believe it shipped a faster voice.
`wordTimings: []` means the engine has no timings and the reader should fall back
to sentence-level highlighting. **501** in offline mode.

## Sync endpoints

### `POST /api/sync/batch`

```json
{
  "deviceId": "tablet-4b2a",
  "cursor": 12,
  "items": [
    {
      "clientId": "attempt-9f1c-4d",
      "entityType": "quiz-attempt",
      "sequence": 13,
      "createdAt": "2026-02-01T09:04:00.000Z",
      "attempts": 0,
      "payload": {
        "clientId": "attempt-9f1c-4d",
        "quizId": "quiz-seed",
        "learnerId": "b7f1…",
        "startedAt": "2026-02-01T09:00:00.000Z",
        "completedAt": "2026-02-01T09:04:00.000Z",
        "responses": [
          {
            "questionId": "q1",
            "optionId": "opt-a",
            "responseLatencyMs": 4200,
            "repeatedPrompt": true,
            "hinted": false,
            "correct": true,
            "concepts": ["germination"]
          }
        ]
      }
    }
  ]
}
```

```json
{
  "results": [{ "clientId": "attempt-9f1c-4d", "status": "accepted" }],
  "acknowledgedCursor": 13,
  "serverTime": "2026-02-01T09:05:11.402Z"
}
```

Statuses and what the client must do:

| Status      | Meaning                                              | Client action                                    |
| ----------- | ---------------------------------------------------- | ------------------------------------------------ |
| `accepted`  | Stored.                                              | Delete from the queue once the cursor passes it. |
| `duplicate` | Already received (a replay).                         | Delete from the queue.                            |
| `rejected`  | Unstorable (see `message`), e.g. implausible latency. | Delete from the queue and log; retrying changes nothing. |

- The route answers **200 even when items are rejected.** A batch is a set of
  independent outcomes, and a non-2xx would make the client retry the whole batch,
  including the items it should drop.
- `acknowledgedCursor` only advances contiguously. A gap means the client keeps
  retrying the missing sequence rather than believing it was received.
- `serverTime` lets a device with a wrong clock correct its latency statistics.

### `GET /api/sync/state?deviceId=…`

`{ deviceId, serverTime, protocolVersion: 1 }` — for reconciling after a tablet is
restored from an image or app data is cleared. `400` without a `deviceId` of at
least 4 characters.

## Progress endpoints

### `GET /api/progress/learners/:learnerId`

Learner-facing growth snapshot. Returns an empty snapshot (not 404) for an
unknown learner so a new device does not show an error to a child.

```json
{
  "learnerId": "b7f1…",
  "generatedAt": "2026-02-01T09:06:00.000Z",
  "streakDays": 5,
  "minutesEngaged": 34,
  "badges": ["first-steps", "in-a-row"],
  "concepts": [{ "concept": "germination", "mastery": 0.62, "attempts": 6, "trend": 1 }],
  "medianLatencyMs": 4300,
  "medianTranscriptConfidence": 0.42
}
```

`trend` is `-1` declining, `0` flat, `1` improving, computed over the last five
versus the preceding five answers — a plain average cannot show improvement in a
learner who struggled for a month and then got it.

### `GET /api/progress/flags?minSeverity=0.6`

Teacher-facing "who needs help this week". Never a label or a score.

```json
{
  "flags": [
    {
      "learnerId": "b7f1…",
      "reason": "high-hint-dependence",
      "severity": 1,
      "evidence": "100% of answers needed the question read again.",
      "suggestedAction": "Check the learner’s reading settings, and try the same questions with audio prompts only.",
      "detectedAt": "2026-02-01T09:06:00.000Z"
    }
  ],
  "generatedAt": "2026-02-01T09:06:00.000Z"
}
```

`reason` is one of `stalled-progress`, `high-hint-dependence`,
`stt-misrecognition`, `accessibility-mismatch`, `long-absence`. `minSeverity` is
clamped to 0–1, and an unparseable value is treated as no filter rather than an
error: a teacher on a slow connection should not be blocked by a typo.

**This endpoint is unauthenticated today.** Scoping it to the signed-in teacher's
classes is required before any real rollout — see
[ARCHITECTURE.md](ARCHITECTURE.md#known-gaps).

## Client integration notes

### Offline queue order of operations

1. Record the attempt locally with a freshly generated `clientId` and the next
   `sequence`. Show the learner their result immediately — never a spinner.
2. Attempt `POST /api/sync/batch` when connectivity returns; send the oldest items
   first, up to 200.
3. On `accepted`/`duplicate`/`rejected`, delete the item. On a transport failure,
   increment `attempts` and retry with exponential backoff **plus jitter** (a
   class of forty tablets retries in lockstep otherwise).
4. Only trust `acknowledgedCursor` for queue compaction.

### Degraded content

When `provenance.degraded` is true, say so in the teacher's view ("simplified by
the offline engine") and not in the child's. A learner does not need to know which
engine simplified their lesson; a teacher needs to know whether they are looking
at model output when they judge its quality.

### Speech

Prefer the device APIs. Upload audio only when `GET /api/health` advertises
`speech-to-text`, and treat a `501` from `/api/nlp/transcribe` as a signal to
switch to the device recogniser for the rest of the session — not as a retryable
error.
