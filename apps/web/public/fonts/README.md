# Self-hosted fonts

The accessibility layer offers OpenDyslexic, Lexend, Atkinson Hyperlegible, Inter
and the device default. Nothing is loaded from a third-party CDN: school proxies
frequently block font hosts, and a blocked font request must never delay the first
readable paint or silently change how a learner's text looks.

Until the files below are added, each option still works — it falls back to the
next family in its stack — but the specific letterform the learner chose is not
guaranteed.

## 1. Add the font files

Download the WOFF2 files and place them in this folder:

| Token             | Files to add                  | Source                                       | Licence            |
| ----------------- | ----------------------------- | -------------------------------------------- | ------------------ |
| `opendyslexic`    | `opendyslexic-regular.woff2`  | https://opendyslexic.org                     | Bitstream Vera (free) |
| `lexend`          | `lexend-variable.woff2`       | https://fonts.google.com/specimen/Lexend     | SIL OFL 1.1        |
| `atkinson`        | `atkinson-hyperlegible.woff2` | https://brailleinstitute.org/freefont        | SIL OFL 1.1        |
| `inter`           | `inter-variable.woff2`        | https://rsms.me/inter                        | SIL OFL 1.1        |

Include each licence file alongside the font. OFL fonts must ship with their
licence text, and the Bitstream Vera licence has its own attribution terms.

## 2. Declare them

Add the block below to `apps/web/src/app/globals.css`, at the top after
`@import 'tailwindcss'`.

`font-display: swap` is intentional: a learner sees text immediately in the
fallback face rather than a blank space. `unicode-range` is omitted so the browser
uses each face for every script it can render — several of these faces cover Latin
Extended, which regional-language lessons need.

```css
@font-face {
  font-family: 'InterVariable';
  src: url('/fonts/inter-variable.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Lexend';
  src: url('/fonts/lexend-variable.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'OpenDyslexic';
  src: url('/fonts/opendyslexic-regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Atkinson Hyperlegible';
  src: url('/fonts/atkinson-hyperlegible.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
```

## 3. Precache them

Add the same paths to `PRECACHE_URLS` in `apps/web/public/sw.js` so a learner who
picked OpenDyslexic still gets it after the tablet goes offline. Fonts are small
(≈30–90 KB each) and are served with `Cache-Control: immutable` (see
`next.config.ts`), so this is a cheap win.

## Adding a new family

1. Add the token to `FONT_FAMILIES` in `packages/shared/src/a11y/typography.ts`
   and its stack to `FONT_FAMILY_DEFINITIONS`.
2. Add the `@font-face` rule and the file.
3. Nothing else — the picker, the settings model and the CSS all read from that
   one list.
