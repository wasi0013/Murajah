# Phase 3b — Mushaf Image View (granular tasks)

**Parent:** [redesign-2026.md](./redesign-2026.md) §5 (Phase 3b) · **Prereqs:** Phase 1 (asset pipeline, AssetCache, worker) + Phase 3 (reader chrome, nav indexes, quick-jump) complete. **Goal:** keep the standalone **"real Quran" scan** reading experience — the third reading surface — and fix it for phones, while **preserving the 2-page side-by-side spread on desktop** (valued by computer users). Fed by optimized single-page WebP from the Phase 1 image pipeline.

> This is **reading-only** (no word taps / tajweed / WBW — those are the text surfaces). A separate route + view, code-split so it never enters the reader bundle.

**Definition of done:** on a phone, a page is legible without pinch-zoom; on desktop, two adjacent pages render as a spread (RTL: lower page on the right); per-page image transfer is a fraction of the old ~2.4MB PNG (~120–180KB WebP); images load lazily with neighbour prefetch and are cached; the view + its assets are absent from the initial reader bundle; page/juz/surah quick-jump is shared with the text reader; §3-style budgets hold and a11y is clean.

> Local-first constraint stands: images are static assets served from Cloudflare Pages, cached client-side; **excluded from the default offline pack** (opt-in, size-shown — the manager UI is Phase 8). No backend.

---

## 3b.0 — Image assets: generate, verify, manifest
> The `data-pipeline/src/transcode-images.mjs` exists (splits `page-{a}-{b}.png` spreads → single-page WebP q80, RTL crop: page `a` right half, `b` left half) but has only been smoke-run. This task produces the real set and the manifest the app needs.

- [x] **3b.0.1** **Verify the RTL crop + page pairing** (flagged in `transcode-images.mjs`): transcode a handful of spreads and confirm visually that page `a` is the **right** half and `b` the **left**, and that the page numbers match the reader's page scheme (Madani 604). Fix the crop/orientation if wrong before the full run.
  - *Verify:* 3–4 sampled pages render the correct content right-side/left-side; page N's image = the same ayahs as QPC text page N.
- [x] **3b.0.2** **Full transcode**: run the pipeline over all spreads → `app/public/img/mushaf/{page}.webp`. Confirm the count (≈604 pages) and measure total + per-page sizes. Consider one smaller responsive width only if the native (~1100w) is heavier than needed on phones.
  - *Verify:* all pages present (no gaps); per-page ≤ ~180KB; total in the projected ~70–110MB range; a missing/blank page fails loudly.
- [x] **3b.0.3** **Image manifest**: emit `img/mushaf/manifest.json` (page count, path template `img/mushaf/{page}.webp`, intrinsic width/height for aspect-ratio boxing to avoid CLS). Register in the build (`assets.mjs`), like the font manifest.
  - *Verify:* manifest lists 604 pages with dimensions; app can resolve a page → URL + aspect ratio purely from it.
- [x] **3b.0.4** **Asset hosting decision** (source PNGs are 611MB, WebP output ~100MB): decide how the WebP set is produced for deploy and whether it's committed. Options: commit the optimized WebP to `app/public` (Pages serves it); or generate in CI (needs `cwebp` + source PNGs via Git LFS / untracked `assets-src/`). Record the choice; keep raw PNGs out of the deployed app (Phase 9 finalizes their removal from git).
  - *Verify:* a clean deploy serves `img/mushaf/{page}.webp`; the reader/text deploy is unaffected; decision documented in [audit-assets-data.md](./audit-assets-data.md) §4.

## 3b.1 — Image data access (worker + cache)
- [x] **3b.1.1** `MushafClient` (or extend `DataClient`): load the image manifest once; expose `pageCount`, `imageUrl(page)`, `dimensions(page)`. Images are large binaries — fetch as **Blob** (not JSON) through the worker/asset layer; cache in IndexedDB (`AssetCache`, byte-capped LRU, version-purged) so revisits/offline are instant.
  - *Verify:* unit tests (mock transport) for URL/dimension resolution; an e2e confirms a revisited page loads from cache (no second network fetch).
- [x] **3b.1.2** Neighbour **prefetch**: warming ±1 page (±2 in desktop spread mode) off the main thread, clamped to range. Reuse the reader's prefetch pattern.
  - *Verify:* opening page N warms N±1 (network assertion); prefetch never fetches out-of-range or the whole set.

## 3b.2 — Mushaf view + route (single page)
- [ ] **3b.2.1** `features/mushaf/MushafView.vue` at a **dedicated route** `/mushaf/:page` (lazy/code-split — must **not** enter the reader bundle). Renders the current page image centred, boxed to its intrinsic aspect ratio (from the manifest) so there's **no layout shift** while it loads; `Skeleton`/blur-up placeholder until the Blob resolves.
  - *Verify:* route is a separate chunk (size gate); page image renders sharp and centred; aspect-ratio box reserves space (CLS≈0); cold load shows placeholder then image.
- [ ] **3b.2.2** A small `useMushafPage` store/composable for `page` + persistence (last mushaf page) + URL sync (`/mushaf/:page`), mirroring the reader store's slice (reuse the persistence/URL patterns, not the whole reader store).
  - *Verify:* deep-link `/mushaf/50` opens page 50; reload restores the last page; back/forward pages.

## 3b.3 — Responsive spread (single on mobile, 2-up on desktop)
- [ ] **3b.3.1** **Width-driven layout**: below a breakpoint show **one page**; at/above it show a **2-up spread** composed from two adjacent single-page images — **RTL: lower page on the right, next page on the left** (per the source pairing). No separate spread assets; the desktop spread is two `<img>` side by side.
  - *Verify:* at ≤~ the breakpoint one page shows; above it the correct pair shows with the right page = lower number; resizing across the breakpoint reflows without a broken pair.
- [ ] **3b.3.2** **Spread paging semantics**: in 2-up mode, "next" advances by **two** pages (to the next spread), not one; the current-page indicator reflects the visible pair (e.g. "Pages 2–3"). Single mode advances by one.
  - *Verify:* desktop next/prev moves whole spreads and never splits a pair mid-way; the indicator matches the visible pages.

## 3b.4 — Navigation (gestures, keyboard, quick-jump)
- [ ] **3b.4.1** Page turns: **RTL-aware swipe** (reuse `core/reader/swipe`) + keyboard (`core/reader/keyboard`), honouring `prefers-reduced-motion`; on-screen prev/next; page indicator (page/pages · juz · surah, from the shared nav index).
  - *Verify:* swipe/keyboard page in the correct RTL direction; reduced-motion has no transform animation; indicator updates (single + spread).
- [ ] **3b.4.2** **Shared quick-jump**: reuse `CommandPalette` + `useQuickJump`/`resolveJump` so `2:255`, `page 50`, `juz 5`, and surah names jump to the right **mushaf page** (image page scheme = the QPC nav index). ⌘K + a chrome affordance.
  - *Verify:* each jump lands on the correct mushaf page (single + spread); invalid input no-ops.

## 3b.5 — Zoom (retained, optional)
- [ ] **3b.5.1** Pinch-zoom + double-tap-to-zoom on a page image (pan while zoomed), so it's *available* but no longer *required* to read (the point of the phone fix). Reset on page change.
  - *Verify:* pinch/double-tap zooms and pans; a normal read needs no zoom (page legible at fit-width); zoom resets when paging.

## 3b.6 — Entry point & chrome
- [ ] **3b.6.1** A way in/out: open the mushaf view from the reader (e.g. the "More" tab / a menu entry — "dedicated menu, as today") and return to the text reader. Consistent top-bar chrome (indicator + quick-jump + back).
  - *Verify:* user can switch text reader ↔ mushaf image view and back; deep-links to each work; safe-area insets + all 3 themes correct.

## 3b.7 — Caching & offline posture
- [ ] **3b.7.1** Confirm images cache in IndexedDB (3b.1.1) with a sensible byte cap; they are **not** part of the default precache/offline pack — opt-in only (the download-manager UI lands in Phase 8; here just ensure the SW/cache config doesn't bulk-precache the 100MB set).
  - *Verify:* first visit fetches, revisit serves from cache; a fresh install does **not** eagerly download all pages.

## 3b.8 — Perf, a11y & test gate
- [ ] **3b.8.1** **Perf**: per-page image transfer ≤ ~180KB; no CLS (aspect-ratio box); spread mode loads two images bounded; the view + its JS are absent from the initial reader bundle (size gate). Lighthouse pass on the mushaf route.
  - *Verify:* measured per-page transfer recorded; CLS≈0; size gate green; mushaf chunk separate.
- [ ] **3b.8.2** **A11y**: each page `<img>` has a meaningful `alt` (e.g. "Mushaf page 50"); prev/next/zoom controls keyboard-operable + labelled; `prefers-reduced-motion` honoured; axe clean across light/dark/sepia.
  - *Verify:* axe WCAG 2 A/AA clean; full keyboard walkthrough; reduced-motion verified.
- [ ] **3b.8.3** **Tests**: unit (manifest/URL resolution, spread-pairing math, spread paging), e2e (single vs spread by width, paging, quick-jump, cache-on-revisit, deep-link). No flaky waits.
  - *Verify:* `test:unit` + `test:e2e` green; `size` under budget; `build` clean.

---

### Exit checklist (all true to close Phase 3b)
- [ ] Optimized single-page WebP set generated + manifested; per-page ≤ ~180KB; raw PNGs kept out of the deployed app.
- [ ] Phone: one page, legible without pinch-zoom. Desktop: correct RTL 2-up spread from adjacent singles.
- [ ] Lazy image load + neighbour prefetch + IndexedDB cache; not bulk-precached.
- [ ] Swipe/keyboard paging (RTL, reduced-motion) + shared quick-jump land on the right page(s).
- [ ] Dedicated code-split route/menu; switch to/from the text reader works; deep-links + persistence.
- [ ] Budgets green (view absent from reader bundle; per-page transfer bounded; CLS≈0); a11y clean.

### What later phases consume from here
Phase 8 (PWA/offline) adds the opt-in "download all pages" manager over this cache; Phase 9 removes the raw PNGs from git and finalizes the optimized set on the deploy.

### Open decisions to confirm before/at start
- **Asset hosting** (3b.0.4): commit the ~100MB WebP set vs. generate in CI (LFS/untracked source) vs. separate assets host — affects repo size + deploy.
- **Breakpoint** for single↔2-up (and whether tablets get 2-up) — pick during 3b.3.
- **Responsive widths**: is the native ~1100w single sufficient for both phone and desktop-half, or is a second smaller width worth it (3b.0.2)?
- **Image page scheme**: confirm the scan page numbers align 1:1 with the QPC 604 nav index so quick-jump/indicator are correct (3b.0.1).
