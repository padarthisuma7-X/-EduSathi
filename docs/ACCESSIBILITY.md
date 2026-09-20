# Accessibility

Target: **WCAG 2.1 Level AAA** where it is achievable for a learning product, and
Level AA everywhere. This document states, per criterion, what the app does, and
**how the claim is verified** — automated test, manual check, or not yet verified.

A claim without a verification method is a wish, so the "How verified" column is
the important one. Anything marked *not verified* in this document is listed in
[Remaining gaps](#remaining-gaps).

## Contents

- [Verification commands](#verification-commands)
- [Perceivable](#perceivable)
- [Operable](#operable)
- [Understandable](#understandable)
- [Robust](#robust)
- [Beyond WCAG](#beyond-wcag)
- [Testing with real users](#testing-with-real-users)
- [Remaining gaps](#remaining-gaps)

## Verification commands

```bash
npm run typecheck                 # includes the accessible-name compile guard
npm run test:web                  # Jest + axe-core, 145 tests
npm run test:api                  # Vitest, 49 tests
npm run lint --workspace=@sahaj/web   # jsx-a11y rules at error level
```

Three checks are unusual enough to name:

- **`theme-contrast.test.ts`** recomputes every contractual contrast ratio from the
  shipped colour values. A palette edit that drops body text below 7:1 fails CI.
- **`touch-targets.test.tsx`** asserts the enforcement chain for target size:
  every control carries a documented touch class, and `globals.css` defines those
  classes in terms of `--spacing-touch: 3rem`.
- **`accessibility-toolbar.test.tsx`** runs axe over the settings dialog, the
  densest control surface in the app.

## Perceivable

| Criterion | What we do | How verified |
| --- | --- | --- |
| **1.1.1 Non-text Content (A)** | Icon-only buttons must supply `aria-label` at the *type* level (`TouchButtonProps` is a discriminated union). Question options may be icon-only only if they carry `altText`, enforced by a `CHECK` constraint in the data model. Decorative swatches and the ruler are `aria-hidden`. | TypeScript compile (cannot build an unlabelled icon button); axe `image-alt`/`button-name`; `radio-card` tests |
| **1.2.1 / 1.2.2 Audio-only (A)** | Questions can carry audio prompts, and every prompt is *also* present as text. Speech synthesis has a visible "Stop reading" control. | Manual review of `ReadingSurface`; no automated audio check |
| **1.3.1 Info and Relationships (A)** | Native semantics only: `<fieldset>`/`<legend>` for control groups, `<table>` with `<caption>` and `scope` for the contrast audit, `<output for>` for values, `role="switch"` with `aria-checked`. | axe; `accessibility-toolbar.test.tsx` asserts every control family has a legend |
| **1.3.2 Meaningful Sequence (A)** | Visual order equals DOM order; the reading ruler and live regions are appended after content, never interleaved. | Manual; focus-order assertions in the toolbar tests |
| **1.3.4 Orientation (AA)** | No orientation lock (`orientation: 'any'` in the manifest). | Manifest inspection |
| **1.3.5 Identify Input Purpose (AA)** | The app collects no personal data from a learner; there are no identity-input fields to annotate. | `docs/DATA-MODEL.md` privacy rules |
| **1.4.1 Use of Colour (A)** | Every state is expressed in words as well as colour: switches show "On"/"Off", the network badge says "Connected"/"Offline", focus rings use a thick outline *and* a contrasting halo, links are underlined and background-tinted by default, and the karaoke highlight also draws a bottom border. | `states the word for the state` test; `data-emphasize-links` default |
| **1.4.3 Contrast Minimum (AA)** | All four themes reach **≥ 7:1 for body text** (AAA) and ≥ 4.5:1 for muted text, links and success/danger inks. | `theme-contrast.test.ts` recomputes 15 pairs × 4 themes |
| **1.4.4 Resize Text (AA)** | Root font size scales to 250% and everything is `rem`-based, so buttons and spacing grow with the text instead of overlapping it. Zoom is never blocked (`maximumScale: 5`, `userScalable: true`). | `settings-model` bounds tests; manual at 200% |
| **1.4.5 Images of Text (AA)** | No text is rendered as an image. The app icon is SVG with an accessible name. | Source review |
| **1.4.6 Contrast Enhanced (AAA)** | Body text at ≥ 7:1 in every theme. | `theme-contrast.test.ts` asserts `level === 'AAA'` for `text-on-bg` |
| **1.4.8 Visual Presentation (AAA)** | Learner-controlled foreground/background (4 themes), line width capped at 62ch (`.sahaj-measure`), no text justification anywhere, line height adjustable to 2.5, text resizable to 250% without horizontal scrolling. | `settings-model` bounds; `globals.css` review |
| **1.4.10 Reflow (AA)** | Single-column layouts, `overflow-wrap: break-word`, tables inside `overflow-x-auto`. | Manual at 320px width |
| **1.4.11 Non-text Contrast (AA)** | Borders, focus rings and control outlines are part of the contrast contract at ≥ 3:1. | `theme-contrast.test.ts` (`AA-nontext` pairs) |
| **1.4.12 Text Spacing (AA)** | Line height to 2.5, letter spacing to 0.2em, word spacing to 0.5em — all above the criterion's baselines, and all *exactly reachable* because the step grid is aligned to them. | `keeps the WCAG 1.4.12 text spacing baselines reachable` test |
| **1.4.13 Content on Hover (AA)** | No hover-only content. The ruler is a pointer/touch/keyboard aid with no information of its own. | Source review |

## Operable

| Criterion | What we do | How verified |
| --- | --- | --- |
| **2.1.1 Keyboard (A)** | Every feature is keyboard reachable. Shortcuts and voice commands share one dispatcher (`useAppCommands`), so a command cannot exist for one input method only. | `use-app-commands.test.tsx`; `ACCESSIBILITY_HOTKEYS` coverage |
| **2.1.2 No Keyboard Trap (A)** | The settings dialog traps Tab *inside itself* while open and releases focus to the launcher on close; Escape always exits. | `focus-trap.test.ts`, `accessibility-toolbar.test.tsx` |
| **2.1.4 Character Key Shortcuts (A)** | All shortcuts require the `Alt` modifier, so typing a letter never triggers a command. | `resolveHotkey` rejects anything without `altKey` |
| **2.2.1 Timing Adjustable (A)** | There are **no timers** in the product. Response latency is measured privately for pacing and is never displayed as a limit. | Design rule in `docs/API-SPEC.md`; `quizzes/page.tsx` |
| **2.3.1 Three Flashes (A)** | No flashing content. Micro-interactions are fade/scale only. | Source review |
| **2.4.1 Bypass Blocks (A)** | Skip link is the first focusable element and targets `<main id="main" tabIndex="-1">`. | `SkipLink` first in `layout.tsx`; manual Tab check |
| **2.4.2 Page Titled (A)** | Every route sets a title, templated as `%s · Sahaj Shiksha`. | `metadata` exports; build output |
| **2.4.3 Focus Order (A)** | Focus moves into the dialog on open, back to the launcher on close, and stays inside after a destructive action ("Reset everything"). | `accessibility-toolbar.test.tsx` |
| **2.4.4 Link Purpose (A)** | Module links read "Open module 2: AI and NLP content engine" rather than six identical "Open"s. Bare criterion numbers on the scaffold pages are plain text, not links, precisely because "WCAG 1.4.3" is a meaningless link name. | `page.tsx` content; axe `link-name` |
| **2.4.5 Multiple Ways (AA)** | Header navigation, per-module cards on the home page, and contextual links between pages. | Manual |
| **2.4.6 Headings and Labels (AA)** | One `h1` per page; control groups use `<legend>`; sections use `aria-labelledby` pointing at a real heading. | axe `heading-order`, `region` |
| **2.4.7 Focus Visible (AA)** | Every interactive element gets a 3px `:focus-visible` outline with a 2px offset; the "strong focus outline" setting adds a contrasting double ring that survives any background. | `globals.css`; manual |
| **2.4.11 Focus Not Obscured (AA, 2.2)** | The settings launcher is `fixed` and never hidden by focus mode — hiding it would strand a learner inside focus mode. The reading ruler is `pointer-events: none` and cannot cover a control. | `renders a launcher that is not hidden by focus mode` test (this caught a real bug) |
| **2.5.1 Pointer Gestures (A)** | No multipoint or path gestures. Sliders also have large +/- buttons for coarse motor control. | `RangeStepper` |
| **2.5.2 Pointer Cancellation (A)** | Actions fire on the up event (native buttons); nothing triggers on down. | Native element usage |
| **2.5.3 Label in Name (A)** | Where an accessible name extends the visible text (e.g. "Accessibility settings, 3 settings changed"), the visible label is a prefix. | `counts changed settings in the launcher’s accessible name` test |
| **2.5.4 Motion Actuation (A)** | No device-motion input. | Source review |
| **2.5.5 Target Size (AAA)** | 48 × 48 px minimum, implemented as `3rem` so it *grows* with the learner's text size. | `touch-targets.test.tsx` (class chain) + layout review |
| **2.5.8 Target Size Minimum (AA)** | Same mechanism; inline text links are exempt under the criterion's inline exception, which is why the touch-target test scopes itself to controls. | `touch-targets.test.tsx` |

## Understandable

| Criterion | What we do | How verified |
| --- | --- | --- |
| **3.1.1 Language of Page (A)** | `<html lang="en">`, and `document.documentElement.lang` drives the TTS utterance language. | `layout.tsx`, `SpeechProvider` |
| **3.1.2 Language of Parts (AA)** | Lessons carry a `language` field; the content pipeline is per-language and the schema stores it. Regional-language lesson rendering is not built yet. | Schema only — **not verified** |
| **3.1.5 Reading Level (AAA)** | Content is simplified to the learner's grade, and the simplification is measured (Flesch–Kincaid before/after) rather than assumed. | `simplifier.test.ts` asserts a measurable drop |
| **3.2.1 On Focus (A)** | Focus never triggers navigation or a settings change; the ruler responds to focus visually only. | `ScreenRuler` review |
| **3.2.2 On Input (A)** | Settings changes apply immediately and are only *confirmed* by an announcement; nothing submits or navigates on input. | Provider tests |
| **3.2.3 Consistent Navigation (AA)** | One header, identical order on every route, rendered by the root layout. | `layout.tsx` |
| **3.2.4 Consistent Identification (AA)** | The voice dock and settings dialog are mounted globally, so their controls and labels are identical on every page — including the offline fallback. | `AppProviders` |
| **3.3.1 Error Identification (A)** | Microphone failures are explained in plain language with the keyboard alternative in the same sentence. | `describeRecognitionError`, tested via the grammar/command suites |
| **3.3.2 Labels or Instructions (A)** | Every control has a visible label plus a hint explaining the effect. | axe; `groups every family of controls under a legend` |
| **3.3.3 Error Suggestion (AA)** | A rejected sync item carries a plain-language `message`. A 404 page states what to do next rather than only what went wrong. | `api.test.ts`; `not-found.tsx` |
| **3.3.4 Error Prevention (AA)** | There are no destructive actions a learner can take. "Reset everything" is a settings-only action and returns focus to a visible control. | `accessibility-toolbar.test.tsx` |

## Robust

| Criterion | What we do | How verified |
| --- | --- | --- |
| **4.1.1 Parsing (A)** | Valid HTML: no nested interactive elements (hence `TouchLink`/`TouchButton` as siblings). | `eslint-plugin-jsx-a11y`; axe |
| **4.1.2 Name, Role, Value (A)** | Native elements first; `role="switch"` + `aria-checked`; `aria-valuetext` in words ("120 percent"); `aria-expanded`/`aria-controls` on the launcher. | axe; `range-stepper.test.tsx` |
| **4.1.3 Status Messages (AA)** | Two live regions mounted for the lifetime of the app: `role="status"` (polite) and `role="alert"` (assertive). Every command confirms *state* ("Reading ruler on"), not just the action. | `announces messages through the polite live region`; `keeps both live regions mounted at all times` |

## Beyond WCAG

Things this project does that the guidelines do not require, and why:

- **Reading ruler** — a pointer/focus-tracking band for line tracking. It does not
  dim the rest of the page: greying out content lowers its contrast (a 1.4.3
  problem), and some learners find a spotlight more distracting than helpful.
- **Four measured-theme palettes** including yellow-on-black and cream-on-dark-blue,
  which are the palettes low-vision learners most often request.
- **OpenDyslexic / Lexend / Atkinson Hyperlegible**, each previewed in its own
  typeface so the choice is made by eye, not by name.
- **0.5×–1.25× speech rate**, capped deliberately: faster narration stops being
  useful and starts being a comprehension barrier.
- **`prefers-contrast: more`** strengthens separators, and **`forced-colors: active`**
  defers to the OS palette instead of fighting it.
- **Fuzzy voice matching** tuned to accept "reed this" while rejecting ordinary
  speech, because exact matching would exclude the learners who need voice most.

## Testing with real users

Automated checks cannot validate this product. Before classroom rollout:

1. **Screen readers**: NVDA + Firefox, TalkBack + Chrome on a low-end Android
   tablet. Specifically: the settings dialog's group announcements, live-region
   behaviour when the ruler and a command fire together, and whether the reading
   ruler is distracting at 2.2rem.
2. **Voice recognition** with 8–12 children aged 6–10, including at least two with
   a speech impairment and two with strong regional accents. Measure command
   recognition rate and re-prompt rate; the threshold in `grammar.ts` (0.74) is
   tuned for what they actually say.
3. **Cognitive load**: does the panel's seven control groups overwhelm a learner
   on first contact? The preset row exists to answer "yes" without removing the
   fine controls.
4. **Shared-device reality**: does the pre-hydration cache help or confuse when
   two children with different settings share one tablet?

## Remaining gaps

1. **No browser-automation accessibility suite.** jsdom performs no layout, so
   axe's `color-contrast` rule is disabled there (contrast is verified
   numerically instead) and target sizes are verified via the class chain rather
   than measured pixels. A Playwright suite should measure both for real.
2. **Screen reader behaviour is unverified.** No NVDA/TalkBack run has been done.
3. **Speech recognition accuracy for child speech is unverified.** The tolerance
   settings and prompt-biasing are implemented from the literature and the
   `expectedPhrases` contract, not from measured results.
4. **Voice control is limited to the command grammar.** Free-form dictation in
   answer fields is available, but conversational correction ("no, the other
   one") is not.
5. **Regional-language lessons are not rendered.** The types, the language fields
   and the TTS language plumbing exist; the content pipeline does not yet produce
   non-English simplifications, and the CJK/Arabic font stacks have not been
   audited for line height at 2.5.
6. **No high-contrast custom theme editor.** Teacher-authored palettes are
   planned; `themeContrastReport()` already makes it safe to build, since it can
   refuse a palette before it is saved.
7. **Table captions page-by-page**: headings and captions are reviewed manually
   for the new pages, since `heading-order` catches only some of it.
