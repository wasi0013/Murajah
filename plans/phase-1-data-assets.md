# Phase 1 — Data & Asset Pipeline (granular tasks)

**Parent:** [redesign-2026.md](./redesign-2026.md) · **Prereq:** Phase 0 exit checklist complete (esp. `audit-assets-data.md`). **Goal:** data + fonts + images stop being the bottleneck, and existing users' local data migrates safely. This is the perf foundation every later phase stands on.

**Definition of done:** one reader page's data transfer ≤ ~30KB and one page's font is loaded alone (+neighbor prefetch); all heavy parsing runs off the main thread; a legacy IndexedDB database migrates into the new schema with a passing round-trip test.

> Sequence matters: build the pipeline (1.1–1.4) before the runtime loaders (1.5–1.7), before storage/migration (1.8–1.9).

---

## 1.1 — `data-pipeline/` scaffold
- [ ] **1.1.1** Create `data-pipeline/` (Node scripts, TS) with an `input/` (reads `source/resources/data`) and `output/` (writes `app/public/data`) convention; add an `npm run data:build` script.
  - *Verify:* running it copies one file end-to-end; output path deterministic + hashable.
- [ ] **1.1.2** Add a manifest generator: after processing, emit `manifest.json` mapping page/surah/juz → chunk file names + sizes + content hash.
  - *Verify:* manifest lists chunks with stable hashes; re-running with no input change is a no-op.

## 1.2 — Chunk the Quran text/layout + word-by-word data (per page)
- [ ] **1.2.1** Split `qpc-v2-15-lines.json` + `qpc-v2-word-by-word.json` (7.5MB) into **per-page** chunks keyed by page number (604), containing only that page's lines/words.
  - *Verify:* a single page chunk is small (target ≤ ~15–25KB); concatenating all chunks reproduces the source (round-trip test).
- [ ] **1.2.2** Do the same for the Indopak layout + words (`indopak-15-lines.json`, indopak words) → per-page chunks (610 pages).
  - *Verify:* round-trip equality; per-page size within budget.
- [ ] **1.2.3** Compact the on-wire format (short keys / arrays instead of verbose objects) and gzip/brotli at build; keep a documented schema.
  - *Verify:* transferred (compressed) per-page size recorded; schema doc matches output.

## 1.3 — Chunk translations & tafsir (per page / per surah)
- [ ] **1.3.1** Split word-by-word translations (English 1.8MB, Bengali 3.3MB) per page; lazy per active reading language.
  - *Verify:* switching language loads only that language's chunk for the current page.
- [ ] **1.3.2** Split tafsir (en/bn, 11MB) by its natural unit (page mapping already exists: `qpc-page-tafsir-mapping.json`) so only the visible page's tafsir loads.
  - *Verify:* opening tafsir on a page fetches one chunk, not the whole corpus.

## 1.4 — Font pipeline (priority-1: uthmani + tajweed, indopak)
- [ ] **1.4.1** Apply the Phase 0 font-source recommendation. Normalize QPC-uthmani + tajweed + Indopak into per-page (or subset) woff2 with a font manifest (page → font file).
  - *Verify:* rendering a sample page with the pipeline output is pixel-faithful to legacy (screenshot diff) incl. **tajweed colors**.
- [ ] **1.4.2** Confirm tajweed coloring mechanism end-to-end (COLR/CPAL color font **or** segment-based CSS coloring) and lock it.
  - *Verify:* tajweed legend colors match legacy on 5 sampled pages.
- [ ] **1.4.3** Image pipeline: transcode the 611MB PNG spreads → AVIF (WebP fallback), **split into single pages**, generate 1–2 responsive widths.
  - *Verify:* per-page image ≤ ~200–400KB, legible on a phone at 1x; count = 604 single pages; total output size recorded (target <100MB).

## 1.5 — Data-access layer + Web Worker
- [ ] **1.5.1** Build `core/data/` API: `getPage(pageNo, {layout, lang})`, `getTafsir(pageNo)`, etc., reading the manifest + chunks. Framework-agnostic, typed.
  - *Verify:* unit tests fetch a page's data via mocked fetch; types compile.
- [ ] **1.5.2** Move JSON fetch + parse into a **Web Worker**; main thread only receives structured results.
  - *Verify:* during a page load, no main-thread long task > 50ms (measured in DevTools/Playwright trace).
- [ ] **1.5.3** Add neighbor **prefetch** (±1 page data + font) triggered after the current page settles (idle).
  - *Verify:* navigating next page uses cache (no network), ≤ 100ms swap.

## 1.6 — Font loading strategy at runtime
- [ ] **1.6.1** Load only the current page's woff2 via the font manifest; `font-display` tuned to avoid FOIT on the Arabic text.
  - *Verify:* network shows one page font on load, not 604; no invisible-text flash.
- [ ] **1.6.2** Lazy-init Indopak family only when the Asian layout is selected.
  - *Verify:* Indopak fonts absent from network until layout switched.

## 1.7 — IndexedDB cache v2 (asset/data cache)
- [ ] **1.7.1** Implement a versioned IndexedDB store for fetched chunks/fonts/images with LRU-ish eviction and a size cap.
  - *Verify:* second visit to a page serves from IDB (offline test passes); cache respects cap.
- [ ] **1.7.2** Wire the service-worker/runtime cache boundaries so SW (Phase 8) and this layer don't double-cache.
  - *Verify:* documented ownership; no duplicate storage of the same asset.

## 1.8 — Port domain logic into `app/src/core/`
- [ ] **1.8.1** Port the "port-as-is" modules from the Phase 0 map (calculations, pageHasanah, weaknessScorer, scoreFormatter, planScheduler, planManager, dailyGoalsManager) into `core/` as typed modules.
  - *Verify:* their existing unit tests (moved over) pass unchanged in `app/`.
- [ ] **1.8.2** Port the storage-facing stores (notes, morphology, i18n) behind the new storage layer, decoupled from Vue where they were coupled.
  - *Verify:* unit tests green; no Vue import in `core/`.

## 1.9 — Legacy data migration (safety-critical)
- [ ] **1.9.1** Document the legacy IndexedDB schema (object stores + shapes) used by the current app for memorization, mistakes, notes, plans, goals, recordings.
  - *Verify:* schema doc matches a real exported/inspected legacy DB.
- [ ] **1.9.2** Write a migration that reads the legacy DB (or a legacy export JSON) and populates the new schema; idempotent + versioned.
  - *Verify:* round-trip test — import a real legacy export → new DB → export → **deep-equal** to original (no data loss).
- [ ] **1.9.3** Preserve legacy **export/import JSON** compatibility both directions during the transition.
  - *Verify:* a file exported by legacy imports into new app and vice-versa; covered by an E2E test.

---

### Exit checklist (all must be true to start Phase 3)
- [ ] One reader page = one small data chunk (≤ ~30KB transferred) + one page font, parsed off-main-thread.
- [ ] Next/prev page swap ≤ 100ms from prefetch cache; no long tasks during scroll.
- [ ] QPC-uthmani + tajweed + Indopak render pixel-faithful to legacy (screenshot diffs).
- [ ] Mushaf images optimized + single-page, per-page ≤ ~400KB.
- [ ] Ported domain modules pass their unit tests in `app/`.
- [ ] Legacy → new data migration passes a lossless round-trip test.
