# Phase 3 — Reading Experience (FLAGSHIP) (granular tasks)

**Parent:** [redesign-2026.md](./redesign-2026.md) §5 (Phase 3) · **Prereqs:** Phase 1 (data/font layer) + Phase 2 (design system) complete. **Goal:** rebuild the screen users complain about — the two **text** reading surfaces (Madani/QPC uthmani + Asian/Indopak) — as a blazing-fast, interactive reader that hits every §3 budget and reaches **parity with the legacy reader, tajweed fidelity included**. Ships behind a flag.

> The mushaf **image** view (PNG/WebP scans, desktop 2-up) is **Phase 3b**, a separate route — not in this file. This phase is the two glyph-font text surfaces only.

**Definition of done:** on a throttled mid Android, page-to-page nav ≤100ms with no layout shift, word-tap→morphology ≤100ms, no scroll long-task >50ms; QPC tajweed renders identically to legacy; WBW, morphology-on-tap, mistake-mark, and inline tafsir all work and persist; reader state survives reload + is URL-addressable; the whole thing is behind a flag and does **not** regress migrated memorization data. Bundle budgets (§3) still green; morphology/tafsir load lazily and never enter the initial reader chunk.

> Local-first constraint stands: **no CDNs, no backend.** Every new dataset is a build-time chunk served statically and cached in IndexedDB via the Phase 1 worker transport. The "flag" is a client-side flag (build env + localStorage override), not a server.

---

## 3.0 — Reader data addenda (Phase 1 gaps this phase needs)
> Two datasets the reader depends on don't exist yet. Build them in `data-pipeline/` first, with round-trip/spot tests, so the rest of the phase has real data. Each new dataset registers in the manifest (`datasets`/`indexes`) exactly like existing chunks.

- [x] **3.0.1** **Navigation indexes.** Emit compact lookup indexes so `parseJump` results resolve to a page for the active layout: `ayah→page` (`s:a` → page, per layout), `juz→page` (first page of each juz, per layout), and `surah→page` (per layout). Reuse existing layout sources; these are small JSON maps.
  - *Verify:* pipeline round-trip/spot test — known refs resolve (`2:255`→page, `juz 5`→page, `surah 36`→page) for **both** qpc and indopak; counts sane (114 surahs, 30 juz); files listed under manifest `indexes`.
  - **Done:** `data-pipeline/src/build-nav-index.mjs` (pure `buildNavIndex` + canonical `JUZ_STARTS`, derived from `quran.json` `page`/`indopak_page`) emits `data/nav/{qpc,indopak}.json` (72.5KB / 12.7KB gz each), registered as manifest indexes `navQpc`/`navIndopak`; `nav-index.test.mjs` (4 tests, all 6236 verses) + app-side `DataClient.getNavIndex(layout)` with `NavIndex` type and unit + real-fixture tests. The `getNavIndex` half of **3.0.3** is therefore also done.
- [x] **3.0.2** **Morphology chunks.** Port legacy `morphologyLoader`/`morphologyStore` data into **per-surah** chunks keyed by word location (`s:a:w`), matching the WBW-translation chunking pattern (so a tapped word loads only its surah's morphology). Strip fields the popup doesn't render.
  - *Verify:* round-trip test on ≥2 surahs (incl. a long one) — every word location present, payload ≤ budget per surah; a sample word's grammar fields match legacy output.
  - **Done:** morphology is one self-contained HTML string per word (rendered via `v-html`), wrapped `{ data: { "s:a:w": html } }` — no separable grammar fields, so the win is unwrapping `.data` to the flat map. `chunk-morphology.mjs` (`unwrapMorphology`/`wrapMorphology`) emits `data/morphology/{surah}.json` (114 chunks, worst case surah 2 = 112.8KB gz, comparable to tafsir-ar), registered as dataset `morphology`; `roundtrip-morphology.test.mjs` (7 tests, incl. the 6116-word surah 2 + content spot-check). All 77,429 word entries verified keyed `s:a:w`.
- [x] **3.0.3** Extend `DataClient` with `getMorphology(surah)` + `getNavIndex(layout, kind)` (or fold into existing index accessors), typed, worker-routed, dedupe-cached — same shape as `getTranslations`/`getTafsirMapping`.
  - *Verify:* unit tests (mock transport) for path construction + return typing; calls resolve through `workerTransport` in an e2e smoke.
  - **Done:** `getNavIndex(layout)` (→ `NavIndex`) + `getMorphology(surah)` (→ `MorphologyChunk`) added with `morphologyPath` in `paths.ts`; both go through the injected transport (worker in prod, dedupe-cached). Unit tests (mock path selection) + real-fixture tests (nav resolves `2:255`→42; morphology `1:1:1` unwrapped). 313 unit tests + type-check green; bundle unchanged (43.04KB, data is static).

## 3.1 — Reader store (single source of truth)
- [x] **3.1.1** `stores/reader.ts` (Pinia): `page`, `layout` (qpc/indopak), `tajweed` (on/off), `wbw` (on/off + lang en/bn), `tafsir` (on/off + lang ar/en/bn), `textSize` (step), `mode` (`read` | `mark-mistake`). Actions: `goToPage`, `nextPage`/`prevPage` (clamped to layout page count), `setLayout` (remap current page across layouts via 3.0.1 so the reader doesn't jump surahs), toggles.
  - *Verify:* unit tests — clamping at page 1 / last page; `setLayout` keeps the reader on the same ayah across qpc↔indopak; toggles independent.
  - **Done:** `stores/reader.ts` (synchronous, unit-testable; page counts injected via `configure()`, `tajweedActive` derived so Indopak never shows tajweed, `READING_SIZES` step scale). Cross-layout ayah preservation is pure `core/navigation/remapPage.ts` (`ayahAtPageTop` + `remapPage`, robust for long ayahs spanning pages) — caller passes the remapped page into `setLayout`. 10 tests (store clamping/toggles + remap against real nav fixtures). 323 unit tests green.
- [x] **3.1.2** **Persistence:** debounce-persist reader settings (layout/tajweed/wbw/tafsir/textSize/last page) to IndexedDB via the storage layer; rehydrate on load. Mistakes persist separately (3.7).
  - *Verify:* set options → reload → same page + options restored (e2e); persistence is off the render path (no jank).
  - **Done:** store `snapshot()`/`restore()` (layout applied before page so it clamps correctly). `core/storage/prefs.ts` — a dedicated `murajah-prefs` IndexedDB KV (separate from the asset cache and from migrating user data), best-effort (errors swallowed). `composables/useReaderPersistence.ts` — `hydrate()` (call inside the data/font await window → no flash) + a 300ms-debounced watch on `snapshot()`. Tests (5): snapshot/restore purity + clamping, KV round-trip, and a full change→persist→fresh-store→hydrate round-trip. The reload-based e2e lands with the reader shell in 3.10.
- [x] **3.1.3** **URL/state sync:** reflect page + key view options in the route (e.g. `/read/:layout/:page` + query for tajweed/wbw/tafsir) with `router`; deep-link restores state; back/forward moves pages. Debounced, `replace` for within-page option toggles so history isn't spammed.
  - *Verify:* deep-link to `/read/qpc/50?tajweed=1` opens page 50 with tajweed on; browser back returns to prior page; no full reload.
  - **Done:** pure `core/navigation/readerRoute.ts` (`parseReaderRoute`/`readerStateToRoute` — path carries layout+page, query carries only *non-default* tajweed/wbw/tafsir so links stay clean; lenient parsing). `composables/useReaderRouteSync.ts` two-way binds store↔router: page/layout `push` (back/forward pages), toggle-only `replace`; loops broken structurally via `routeMatches` (no re-entrancy flag). Route `/read/:layout/:page` (name `reader`) added; `/` renamed `home`. 8 tests (parse/serialize round-trip + deep-link apply + store→URL push/replace + back/forward). Component wiring lands in 3.10; the router rename is low-risk (both routes render `ReaderView`) — a reader e2e confirms it at 3.11.3.

## 3.2 — Paged reader host + virtualization
> Mushaf reading is **page-at-a-time**, not one long scroll — so "virtualization" here = a windowed pager that mounts only current ±1 pages, never all 604/610. This kills the legacy "v-for over every word of a long surah" jank.
- [x] **3.2.1** `features/reader/ReaderPager.vue`: hosts `ReadingSurface` for the current page inside a windowed track (prev/current/next mounted; the rest virtual). Drives data+font load through `DataClient`/`FontLoader`; **prefetch ±1 page data + font** on settle.
  - *Verify:* DOM contains ≤3 mounted pages at any time regardless of surah length; switching to an already-prefetched page is instant (≤100ms, e2e timing) with **no layout shift** (CLS≈0).
  - **Done:** `ReaderPager.vue` (3 fixed offset slots `[-1,0,1]` in a translated track → ≤3 surfaces mounted) driven by `composables/useReaderPages.ts` (reactive cache, loads window + prefetches ±1, evicts beyond keep-radius, re-resolves font on tajweed toggle without refetch, clears on layout switch, injects manifest page counts via `configure`) over pure `core/reader/pageWindow.ts`. 10 unit tests (window + loader with mock clients) + e2e (`.track > .col` count = 3, forward paging updates indicator + URL).
- [x] **3.2.2** Cold-load UX: `Skeleton` page frame while a page's data/font resolve; neighbor prefetch makes forward paging feel instant. FOIT-safe (font `display:block` already) — no wrong-glyph flash.
  - *Verify:* throttled cold open shows skeleton then content, no glyph flash; forward paging after warm-up shows no skeleton.
  - **Done:** mushaf-frame skeleton (12 shimmer bars, `role="status"`) in the pager's `v-else` until an entry is `ready`; FontLoader already uses `display:block`. e2e proves skeleton→surface (word becomes non-empty). Throttled visual + no-flash checks fold into the 3.11 perf pass.
- [x] **3.2.3** Text-size control (Phase 2 `Slider`) wired to `textSize`; applies to the active surface's Arabic without reflowing chrome; steps from the 2.3.1 scale.
  - *Verify:* dragging resizes Arabic live; min/max clamp; keyboard-operable; setting persists (3.1.2).
  - **Done:** `Slider` in the interim `ReaderView` bound to `reader.textSizeStep` (0…`READING_SIZES.length-1`); `readingSize` flows to `ReadingSurface` `text-size`. e2e: ArrowRight on the slider increases the surface's computed font-size; clamping unit-tested (3.1.1); persistence via `snapshot`/`restore` (3.1.2).

## 3.3 — Gesture & keyboard navigation
- [x] **3.3.1** Swipe/drag page turns (touch + pointer): horizontal swipe advances/retreats a page, **direction respects RTL** (in Arabic reading, swipe maps to next/prev correctly); velocity + threshold; rubber-band at the ends. A real page-turn feel, **honoring `prefers-reduced-motion`** (cross-fade/instant when reduced).
  - *Verify:* swipe changes page in the correct direction for both LTR chrome and RTL content; below-threshold drag snaps back; reduced-motion path has no transform animation; no long task >50ms during the gesture.
  - **Done:** pure `core/reader/swipe.ts` (`resolveSwipe` — RTL rightward=next, distance OR velocity threshold; `dampenIfAtEdge` rubber-band). Pager uses pointer events (unified touch+mouse) with an 8px tap threshold (word taps pass through), animates a `translateX` track via `centerIndex`, then swaps the page + re-centres silently; `reduceMotion` skips the animation and commits instantly. 5 swipe unit tests + e2e (mouse-drag right → page 2 + URL). No-long-task check folds into 3.11.
- [x] **3.3.2** Keyboard + affordances: ←/→ (RTL-aware) and PageUp/Down turn pages; on-screen prev/next controls (Phase 2 `Button`/`Icon`) for desktop/webview; page indicator (page N · juz · surah).
  - *Verify:* keyboard paging works and is focus-visible; indicator updates; controls have a11y names.
  - **Done:** pure `core/reader/keyboard.ts` (`keyToPageDelta` — RTL-mirrored arrows, semantic PageUp/Down) + `useReaderKeyboard` (window listener, ignores modifiers/form fields). Prev/next `Button`s with aria-labels. Indicator enriched via `useReaderLocation` (juz + Arabic surah name from the nav index, init-safe, reloads per layout) + pure `juzForPage`/`surahForPage`. Tests: keyboard mapping + location derivation (unit) and RTL arrows + juz/surah (e2e).

## 3.4 — Layout switch (QPC ↔ Indopak)
- [x] **3.4.1** Layout `SegmentedControl` (Phase 2) bound to `reader.setLayout`; Indopak uses its single font family + Indopak reading metrics (`--indopak-line-height`/`--indopak-tracking`); QPC uses per-page glyph family + QPC metrics. `ReadingSurface` already renders both — feed it the resolved family + per-layout metrics.
  - *Verify:* toggling qpc↔indopak keeps the same ayah on screen (3.1.1), swaps font + metrics, and re-prefetches neighbors; both surfaces legible in all 3 themes.
  - **Done:** `SegmentedControl` (Uthmani/Indopak) → `useLayoutSwitch` composable, which loads + caches both nav indexes and remaps the current page (pure `remapPage`) so the **same ayah** stays on screen, then `setLayout`. `ReadingSurface` now takes a `layout` prop and applies per-surface metrics (Indopak line-height/tracking vs QPC); the pager re-resolves the Indopak family and re-prefetches on switch (existing loader). 4 unit tests (remap/cache/no-op/offline-fallback) + e2e asserting the top ayah (`data-loc`) is preserved and the font family changes.
- [x] **3.4.2** Indopak has **no tajweed** — hide/disable the tajweed toggle + legend when layout is indopak (tajweed-on-Indopak is a **backlogged** future feature, see [design-direction.md](./design-direction.md); do not fake it).
  - *Verify:* tajweed control is absent/disabled on indopak, restored on qpc; no console errors switching back and forth.
  - **Done:** the tajweed `Toggle` is `v-if="reader.layout === 'qpc'"`; the store's `tajweedActive` already forces tajweed off for Indopak regardless of the retained toggle state. e2e: switch shows the control hidden on Indopak, restored on Uthmani.

## 3.5 — Tajweed (priority-1, QPC)
- [x] **3.5.1** Tajweed `Toggle` swaps the QPC surface between the uthmani glyph family (`qpc-p{n}`) and the color tajweed family (`tj-p{n}`) via `FontLoader.ensure` — the proven Phase 1/2 mechanism. Default from the persisted setting.
  - *Verify:* toggling shows/removes tajweed colors on the live page with no reflow; colors render (Chromium COLR/CPAL) identically to legacy on 3 sampled pages (visual check).
  - **Done:** the `Toggle` (added in 3.4) drives `useReaderPages` to re-resolve the family (`tj-p{n}`↔`qpc-p{n}`) without refetching the chunk; default `tajweed=true`, restored from prefs (3.1.2). e2e proves the family swap **and no reflow** (identical word count + page height ±1px, since both per-page fonts share glyph metrics) and records `tajweed=0` in the URL. COLR/CPAL colour fidelity was confirmed in Phase 2's gallery screenshots.
- [x] **3.5.2** Wire the Phase 2 `TajweedLegend` as an on-demand legend (in the reader controls sheet), colors sourced from tokens (2.7.3).
  - *Verify:* legend opens from reader chrome; swatch colors match the rendered page; AA contrast for the legend labels.
  - **Done:** a legend button (shown only while `tajweedActive`) opens the `TajweedLegend` in a `Popover` (outside-click/Escape close, teleported). Swatches use the `--tajweed-*` tokens (2.7.3). e2e: legend opens and lists Ghunnah/Qalqalah, and disappears when tajweed is turned off. Final placement moves into the controls sheet in 3.10.

## 3.6 — Word-by-word translation
- [x] **3.6.1** WBW `Toggle` (+ lang en/bn): when on, render each word's translation beneath it, lazy-loading the **per-surah** `TranslationChunk` for the page's surah(s) through `DataClient.getTranslations`. Layout: stack translation under the Arabic word without breaking line justification.
  - *Verify:* toggling shows/hides translations; en↔bn swaps text; only the visible page's surah chunk(s) fetched (network assertion); Bengali renders correctly.
  - **Done:** `useReaderPages` gained a per-surah translation cache (`${lang}:${surah}`) and attaches a per-page location→gloss map to each `PageEntry` when WBW is on (guarded against language-change races). `ReadingSurface` renders each word as a centred column (Arabic + `.gloss`), and the ayah line switches to `flex-wrap: wrap`/centred so wide glosses keep each word+gloss intact. `Toggle` + EN/বাংলা `SegmentedControl` in the reader; `setWbwLang` store action. Unit test (load only when on, en↔bn swap, clear when off) + e2e (glosses appear, only window surahs fetched, en↔bn swaps, off clears).
- [x] **3.6.2** Perf: WBW must not regress page-turn budget — translations for prefetched neighbors warmed off the main thread; no CLS when toggling (reserve space or animate height under reduced-motion rules).
  - *Verify:* page turn with WBW on still ≤100ms; toggling WBW causes no layout-shift jump.
  - **Done:** glosses load **after** the surface is `ready` (non-blocking) and the window load warms neighbours' translations (e2e confirms the prefetched page's surah loads too); the `.gloss` reserves ~1 line (`min-height`) so streamed text doesn't shift layout. The ≤100ms page-turn-with-WBW timing check folds into the 3.11 perf pass.

## 3.7 — Morphology on tap
- [ ] **3.7.1** Tapping a word opens a **`Popover`** (Phase 2) with its morphology (root, lemma, POS, grammar) from the per-surah morphology chunk (3.0.2/3.0.3), **lazy code-split** so the morphology view + its data never enter the initial reader bundle. Popover anchors to the word, RTL-correct, keyboard-dismissible.
  - *Verify:* word tap → popover ≤100ms (e2e timing, warm); content matches legacy `MorphologyPopupComponent` for a sample word; morphology JS chunk absent from initial bundle (size gate); popover is focus-trapped + escape-closes.
- [ ] **3.7.2** Word "selected"/"morphology-active" states use the existing `ReadingSurface` state classes; only one active at a time; tap-again/elsewhere dismisses.
  - *Verify:* active word shows the `state-morphology`/`state-selected` style in all themes; dismiss clears it.

## 3.8 — Mistake-mark mode
- [ ] **3.8.1** Mode switch (`read` ↔ `mark-mistake`) via Phase 2 control. In mark mode, tapping a word toggles its **mistake** state (instead of opening morphology); the word gets the `state-mistake` style. Mistakes persist to IndexedDB (per word location), keyed compatibly with legacy so **migrated data shows up and new marks round-trip**.
  - *Verify:* mark a word → reload → still marked; unmark works; in read mode the same tap opens morphology (mode-gated); marks visible in all themes (AA).
- [ ] **3.8.2** Mistakes feed the memorization layer without duplicating it: the reader **reads/writes the same store** the Phase 4 weakness/hasanah logic will consume (no parallel schema). Confirm no regression against migrated legacy mistakes.
  - *Verify:* a legacy export with mistakes, imported (Phase 1 `legacyExport`), shows those mistakes on the right words; `weaknessScorer` (ported) reads them unchanged (unit test on migrated fixture).

## 3.9 — Inline tafsir
- [ ] **3.9.1** Tafsir `Toggle` (+ lang ar/en/bn): show per-verse tafsir for the current page, using `getTafsirMapping` (page→verses) + `getTafsir(lang, surah)` (per-surah, lazy). Render as a collapsible panel/section per ayah beneath the page (not inline in the justified line), so it never disturbs mushaf line layout.
  - *Verify:* toggling shows tafsir for exactly the page's verses; lang swap works incl. Arabic RTL + Bengali; only needed surah tafsir chunks fetched; page layout above is untouched.

## 3.10 — Reader chrome, quick-jump wiring & flag
- [ ] **3.10.1** Reader shell: top bar (surah/page/juz indicator + settings entry), a **controls `BottomSheet`** (layout / tajweed / wbw / tafsir / text-size / mode / legend), and the Phase 2 `BottomTabBar` wired so "Read" is this route. Replaces the placeholder `ReaderView.vue`.
  - *Verify:* all controls operate the reader store; sheet is focus-trapped + scroll-locked; safe-area insets respected (webview); works in all 3 themes + RTL.
- [ ] **3.10.2** **Wire `CommandPalette`/quick-jump to real resolution:** `parseJump` results resolve through the 3.0.1 nav indexes for the active layout → navigate to the page (name search resolves against surah names). ⌘K/Ctrl-K + a chrome affordance open it.
  - *Verify:* `2:255`, `page 50`, `juz 5`, `36`, and a surah name each jump to the correct page for both layouts; invalid input shows no bogus result; keyboard-navigable.
- [ ] **3.10.3** **Feature flag:** gate the new reader route behind a client flag (build env default + `localStorage` override) so it can be enabled for a subset of webview users without touching the live legacy deploy. Off = legacy behavior/shell; on = new reader.
  - *Verify:* flag off hides the new reader (documented default); `localStorage` override flips it; documented in the plan; no backend involved.

## 3.11 — Perf, a11y & test gate
- [ ] **3.11.1** **Perf validation** against §3 on throttled mid-Android profile: page-nav ≤100ms/no CLS, word-tap→morphology ≤100ms, no scroll/gesture long task >50ms, cold page data ≤~30KB, per-page font only (+neighbor). Add Playwright timing assertions + a Lighthouse pass on the reader route.
  - *Verify:* measured numbers recorded in the PR; budgets green; size-limit + Lighthouse CI gates pass.
- [ ] **3.11.2** **A11y:** axe clean on the reader (excluding the authentic-glyph `.surface`, per the 2.8 convention); all controls keyboard-operable + labeled; `prefers-reduced-motion` honored on page turns; focus management on popover/sheet.
  - *Verify:* axe WCAG 2 A/AA clean across light/dark/sepia; full keyboard walkthrough passes; reduced-motion path verified.
- [ ] **3.11.3** **Test suite:** unit (reader store, nav resolution, data addenda), e2e (paging, layout switch, tajweed swap, wbw, morphology, mistake-mark persistence, tafsir, deep-link/URL, flag). Keep unit-test count healthy; no flaky waits (settle before axe/screenshots, per Phase 2 lessons).
  - *Verify:* `npm run test:unit` + `npm run test:e2e` green; `npm run size` under budget; `npm run build` clean.

---

### Exit checklist (all true to close Phase 3)
- [ ] Both text surfaces (QPC uthmani + Indopak) render, page, and switch layout keeping the same ayah.
- [ ] QPC **tajweed** toggles with legend and matches legacy fidelity on sampled pages.
- [ ] WBW (en/bn), **morphology on tap** (lazy/code-split), **mistake-mark** (persisted, legacy-compatible), and **inline tafsir** (ar/en/bn) all work.
- [ ] Reader state persists + is URL-addressable; quick-jump resolves via nav indexes for both layouts.
- [ ] All §3 reader budgets met on throttled mid-Android; a11y clean; behind a client flag.
- [ ] No regression in migrated memorization data (mistakes visible; `weaknessScorer` unchanged).
- [ ] Bundle budgets green; morphology/tafsir/WBW load lazily, absent from the initial reader chunk.

### What later phases consume from here
Phase 3b (mushaf image view) reuses the reader chrome, quick-jump nav indexes (3.0.1), and the pager/prefetch pattern. Phase 4 (memorization) builds on the shared mistakes store (3.8) and `weaknessScorer` wiring. Phase 8 (PWA) precaches this reader shell + runtime-caches its page data/fonts/morphology/tafsir chunks.

### Open decisions to confirm before/at start
- **WBW placement** under justified lines vs. an alternate inline-gloss layout (affects 3.6.1) — pick during 3.6.
- **Tafsir source coverage** for ar/en/bn parity with legacy (does every verse have all three?) — verify in 3.0/3.9; degrade gracefully where a language is missing.
- **Flag granularity** (whole reader vs. per-feature) — default whole-reader in 3.10.3 unless we want finer rollout.
