# Data model

Target: **PostgreSQL 16**. The API currently runs against an in-process store
(`apps/api/src/store/memory-store.ts`) that implements the same contract; this
document is the specification that store maps onto. The SQL below is complete and
runnable — no `TODO` tables.

## Contents

- [Entity overview](#entity-overview)
- [Privacy rules](#privacy-rules)
- [Schema](#schema)
- [Idempotent sync](#idempotent-sync)
- [Dashboard queries and indexes](#dashboard-queries-and-indexes)
- [Redis](#redis)
- [Object storage](#object-storage)
- [Retention](#retention)
- [Mapping to the in-memory store](#mapping-to-the-in-memory-store)

## Entity overview

```
schools ──┬── classes ──┬── learners ──┬── quiz_attempts ── quiz_responses
          │             │              └── learner_progress
          └── teacher_accounts ── teacher_classes

lessons ──┬── lesson_simplifications
          ├── questions ── question_options
          └── audio_assets

devices ──┬── sync_cursors
          └── sync_items          (idempotency + gap detection)
```

## Privacy rules

These are enforced by the schema, not by convention:

1. **No name, photo, diagnosis or disability category is stored outside
   `learners`.** Everything that travels from a device uses `learner_id`, a
   UUID. On a shared tablet, the sync payload is readable by the next child who
   picks it up, so it must carry nothing identifying.
2. **No clinical data at all.** There is no diagnosis column, no disability
   category, and no free-text note field. The platform adapts from behaviour
   (response latency, re-prompts, hint use), which is the only thing it is
   entitled to infer.
3. **`learners.display_name` is the only identifying column**, and it is required
   to live on the school-controlled database. A cloud deployment must keep that
   column null and rely on `roll_code`.
4. **Analytics never surface a child.** Intervention flags are computed from
   aggregates and always carry evidence and a suggested action for the teacher.

## Schema

```sql
-- ---------------------------------------------------------------------------
-- Extensions and shared enums
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

CREATE TYPE question_kind AS ENUM (
  'visual-choice', 'audio-prompt', 'voice-answer', 'picture-match', 'sequence'
);
CREATE TYPE quiz_mode AS ENUM ('practice', 'check-in');
CREATE TYPE sync_entity AS ENUM ('quiz-attempt', 'progress-event', 'settings-change');
CREATE TYPE sync_status AS ENUM ('accepted', 'duplicate', 'rejected');
CREATE TYPE intervention_reason AS ENUM (
  'stalled-progress', 'high-hint-dependence', 'stt-misrecognition',
  'accessibility-mismatch', 'long-absence'
);

-- ---------------------------------------------------------------------------
-- Organisation
-- ---------------------------------------------------------------------------
CREATE TABLE schools (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  -- Drives offline packaging and language defaults.
  district      text,
  default_language text NOT NULL DEFAULT 'en',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE classes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name        text NOT NULL,
  grade_level smallint NOT NULL CHECK (grade_level BETWEEN 1 AND 12),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

CREATE TABLE teacher_accounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  email          citext NOT NULL,
  -- Argon2id or bcrypt; never a plaintext or reversible value.
  password_hash  text NOT NULL,
  display_name   text NOT NULL,
  is_admin       boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_login_at  timestamptz,
  UNIQUE (email)
);

CREATE TABLE teacher_classes (
  teacher_id uuid NOT NULL REFERENCES teacher_accounts(id) ON DELETE CASCADE,
  class_id   uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (teacher_id, class_id)
);

-- ---------------------------------------------------------------------------
-- Learners
-- ---------------------------------------------------------------------------
CREATE TABLE learners (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id           uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  -- The only identifying column in the schema. NULL when the database is hosted
  -- outside the school: the app works from roll_code alone.
  display_name       text,
  -- Pseudonymous code used on printed worksheets and in analytics exports.
  roll_code          text NOT NULL,
  preferred_language text NOT NULL DEFAULT 'en',
  created_at         timestamptz NOT NULL DEFAULT now(),
  -- Soft deletion, so progress history is not silently destroyed by a typo.
  archived_at        timestamptz,
  UNIQUE (class_id, roll_code)
);

-- Optional mirror of what a device reports about its accessibility settings.
-- Kept only so a replacement tablet can be configured the same way; it is NOT
-- the source of truth (the device is) and it is never used for reporting.
CREATE TABLE learner_accessibility_prefs (
  learner_id    uuid PRIMARY KEY REFERENCES learners(id) ON DELETE CASCADE,
  settings      jsonb NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Content
-- ---------------------------------------------------------------------------
CREATE TABLE lessons (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid REFERENCES schools(id) ON DELETE CASCADE,
  title          text NOT NULL,
  subject        text NOT NULL,
  grade_level    smallint NOT NULL CHECK (grade_level BETWEEN 1 AND 12),
  language       text NOT NULL DEFAULT 'en',
  body           text NOT NULL,
  -- Flesch-Kincaid grade of `body`, computed on write so the dashboard can rank
  -- lessons by difficulty without re-analysing text.
  source_grade   numeric(4,2),
  -- Version is bumped when `body` changes, because cached simplifications and
  -- client lesson caches are keyed by it.
  version        integer NOT NULL DEFAULT 1,
  published_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lessons_by_level ON lessons (grade_level, subject, language)
  WHERE published_at IS NOT NULL;

CREATE TABLE lesson_simplifications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id      uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  lesson_version integer NOT NULL,
  target_grade   smallint NOT NULL CHECK (target_grade BETWEEN 1 AND 12),
  -- Which engine produced this: 'local' | 'openai' | 'custom'.
  provider       text NOT NULL,
  model          text NOT NULL,
  -- True when the result came from the offline rule-based engine. Surfaced in
  -- the teacher UI so nobody mistakes it for a model output.
  degraded       boolean NOT NULL,
  simplified     text NOT NULL,
  -- Per-sentence pairing, so the reader can offer "show the original".
  segments       jsonb NOT NULL,
  glossary       jsonb NOT NULL DEFAULT '[]'::jsonb,
  grade_before   numeric(4,2) NOT NULL,
  grade_after    numeric(4,2) NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- One cached simplification per lesson version, reading level and engine.
  UNIQUE (lesson_id, lesson_version, target_grade, provider, model)
);

CREATE TABLE questions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id     uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  ordinal       smallint NOT NULL,
  kind          question_kind NOT NULL,
  prompt        text NOT NULL,
  prompt_grade  numeric(4,2),
  image_url     text,
  audio_url     text,
  -- Concept tags feed the mastery tracker.
  concepts      text[] NOT NULL DEFAULT '{}',
  -- A pacing hint for the adaptive engine. It is NEVER rendered as a limit.
  suggested_pace_ms integer,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, ordinal)
);

CREATE INDEX questions_by_concept ON questions USING gin (concepts);

CREATE TABLE question_options (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  ordinal     smallint NOT NULL,
  label       text,
  icon_name   text,
  -- Required when the option carries meaning without a text label (WCAG 1.1.1).
  alt_text    text,
  is_correct  boolean NOT NULL DEFAULT false,
  CHECK (label IS NOT NULL OR alt_text IS NOT NULL),
  UNIQUE (question_id, ordinal)
);

CREATE TABLE audio_assets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id     uuid REFERENCES lessons(id) ON DELETE CASCADE,
  -- NULL when the asset is a single word or a synthesised sentence.
  question_id   uuid REFERENCES questions(id) ON DELETE CASCADE,
  language      text NOT NULL,
  -- Hash of (text + voice + rate). What makes synthesis cacheable across
  -- lessons: the same sentence is never synthesised twice.
  content_hash  text NOT NULL,
  storage_key   text NOT NULL,
  mime_type     text NOT NULL,
  duration_ms   integer NOT NULL,
  byte_size     bigint NOT NULL,
  -- Per-word timings for karaoke highlighting; empty when the engine could not
  -- provide them, which the reader degrades to sentence-level highlighting.
  word_timings  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_hash, language)
);

-- ---------------------------------------------------------------------------
-- Devices and offline sync
-- ---------------------------------------------------------------------------
CREATE TABLE devices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid REFERENCES schools(id) ON DELETE SET NULL,
  -- Stable id the client generates once and keeps; used as the sync identity.
  device_key    text NOT NULL UNIQUE,
  platform      text,
  app_version   text,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sync_cursors (
  device_id     uuid PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  -- Highest *contiguous* sequence acknowledged. Never advanced past a gap.
  cursor        bigint NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sync_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id      uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  -- Client-generated natural key: the idempotency guarantee for replay.
  client_id      text NOT NULL,
  entity_type    sync_entity NOT NULL,
  sequence       bigint NOT NULL,
  status         sync_status NOT NULL,
  -- Present only when status = 'rejected'; shown to the teacher in plain words.
  rejection_reason text,
  payload        jsonb NOT NULL,
  received_at    timestamptz NOT NULL DEFAULT now(),
  -- Replay of the same answer is a duplicate, not a second record.
  UNIQUE (device_id, client_id),
  -- A device cannot number two items the same.
  UNIQUE (device_id, sequence)
);

CREATE INDEX sync_items_pending ON sync_items (device_id, sequence)
  WHERE status = 'accepted';

-- ---------------------------------------------------------------------------
-- Assessment
-- ---------------------------------------------------------------------------
CREATE TABLE quiz_attempts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Mirrors the client id so an offline submission can never be recorded twice,
  -- even if it arrives through two different devices (a tablet swapped mid-term).
  client_id      text NOT NULL UNIQUE,
  learner_id     uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  lesson_id      uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  device_id      uuid REFERENCES devices(id) ON DELETE SET NULL,
  mode           quiz_mode NOT NULL DEFAULT 'practice',
  started_at     timestamptz NOT NULL,
  completed_at   timestamptz NOT NULL,
  -- Accessibility settings in force during the attempt. Lets the analytics layer
  -- separate "hard question" from "learner had the ruler switched on".
  settings_snapshot jsonb,
  -- Device clock offset, so latency statistics stay honest on a tablet whose
  -- clock is wrong.
  clock_skew_ms  integer NOT NULL DEFAULT 0,
  received_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX quiz_attempts_by_learner ON quiz_attempts (learner_id, completed_at DESC);
CREATE INDEX quiz_attempts_by_lesson ON quiz_attempts (lesson_id, completed_at DESC);

CREATE TABLE quiz_responses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id          uuid NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id         uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  option_id           uuid REFERENCES question_options(id) ON DELETE SET NULL,
  -- Voice answers, with the confidence that decides whether to re-prompt gently.
  transcript          text,
  transcript_confidence numeric(4,3) CHECK (transcript_confidence BETWEEN 0 AND 1),
  -- Device-measured. Deliberately not a countdown; used for pacing and for
  -- spotting implausible values.
  response_latency_ms integer NOT NULL CHECK (response_latency_ms BETWEEN 0 AND 600000),
  repeated_prompt     boolean NOT NULL DEFAULT false,
  hinted              boolean NOT NULL DEFAULT false,
  -- Re-derived from question_options on insert; the client's own judgement is
  -- used only to display feedback while offline.
  is_correct          boolean,
  UNIQUE (attempt_id, question_id)
);

CREATE INDEX quiz_responses_by_question ON quiz_responses (question_id);

-- ---------------------------------------------------------------------------
-- Derived progress
-- ---------------------------------------------------------------------------
-- Recomputed after each sync batch. Materialised because the dashboards read it
-- on every page load and the computation is not cheap.
CREATE TABLE learner_progress (
  learner_id      uuid PRIMARY KEY REFERENCES learners(id) ON DELETE CASCADE,
  streak_days     integer NOT NULL DEFAULT 0,
  minutes_engaged integer NOT NULL DEFAULT 0,
  -- Badge ids already awarded. Never revoked: that is the entire point of them.
  badges          text[] NOT NULL DEFAULT '{}',
  concepts        jsonb NOT NULL DEFAULT '[]'::jsonb,
  median_latency_ms integer NOT NULL DEFAULT 0,
  median_transcript_confidence numeric(4,3),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE intervention_flags (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id   uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  reason       intervention_reason NOT NULL,
  severity     numeric(3,2) NOT NULL CHECK (severity BETWEEN 0 AND 1),
  -- Plain-language explanation, e.g. "3 of 5 answers needed a re-prompt".
  evidence     text NOT NULL,
  suggested_action text NOT NULL,
  detected_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz,
  resolved_by  uuid REFERENCES teacher_accounts(id) ON DELETE SET NULL,
  -- One open flag per learner per reason.
  UNIQUE (learner_id, reason, resolved_at)
);

CREATE INDEX intervention_flags_open ON intervention_flags (severity DESC)
  WHERE resolved_at IS NULL;

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------
-- Written for every read that returns another learner's data, so a school can
-- answer "who looked at this child's records?" — a question it will be asked.
CREATE TABLE data_access_log (
  id          bigserial PRIMARY KEY,
  actor_id    uuid REFERENCES teacher_accounts(id) ON DELETE SET NULL,
  learner_id  uuid REFERENCES learners(id) ON DELETE SET NULL,
  action      text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX data_access_log_by_learner ON data_access_log (learner_id, occurred_at DESC);
```

## Idempotent sync

The three properties the client depends on, and how the schema provides them:

| Property                     | Mechanism                                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Replay cannot duplicate      | `quiz_attempts.client_id UNIQUE` and `sync_items (device_id, client_id) UNIQUE`. A conflict returns `duplicate`, which tells the client to drop the item. |
| Ordering cannot be assumed    | `sync_items (device_id, sequence) UNIQUE` plus `sync_cursors.cursor`, advanced only contiguously.                                 |
| Rejection is not retryable    | `sync_items.status = 'rejected'` with a `rejection_reason`; the client deletes rejected items instead of retrying them forever.    |

The insert path is a single statement, so a retry racing with the original cannot
create two rows:

```sql
-- Upsert one queued item. `DO NOTHING` + `RETURNING` is how a duplicate is
-- detected without a second round-trip.
INSERT INTO sync_items (device_id, client_id, entity_type, sequence, status, payload)
VALUES ($1, $2, $3, $4, 'accepted', $5)
ON CONFLICT (device_id, client_id) DO NOTHING
RETURNING id;

-- Cursor advance, contiguously: only take the next sequence if it is exactly one
-- past the current cursor.
UPDATE sync_cursors
   SET cursor = $2, updated_at = now()
 WHERE device_id = $1
   AND $2 = cursor + 1;
```

## Dashboard queries and indexes

Comprehension heatmap (per lesson and concept, small samples suppressed):

```sql
SELECT q.concepts[1] AS concept,
       count(*) FILTER (WHERE r.is_correct) ::float / count(*) AS comprehension_rate,
       count(*) AS sample_size
  FROM quiz_responses r
  JOIN questions q ON q.id = r.question_id
  JOIN quiz_attempts a ON a.id = r.attempt_id
 WHERE a.lesson_id = $1
   AND a.completed_at >= now() - interval '30 days'
 GROUP BY 1
HAVING count(*) >= 5        -- suppress tiny samples so one answer is never a "trend"
 ORDER BY comprehension_rate ASC;
```

Intervention candidates (`intervention_flags_open` index, plus the aggregate over
`quiz_responses`):

```sql
SELECT a.learner_id,
       avg((r.repeated_prompt)::int) AS repeated_rate,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY r.response_latency_ms) AS median_latency,
       count(*) AS responses
  FROM quiz_responses r
  JOIN quiz_attempts a ON a.id = r.attempt_id
 WHERE a.completed_at >= now() - interval '14 days'
 GROUP BY a.learner_id
HAVING count(*) >= 5 AND avg((r.repeated_prompt)::int) >= 0.5;
```

## Redis

| Key                          | Type   | Purpose                                                            | TTL      |
| ---------------------------- | ------ | ------------------------------------------------------------------ | -------- |
| `session:<token>`            | hash   | Teacher session; enables revocation without a DB read per request.  | 12 h     |
| `rl:<ip>:<route>`            | string | Rate limiting (not yet implemented; see ARCHITECTURE.md gaps).      | 60 s     |
| `audio:hash:<content_hash>`  | string | Maps a synthesis hash to its `audio_assets` row, skipping a DB hit. | 30 d     |
| `progress:lock:<learner_id>` | string | Prevents two sync batches recomputing mastery concurrently.         | 30 s     |

Redis is an optimisation only. Every key is reconstructible from Postgres, so a
school server with Redis unavailable runs slower but stays correct.

## Object storage

MinIO or S3, one bucket (`sahaj-assets`), keys namespaced by content hash so
assets are immutable and cacheable forever:

```
audio/<language>/<content_hash[0:2]>/<content_hash>.mp3
images/<lesson_id>/<slug>.webp
```

Served with `Cache-Control: public, max-age=31536000, immutable`. Assets are
never mutated in place; a change produces a new hash and therefore a new key,
which is what makes the client-side cache safe to keep for a whole term.

## Retention

| Data                        | Retention                                             | Why                                                        |
| --------------------------- | ----------------------------------------------------- | ---------------------------------------------------------- |
| `sync_items`                | 90 days after `received_at`, once the cursor has moved | Idempotency window; long enough for a device offline a term. |
| `quiz_responses`            | Academic year + 1                                      | A teacher needs last year's baseline to show progress.      |
| `data_access_log`           | 3 years                                                | Audit requirement, and it contains no child content.        |
| `audio_assets`              | Until unreferenced for 180 days                        | Cheap to regenerate, expensive to store.                    |
| `intervention_flags`        | Kept with `resolved_at`                                | Resolved history is how a school evaluates its own interventions. |

Deletion of a learner is a soft delete (`archived_at`) followed by a scheduled
hard purge, so the purge is reviewable rather than a single click.

## Mapping to the in-memory store

| In-memory (`memory-store.ts`)                | Schema                                                            |
| -------------------------------------------- | ----------------------------------------------------------------- |
| `deviceItems: Map<deviceId, Map<clientId,…>>` | `sync_items`, keyed by the same unique pair                       |
| `deviceCursor: Map<deviceId, number>`         | `sync_cursors.cursor`                                             |
| `attempts: StoredAttempt[]`                   | `quiz_attempts` + `quiz_responses`                                 |
| `computeStats()`                              | SQL aggregates; `BADGE_RULES` stays in code, not in a table        |
| `deriveConceptMastery()` (EMA, α = 0.4)       | Recomputed into `learner_progress.concepts`                        |
| `listInterventionFlags()`                     | `intervention_flags`, derived from the query above                 |
| `validateItem()`                              | Same checks, plus `CHECK` constraints so bad data cannot be stored at all |
