# SPEC: `/preview/:surah/:range` — shareable tajweed verse-range viewer

Status: approved. Derived from a plan-mode conversation where the product owner selected the recommended option for each open decision (see "Decisions" below — none of these are open questions).

## Problem

Murajah's reader is personal: layout/tajweed toggles persisted per visitor, single page + prev/next paging, local mistake marks. There is no way to hand someone else a link that shows a specific verse range with specific words called out, rendered the same way for every viewer regardless of their own settings or history.

## Feature

A new read-only route, `/preview/:surah/:range`, that:
- Always renders Uthmani script in the tajweed (QPC tajweed) font — never the visitor's own layout/tajweed preference.
- Shows a verse range within one surah, laid out as real 15-line mushaf pages. A range spanning more than one page stacks the pages vertically with a visible divider between them (scrollable), rather than the normal single-page + prev/next pager.
- Highlights specific words via URL query parameters, in up to six colors, so the highlight state lives entirely in the link.
- The first verse of the range gets the same "you are here" treatment (soft highlight wash + auto-scroll into view) that surah/juz quick-jumps already give their target verse.

## Decisions (approved, not open)

1. **URL shape**: `/preview/:surah(\d{1,3})/:range(\d+(?:-\d+)?)`. `range` is `12-45` or a bare `12` (single verse). Single-surah only — no cross-surah ranges in v1.
2. **Highlight query params**: six color slots as query keys — `red` (aliased by a colorless `hl=`), `amber`, `blue`, `green`, `purple`, `teal`. Each value is a comma-separated list of tokens: `ayah`, `ayah:word`, or `ayah:word-word` (e.g. `?red=12:1,12:3-5&blue=20&amber=30:2-4`). `red`/`hl` is the default and reuses the app's existing mistake-marking style verbatim (red wavy underline) — not a new visual style. The other five are new background-wash colors. A word claimed by more than one color resolves by fixed priority: red > amber > blue > green > purple > teal. Malformed tokens are dropped individually, never fatal to the whole param.
3. **Chrome**: minimal standalone. No bottom tab bar, no forced first-run onboarding/language-picker, a slim header only (surah name + range + a way back). Words are inert — no tap-to-open-morphology, no tap-to-mark-mistake.
4. **Local mistake marks**: the viewer's own locally-stored mistake marks never render on `/preview` — only the URL's highlight params do, so the same link looks identical to every viewer regardless of their device/history.
5. **Page cap**: 12 pages per range. Above that: a friendly error state with a link into the normal paged reader at the range's start verse — no attempt to fetch the data.

## Explicitly out of scope for v1

- Cross-surah ranges.
- Full app-shell chrome (bottom tab bar, forced onboarding) on this route.
- Rendering the viewer's own local mistake marks on this view.
- Any write/mutation capability (no mistake-marking, no morphology popup, no settings changes) from this view.

## Acceptance (end-to-end)

- `/preview/2/255` renders surah 2 ayah 255 alone, tajweed font, first-verse highlight + scroll.
- `/preview/2/12-45` renders the full page range covering those verses, stacked with dividers, in tajweed, regardless of the visitor's saved reader preferences.
- `/preview/2/12-45?red=12:1,12:3-5&blue=20&amber=30:2-4` colors exactly those words in the corresponding style/wash.
- `/preview/999/1` (bad surah), `/preview/2/9999` (bad ayah), and a range spanning >12 pages each show a friendly error with a working link into the normal reader.
- No bottom tab bar, no onboarding block, no tap interactivity anywhere on this route.
- A first-time visitor (no local storage / prefs at all) sees the same rendered result as an existing user with a persisted `tajweed=false`/mistake-marks history.

Full technical design (file-by-file plan, architecture decisions validated against the actual codebase, risks/mitigations) is in `tasks/plan.md` and `tasks/todo.md`.
