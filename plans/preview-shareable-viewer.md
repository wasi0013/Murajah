# Implementation Plan: `/preview/:surah/:range` — shareable tajweed verse-range viewer

## Overview

A new read-only `/preview/:surah/:range` route: always Uthmani tajweed, shows a verse range (stacked across pages when it spans more than one, with a divider — not the normal single-page-plus-prev/next reader), and highlights specific words in up to six colors, entirely driven by URL query params so a link is fully self-contained. Minimal standalone chrome (no bottom tab bar, no forced onboarding), no interactivity (words are inert), and the viewer's own locally-stored mistake marks never bleed into the view.

Full context, the four product decisions this was scoped against, and the code-level findings that shaped the approach are in `/Users/wasi/.claude/plans/virtual-petting-hopcroft.md` (the approved plan-mode doc for this feature). Key findings repeated here because they're load-bearing:

## Architecture Decisions

- **Highlighting is backgrounds, not text color.** The tajweed font (`tj-p{page}`) is a COLR/CPAL color font — `color:` on glyph text is a no-op (see `ReadingSurface.vue`'s own comment). New highlight colors are `background` washes on `.word` (never `.arabic`, which carries the dark-theme glyph filter), same technique as the existing `.state-morphology` rule. The default/`red` highlight reuses the **existing** `.state-mistake` class verbatim — no new CSS for it.
- **New composable, not reuse of `useReaderPages`.** That composable is built around a single scalar `reader.page` with keep-radius eviction — wrong shape for a stacked multi-page view. `usePreviewPages` calls `data.getPage` / `fonts.ensure` directly, always `{layout:'qpc', tajweed:true}`, never touching the reader store.
- **`App.vue` needs two gate additions the original spec didn't name**: `NO_SHELL_ROUTE_NAMES` (bottom tab bar) and `NO_ONBOARDING_ROUTE_NAMES` (the non-dismissible first-run language picker) both need `'preview'` added — otherwise a shared link blocks a first-time visitor behind a language-pick screen, the exact problem `/download` already exists to avoid.
- **Highlight resolution is two-stage.** A bare `ayah` token ("whole verse") can't become concrete `s:a:w` locations until the page's real `Word[]` is loaded (surah metadata only has ayah *counts*). Stage 1 (pure): query → per-color `{ayah, wordStart?, wordEnd?}` specs. Stage 2 (pure): specs + loaded `Word[]` → `location → state` map, applying fixed priority `red > amber > blue > green > purple > teal`. Both independently unit-tested, including the mixed-grain overlap case (a whole-ayah color under a single-word color of a different color).
- **`fitLines()` needs cross-instance coordination.** It currently computes one font-scale factor per mounted `ReadingSurface`, invisible with one page visible but visibly inconsistent when several are stacked. Fix: an optional `fitFactor` override prop + an `emit('fit', measuredFactor)` (always the measured value, never the applied one, to avoid a feedback loop), with `PreviewView` collecting the min across all mounted instances. `ReaderPager.vue`'s existing usage passes neither → provably unchanged; `tests/e2e/reader-tajweed.spec.ts` passing unmodified is the regression guard.
- **No dedicated `FontLoader` instance for preview.** `FontLoader.maxFaces` defaults to 12, same as the page cap — a second instance would double-register the same font-family names into `document.fonts`, worse than the (traced-out-as-low) eviction risk. Reuse the shared `getFontLoader()`; cover the edge with an e2e assertion that the last page of a full 12-page range still resolves `tj-p*`.
- **Page cap: 12** (~1.3 MB worst case of unique per-page tajweed font files) — beyond that, a friendly error linking into the normal paged reader, no fetch attempted.

## Task List

### Phase 1: Foundation (parallelizable)
- [x] Task 1: Route registration, shell-chrome guards, stub view
- [x] Task 2: Highlight design tokens in `tokens.css`
- [x] Task 3: Widen `ReadingSurface.vue` (`wordStates` + `.state-hl-*` + `interactive` prop)
- [x] Task 4: `previewRoute.ts` — surah/range parsing & validation
- [x] Task 5: `previewRoute.ts` — highlight token parsing
- [x] Task 6: `previewRoute.ts` — `resolveWordStates` priority resolution
- [x] Task 7: i18n strings (en/ar/bn)

### Checkpoint: Phase 1
- [x] `npm run test:unit` and `npm run build` (in `app/`) green
- [x] `/preview/12/1-5` resolves via `router.resolve()` to the stub with correct params; no tab bar / onboarding block on that route

### Phase 2: Data loading & the fit fix
- [x] Task 8: `usePreviewPages.ts` composable
- [x] Task 9: `ReadingSurface.vue` cross-instance `fitFactor` coordination

### Checkpoint: Phase 2
- [x] Composable unit tests green (page-cap short-circuit via call-count spy; independent per-page readiness)
- [x] `npx playwright test tests/e2e/reader-tajweed.spec.ts` passes unmodified

### Phase 3: Rendering
- [x] Task 10: `PreviewView.vue` — chrome, route wire-up, error states
- [x] Task 11: `PreviewView.vue` — page stack, highlights, active-verse, inert taps

### Checkpoint: Phase 3
- [x] `npm run build` clean
- [x] Manual: single-page range, multi-page range, overlapping multi-color query

### Phase 4: Test coverage
- [x] Task 12: `tests/e2e/preview.spec.ts`

### Checkpoint: Complete
- [x] `npm run test` (unit + e2e) green end-to-end
- [x] `npm run build` clean
- [x] Manual: `/preview/2/255`, `/preview/2/1-5` (multi-page), `/preview/999/1` (invalid surah), `/preview/2/9999` (invalid range), a >12-page range, and an overlapping multi-color highlight query

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Custom param regex `\d+(?:-\d+)?` doesn't parse as expected in Vue Router | High — reshapes every downstream task | Proven empirically via `router.resolve()` in Task 1, first thing built |
| 12-page cap coincides with `FontLoader`'s default `maxFaces` (12) | Low (traced: eviction only removes oldest; nothing else touches reader fonts while preview is mounted) | e2e assertion (Task 12) on the last page of a 12-page range, not extra code |
| Bare-`ayah` highlight tokens need loaded word data to resolve | Medium — naive flat parsing mishandles mixed-grain overlap | Two-stage design (Tasks 5+6) with an explicit mixed-grain test |
| `App.vue` shell/onboarding gating easy to miss (spec never named `App.vue`) | High — "minimal chrome" would silently be false | Explicit Task 1 deliverable + dedicated fresh-visitor e2e case (Task 12) |
| `fitLines()` coordination regresses the single-page reader | Medium | Emit measured (not applied) factor; `reader-tajweed.spec.ts` unmodified is the guard (Task 9) |

## Open Questions

- Fallback link target for the "invalid surah" error (no valid `readerLink` target exists when the surah itself is unresolvable) — default to `{ name: 'home' }`.
- Exact hex values for the five new `--hl-*` tokens are a reasonable first pass per the approved plan ("commit and refine") — a visual contrast pass against the tajweed ink colors happens once Task 11 makes them visible, not a blocker before then.
