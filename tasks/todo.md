# Task List: `/preview/:surah/:range`

All commands run from `app/`. See `tasks/plan.md` for architecture context.

> **Deviation found during Task 1**: vue-router's path tokenizer can't parse a
> nested group inside a custom param regex (`:range(\d+(-\d+)?)` throws
> "Unterminated group" at router creation — confirmed empirically, exactly the
> risk the plan flagged). Implemented as **two route records** instead:
> `preview-range` (`/preview/:surah/:ayah-:endAyah`) and `preview`
> (`/preview/:surah/:ayah`). Downstream tasks work with resolved
> `{surah, ayah, endAyah?}` params, not a single `range` string — read
> `route.params` accordingly; `previewRoute.ts`'s parse function takes
> `{surah, ayah, endAyah?}`, not `{surah, range}`.

---

## Task 1: Route registration, shell-chrome guards, and a stub view
- [ ] Register `preview` route (`/preview/:surah(\d{1,3})/:range(\d+(?:-\d+)?)`) in `src/router/index.ts`, add to `READER_ROUTES`.
- [ ] Add `'preview'` to `App.vue`'s `NO_SHELL_ROUTE_NAMES` and `NO_ONBOARDING_ROUTE_NAMES`.
- [ ] Stub `src/features/preview/PreviewView.vue` (renders raw route params), code-split like every other route.

**Acceptance:**
- `router.resolve('/preview/12/12-45')` → `{ name: 'preview', params: { surah: '12', range: '12-45' } }`; same for bare `12`.
- `readerEnabled()` false → `/preview/1/1` redirects to `reader-disabled`.
- `showShellNav` / `showOnboarding` both `false` on route name `preview`.

**Verify:** `npx vitest run tests/unit/preview-route.test.ts -t "route registration"`; `npm run build`
**Depends on:** none
**Files:** `src/router/index.ts`, `src/App.vue`, `src/features/preview/PreviewView.vue` (new), `tests/unit/preview-route.test.ts` (new)

---

## Task 2: Highlight design tokens
- [ ] Add `--hl-amber/blue/green/purple/teal` to all 4 theme blocks in `src/design/tokens.css` (`:root`/light, `dark`, `sepia`, prefers-color-scheme dark) + `@theme inline` bridge.

**Acceptance:**
- All 5 tokens present in all 4 blocks + bridge (10 insertion points).
- No value literally duplicates an existing `--tajweed-*` value in the same block.
- Light `:root` values match the dark-media-query block's dark values (mirrors existing `--tajweed-*` duplication).

**Verify:** `npm run build`
**Depends on:** none
**Files:** `src/design/tokens.css`

---

## Task 3: Widen `ReadingSurface.vue` — highlight states + inert-cursor support
- [ ] Widen `wordStates` prop union with `'hl-amber'|'hl-blue'|'hl-green'|'hl-purple'|'hl-teal'`.
- [ ] Add matching `.state-hl-*` CSS on `.word` (not `.arabic`), modeled on `.state-morphology`.
- [ ] Add `interactive?: boolean` prop (default `true`); `false` drops the `.word` pointer cursor.

**Acceptance:**
- Type includes all 6 states (`mistake` reused for red/default).
- 5 new CSS rules exist, `background: color-mix(in oklab, var(--hl-*) 22%, transparent)` on `.word`.
- `interactive=false` removes pointer cursor without affecting other consumers' default behavior.
- `reader-tajweed.spec.ts` unaffected (no new props passed there).

**Verify:** `npm run build`; `npx playwright test tests/e2e/reader-tajweed.spec.ts`
**Depends on:** none (parallel with 1–2)
**Files:** `src/features/reader/ReadingSurface.vue`

---

## Task 4: `previewRoute.ts` — surah/range parsing & validation
- [ ] Pure function: `{surah, range}` params → `{surah, startAyah, endAyah}` or a typed error (`'surah'|'range'`), validated against `ayahCount()` from `core/quran/surahMeta.ts`.
- [ ] Separate pure page-cap function: `(startPage, endPage) => boolean`, cap 12.

**Acceptance:**
- Valid `12` and `12-45` parse correctly; inverted `45-12` rejected.
- Surah `0`/`115` rejected.
- Ayah beyond `ayahCount(surah)` rejected (e.g. surah 1 has 7 ayahs → `1/8` rejected).
- Page-cap: 11 passes, 12 passes, 13 fails.

**Verify:** `npx vitest run tests/unit/preview-route.test.ts -t "parsePreviewRange"`
**Depends on:** Task 1 (test file scaffold)
**Files:** `src/core/navigation/previewRoute.ts` (new), `tests/unit/preview-route.test.ts`

---

## Task 5: `previewRoute.ts` — highlight token parsing
- [ ] Pure function: six color query params → per-color `{ayah, wordStart?, wordEnd?}[]` specs.
- [ ] Tokens: `ayah`, `ayah:word`, `ayah:word-word`, comma-separated. `hl=` merges into `red` (both may coexist).
- [ ] Malformed tokens dropped individually, siblings survive.

**Acceptance:**
- `red=12:1,12:3-5` → two specs as expected.
- `blue=20` → `{ayah:20}` (no word bound).
- `abc`, `12:`, inverted `12:5-3`, stray commas → dropped, valid siblings kept.
- `hl=12:1&red=12:2` → both specs land in `red`, neither overwrites the other.
- Unknown query params ignored.

**Verify:** `npx vitest run tests/unit/preview-route.test.ts -t "parseHighlightParams"`
**Depends on:** Task 4 (same file)
**Files:** `src/core/navigation/previewRoute.ts`, `tests/unit/preview-route.test.ts`

---

## Task 6: `previewRoute.ts` — `resolveWordStates` priority resolution
- [ ] `resolveWordStates(specsByColor, words: Word[]) → Record<location, WordState>`, fixed priority `red > amber > blue > green > purple > teal`.

**Acceptance:**
- Non-overlapping specs both surface correctly.
- Overlap at the same word: higher priority wins.
- **Mixed-grain**: `red=12:3` + `blue=12` (whole ayah) against a 6-word fixture ayah → word 3 is `mistake`, words 1,2,4,5,6 are `hl-blue`.
- Uses a hand-built fixture `Word[]`, no data-layer dependency.

**Verify:** `npx vitest run tests/unit/preview-route.test.ts -t "resolveWordStates"`
**Depends on:** Task 5
**Files:** `src/core/navigation/previewRoute.ts`, `tests/unit/preview-route.test.ts`

---

## Task 7: i18n strings
- [ ] Add `preview.*` keys to `en`/`ar`/`bn` catalogs: title/range label, invalid-surah, invalid-range, range-too-large, open-in-reader link text, back label.

**Acceptance:**
- Identical key set across all three catalogs.
- Keys match existing nesting/naming conventions (see `reader:` block).

**Verify:** manual key-parity check now; `npm run build` retroactively once Tasks 10–11 consume the keys
**Depends on:** none (parallel with 1–6)
**Files:** `src/core/i18n/catalogs/en.ts`, `ar.ts`, `bn.ts`

---

## Task 8: `usePreviewPages.ts` composable
- [ ] Given `{surah, startAyah, endAyah}`: resolve pages via `getNavIndex('qpc').ayahToPage`, apply Task 4's page-cap check (no fetch if over cap), load each page via `data.getPage('qpc', p)` + `fonts.ensure({layout:'qpc', page:p, tajweed:true})`.
- [ ] Reactive per-page `{status:'loading'|'ready'|'error', chunk, family}` (mirrors `useReaderPages`'s `PageEntry`), plus `retry(page)`.
- [ ] Injectable `data`/`fonts`, default real singletons. **Never** reads `useReaderStore`. **No** dedicated `FontLoader` instance — reuse `getFontLoader()`.

**Acceptance:**
- >12 pages → error state, zero `getPage`/`fonts.ensure` calls (assert via spy call count).
- Exactly 12 pages → proceeds normally.
- Each page's status flips independently (a slow/failing page doesn't block siblings).
- `retry(page)` re-attempts only that page.
- No read of `reader.tajweed`/`reader.layout`/any reader-store field anywhere in the file.

**Verify:** `npx vitest run tests/unit/preview-pages.test.ts`
**Depends on:** Task 4
**Files:** `src/composables/usePreviewPages.ts` (new), `tests/unit/preview-pages.test.ts` (new)

---

## Task 9: `ReadingSurface.vue` cross-instance `fitFactor` coordination
- [ ] Add optional `fitFactor?: number` prop — when present, `fitLines()` applies it instead of the locally measured factor (still clamped to `[0.35, 1.6]`).
- [ ] `emit('fit', measuredFactor)` — always the measured value, never the applied one, on every `fitLines()` run (mount + ResizeObserver refit).
- [ ] No prop/listener → behavior identical to today.

**Acceptance:**
- `reader-tajweed.spec.ts` passes unmodified (the actual regression proof).
- With `fitFactor` set, applied `font-size` uses it, not the row-measured factor.

**Verify:** `npx playwright test tests/e2e/reader-tajweed.spec.ts`; `npm run build`
**Depends on:** none functionally (grouped in Phase 2 because Task 11 needs it)
**Files:** `src/features/reader/ReadingSurface.vue`

---

## Task 10: `PreviewView.vue` — chrome, route wire-up, error states
- [ ] Parse route via Task 4/5 functions.
- [ ] Surah name via `getDataClient().getSurahNames()` (pattern: `useReaderLocation.ts`).
- [ ] Slim header: surah name + range label + back control → `readerLink({surah, ayah: startAyah})`.
- [ ] Three error states (invalid surah, invalid/inverted range, range-too-large), each with an "open in reader" link via `readerLink`. Invalid-surah fallback: `{name: 'home'}` (no valid `readerLink` target exists).
- [ ] **No** `@/stores/reader` import anywhere in this file.

**Acceptance:**
- `/preview/999/1` → invalid-surah state, no fetch attempted, links to home.
- `/preview/2/9999` → invalid-range state, links via `readerLink({surah:2, ayah:1})`.
- >12-page range → range-too-large state, links via `readerLink({surah, ayah: startAyah})`.
- Header shows surah name + range (e.g. "12:1–45") + back control.
- `grep -L "stores/reader" src/features/preview/PreviewView.vue` confirms no import.

**Verify:** `npx vitest run`; `npm run build`
**Depends on:** Tasks 1, 4, 5, 7
**Files:** `src/features/preview/PreviewView.vue`

---

## Task 11: `PreviewView.vue` — page stack, highlights, active-verse, inert taps
- [ ] Use `usePreviewPages` (Task 8); one `ReadingSurface` per page, stacked, divider between pages (omitted if single page).
- [ ] Wire `fitFactor`/`@fit` (Task 9) across all mounted surfaces.
- [ ] `word-states` from `resolveWordStates` (Task 6) per page's own `Word[]`.
- [ ] `active-verse` = `"{surah}:{startAyah}"` on first page only; unset elsewhere.
- [ ] **Never** pass `mistake-ids`. `interactive={false}` on every surface.
- [ ] Per-page loading/error UI reuses `ReaderPager.vue`'s `Skeleton`/retry pattern.

**Acceptance:**
- Single-page range: no divider. Multi-page: divider between each pair.
- Every surface resolves a `tj-p*` family regardless of persisted `reader.tajweed=false`.
- First page's `active-verse` correct; others unset.
- `grep -L "mistake-ids" src/features/preview/PreviewView.vue` confirms the prop name never appears.
- Tapping a word does nothing (no popup, no toggle).
- Loading → Skeleton; failed → retry button that re-attempts only that page.

**Verify:** `npm run build` (full e2e coverage lands in Task 12)
**Depends on:** Tasks 3, 6, 8, 9, 10
**Files:** `src/features/preview/PreviewView.vue`

---

## Task 12: E2E test suite
- [ ] New `tests/e2e/preview.spec.ts` (style: `tests/e2e/reader-tajweed.spec.ts`).

**Cases:**
- Single-page highlight rendering (`.state-mistake` for red/`hl`, `.state-hl-*` for others) at correct `data-loc`s.
- Multi-page divider + stacking order.
- Font-cap check: 12-page range → *last* page still resolves `tj-p*`.
- Always-tajweed despite a persisted `reader.tajweed=false`.
- First-verse `state-playing` wash + scroll-into-view on load.
- Invalid surah / invalid range / oversized range → correct error state + working outbound link.
- Inert taps: no morphology popup, no mistake-mark toggle.
- Fresh-visitor run (`test.use({ storageState: { cookies: [], origins: [] } })`) → onboarding modal does not block `/preview`.

**Verify:** `npx playwright test tests/e2e/preview.spec.ts`; `npm run test` (full suite, final gate)
**Depends on:** Tasks 1–11
**Files:** `tests/e2e/preview.spec.ts` (new)
