# Sahaj Shiksha

An offline-first, high-accessibility learning platform for children with learning
difficulties (dyslexia, ADHD, speech impairments, visual processing differences)
in government and low-resource schools.

Works with **no internet, no API key and no cloud** — a lesson opens, reads itself
aloud, is answered, and is recorded on the device. The server adds better content
and aggregate analytics when it is reachable, never essential function.

---

## What is here

**Module 1 — Hyper-accessible UI — is complete and tested.** Modules 2–5 are
scaffolded: contracts, storage shapes, routes and design rules exist and are
tested; the interfaces are documented placeholders.

| Module | Scope                              | Status                                  |
| ------ | ---------------------------------- | --------------------------------------- |
| 1      | Accessible UI and navigation        | **Implemented** (51 tests)              |
| 2      | AI/NLP content engine               | Contracts + offline engine implemented; reader UI scaffolded |
| 3      | Stress-free assessment              | Types + API implemented; quiz UI scaffolded |
| 4      | Offline-first runtime               | Shell precache implemented; sync queue specified and tested server-side |
| 5      | Progress and analytics              | Derivation + routes implemented; dashboards scaffolded |

Already working end to end:

- **Four measured colour themes** (calm, yellow-on-black, cream-on-dark-blue,
  charcoal-on-light-cream). Every text pair is recomputed in CI and must reach
  **7:1 (AAA)**.
- **Dyslexia typography controls**: OpenDyslexic / Lexend / Atkinson /
  Inter / device font, text size to 250%, line height to 2.5, letter and word
  spacing — all landing exactly on a step grid so nothing shifts on reload.
- **Reading ruler** that follows the pointer, the keyboard, or both.
- **Focus mode** (zero-distraction layout) that never hides its own exit.
- **Read aloud with karaoke word highlighting** at 0.5×–1.25×.
- **Voice control** with fuzzy matching for child speech, plus a keyboard
  equivalent for every command.
- **An offline text simplifier** that measurably reduces reading grade and
  *guarantees* it never drops the vocabulary being taught.
- **Idempotent, gap-aware offline sync** with a real in-memory implementation.

## Quick start

Requires **Node.js ≥ 20.11**.

```bash
git clone <your-fork> sahaj-shiksha
cd sahaj-shiksha
npm install
cp .env.example .env      # optional: every value has a working default
```

### Run the app

```bash
npm run dev                # web app  → http://localhost:3000
npm run dev:api            # API      → http://localhost:4000 (separate terminal)
```

Open <http://localhost:3000>. Press **Alt + A** for the accessibility settings,
**Alt + V** then say “read this” for voice control.

### Verify

```bash
npm run typecheck          # all three workspaces
npm test                   # web (Jest + axe) and API (Vitest)
npm run test:web
npm run test:api
npm run lint --workspace=@sahaj/web   # jsx-a11y rules at error level
npm run build --workspace=@sahaj/web  # production build; all routes prerender
```

Expected on a clean checkout: **145 web tests, 49 API tests, 0 lint errors, 0 type
errors, 10 prerendered routes.**

## Scripts

| Command                                   | What it does                                            |
| ----------------------------------------- | ------------------------------------------------------- |
| `npm run dev`                             | Next.js dev server (Turbopack) on port 3000              |
| `npm run dev:api`                         | Express API with `tsx watch` on port 4000                |
| `npm run build`                           | Builds every workspace that has a build step             |
| `npm run typecheck`                       | `tsc --noEmit` across all workspaces                     |
| `npm test`                                | Every workspace's test suite                             |
| `npm run clean`                           | Removes `node_modules`, `.next`, `dist`                  |

## Project structure

```
apps/web        Next.js PWA. src/features/a11y is the accessibility engine.
apps/api        Express service: AI adapters, offline sync, progress.
packages/shared Cross-app source of truth: settings model, WCAG maths, contracts.
docs/           Architecture, data model, API spec, accessibility conformance.
```

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first — it explains why the
pieces are shaped the way they are, including the decisions that look unusual
(themes defined in TypeScript, settings applied by an inline script, the API run
through `tsx` rather than compiled).

## Configuration

Everything is optional — `.env.example` lists it all. The defaults choose the
offline path:

| Variable               | Default                  | Notes                                                    |
| ---------------------- | ------------------------ | -------------------------------------------------------- |
| `AI_PROVIDER`          | `local`                  | `local` \| `openai` \| `custom`                          |
| `OPENAI_API_KEY`       | *(empty)*                | Missing key ⇒ offline engine, with a warning, never a crash |
| `OPENAI_BASE_URL`      | `https://api.openai.com/v1` | Point at a self-hosted vLLM / TGI / Ollama endpoint    |
| `DATABASE_URL`         | local Postgres           | Not used yet; see [docs/DATA-MODEL.md](docs/DATA-MODEL.md) |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000`  | Keep it explicit: school proxies are strict              |
| `FORCE_OFFLINE_MODE`   | `false`                  | `true` routes every AI call through the offline engine    |

### Using an AI provider

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

Or run a model on-premises so lesson text never leaves the building:

```bash
AI_PROVIDER=custom
OPENAI_API_KEY=not-needed      # most self-hosted servers ignore it
OPENAI_BASE_URL=http://gpu-box.local:8000/v1
```

Any failure falls back to the offline engine and marks the response
`provenance.degraded: true` with a reason. The simplifier also **rejects** provider
output that drops a term listed in `preserveTerms`, so a model cannot quietly
change what a lesson teaches.

## How to extend it

**Add a colour theme.** Add an entry to `THEMES` in
`packages/shared/src/a11y/themes.ts`. Nothing else: the picker, the persistence and
the CSS all read from that map, and `theme-contrast.test.ts` will tell you
immediately if a pair is too low. (If you change the *default* palette, update the
`:root` fallbacks in `globals.css` too — a test asserts they match.)

**Add a font.** Add a token to `FONT_FAMILIES` and a stack to
`FONT_FAMILY_DEFINITIONS` in `packages/shared/src/a11y/typography.ts`, then follow
[`apps/web/public/fonts/README.md`](apps/web/public/fonts/README.md) to vendor the
file (fonts are self-hosted; CDNs are blocked in many schools).

**Add a control.** Compose `Fieldset` + `RadioCard`/`ToggleSwitch`/`RangeStepper`
inside a new section in `AccessibilityToolbar.tsx`. Never use a bare `<button>`:
`TouchButton` is what enforces the 48 px minimum and the label requirement.

**Add a voice or keyboard command.** Add it to `AccessibilityCommandId` and
`ACCESSIBILITY_HOTKEYS` in `features/a11y/hotkeys.ts`, add phrases to
`VOICE_COMMANDS` in `features/voice/grammar.ts`, and handle it in
`useAppCommands`. The shared dispatcher is what keeps the two input methods
equivalent — a command in only one of them is a bug (WCAG 2.1.1).

**Add an API route.** Define the request schema in `apps/api/src/schemas.ts`, keep
the handler thin, and let the central error handler translate failures. Never
`try/catch` for an `AiError`: Express 5 forwards async rejections, and the
mapping from error code to HTTP status lives in one place.

## Accessibility

The full conformance document — every WCAG 2.1 criterion, what the app does, and
**how that claim is verified** — is in
[docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md). It also lists, honestly, what is
not yet verified (screen readers, real child speech, pixel-measured target sizes).

Two rules that are easy to break and hard to notice:

- Never nest a link inside a button. Use `TouchLink` and `TouchButton` as siblings.
- Never write to `document.documentElement` outside
  `features/a11y/apply-settings.ts`; the pre-hydration cache is built from that
  same function, and a test asserts the two agree.

## Documentation

| Document                                       | Contents                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)         | Module map, data-flow diagram, decisions, deployment, known gaps   |
| [DATA-MODEL.md](docs/DATA-MODEL.md)             | Complete PostgreSQL DDL, indexes, Redis and object-store layout     |
| [API-SPEC.md](docs/API-SPEC.md)                 | Every endpoint, error codes and client integration rules            |
| [ACCESSIBILITY.md](docs/ACCESSIBILITY.md)       | WCAG conformance per criterion and the verification method          |

## Deployment notes

- `npm run build --workspace=@sahaj/web` produces fully static pages. Serve them
  from anything; the service worker handles the offline shell. **Service worker
  registration only happens in production builds.**
- Run the API with `npm start --workspace=@sahaj/api` (`tsx` runtime). It needs no
  build step, but it does need a TypeScript-capable runtime.
- **Single replica only, today.** The store is in-process; the Postgres
  implementation in [docs/DATA-MODEL.md](docs/DATA-MODEL.md) is what unlocks more.
- **Add authentication before any real rollout.** The API is currently
  unauthenticated; see the gaps list in ARCHITECTURE.md.

## Licence

Code: MIT. Bundled content and fonts carry their own licences — see
`apps/web/public/fonts/README.md` before vendoring a typeface.
