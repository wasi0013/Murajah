# Asset & Data Audit (Phase 0 deliverable)

**Parent:** [redesign-2026.md](./redesign-2026.md) · [phase-0-foundations.md](./phase-0-foundations.md) task 0.6.
Purpose: exact inventory + a concrete reduction plan that Phase 1 executes. All sizes measured from `source/resources` on the `redesign` branch.

## TL;DR
- Today the app ships/caches **~800MB** of assets to be "offline-capable": 62MB JSON + 144MB fonts + 611MB PNG.
- Almost none of it needs to load to read one page. The plan: **per-page chunking**, **lazy per-page fonts**, and **re-encoded/split images** cut the *per-page* cost to tens of KB and make the offline "download all" an optimized, opt-in pack.

---

## 1. Inventory

### 1.1 Quran text / word-by-word / translations (`data/quran`, `data/indopak`)
| File | Size | Access pattern | Chunking strategy |
|---|---|---|---|
| `qpc-v2-word-by-word.json` | 7.5M | per **page** (words on the visible page) | split → 604 per-page chunks |
| `quran.json` | 2.1M | per page/surah | per-page chunk (or fold into page chunk) |
| `qpc-v2-15-lines.json` | 1.7M | per page (line layout) | 604 per-page chunks |
| `quran-witout-page-numbers.json` | 1.7M | ? likely redundant | **audit for removal** (overlaps others) |
| `indopak-15-lines.json` | 1.5M | per page | 610 per-page chunks |
| `data/indopak/indopak-nastaleeq.json` | 8.5M | per page (Indopak words) | 610 per-page chunks, lazy (only Asian layout) |
| `english-wbw-translation.json` | 1.8M | per page, per lang | per-page, lazy by active lang |
| `bangali-word-by-word-translation.json` | 3.3M | per page, per lang | per-page, lazy by active lang |
| `en.json` | 1.2M | ? verse translation | per-surah chunk |
| `surah-names.json` | 2.6K | whole (index) | keep whole (tiny) |

### 1.2 Tafsir (`data/tafsir`)
| File | Size | Access | Strategy |
|---|---|---|---|
| `ar-tafsir.json` | 7.3M | per page | per-page chunk, lazy on tafsir-open |
| `bn-tafsir.json` | 2.3M | per page | per-page chunk, lazy by lang |
| `en-tafsir.json` | 952K | per page | per-page chunk, lazy by lang |
| `qpc-page-tafsir-mapping.json` | 88K | index | keep whole |
| `indopak-page-tafsir-mapping.json` | 88K | index | keep whole |

### 1.3 Morphology (`data/morphology`)
- 114 files, **22M**, already split **per surah**. Good pattern — keep per-surah, load lazily on first word-tap in a surah. Only re-encode/compact keys.

### 1.4 i18n (`data/i18n`) — 176K. Small; load active locale only.

### 1.5 Fonts (`styles/fonts`)
| Family | Size | Files | Notes |
|---|---|---|---|
| QPC v2 (uthmani) | 94M | 604 | **priority-1.** Per-page glyph fonts. Lazy-load current page only. |
| Tajweed (color) | 50M | ~604 | **priority-1.** Color-coded. Confirm COLR/CPAL vs. segment coloring in Phase 1. |
| Indopak Nastaleeq | 88K | few | Small; lazy-init only for Asian layout. |
| `surah_names.woff2` | 86K | 1 | UI chrome; preload. |

### 1.6 Images (`assets/images/quran_pages`)
- **611M**, 305 PNG files, 2-page spreads (`page-N-N+1.png`), ~2.4M each.
- **Measured:** a sample spread is **1356×966** but weighs **2.4M** — grossly unoptimized PNG.

### 1.7 Legacy runtime vendor libs (for reference — being replaced by the build)
- `tailwind.3.4.7.js` 260K (runtime JIT — **eliminated**, now compiled), `vue.global.js` 160K, `hls.min.js` 542K, `marked.min.js` 40K, Font Awesome CSS 100K.

---

## 2. Image transcode spike (measured, task 0.6.4)
Tools: `cwebp`, `avifenc` (installed). Sample: `page-1-2.png` (2.4M, 1356×966).

| Output | Size | Reduction |
|---|---|---|
| Original PNG (spread) | 2.4M | — |
| WebP q78 (spread, native res) | **364K** | 6.6× |
| AVIF (spread) | 448K | 5.4× (webp wins at this res) |
| WebP q78, **single page** ~1100w | **180K** | 13× |

**Findings:** the source resolution is modest (≈678px/page), so the dominant win is simply **re-encoding PNG→WebP** plus **splitting spreads into single pages**. Recommendation: **WebP** (better than AVIF at this resolution), single-page assets (604), 1–2 responsive widths. Projected total: **611M → ~70–110M**, and *per-page transfer ~120–180K* (lazy, never bulk by default). Re-evaluate AVIF only if higher-res source scans are sourced later.

**Layout requirement:** desktop/computer users value the **2-page side-by-side spread** — keep it. Compose the desktop spread from **two adjacent single-page images**, so one single-page asset set serves both mobile (one page) and desktop (two pages side by side). No separate spread assets needed.

---

## 3. Font source research (task 0.6.3)
**Constraint:** uthmani script + tajweed color output must remain identical. Only *how/when* fonts load may change.

Candidates:
1. **Keep current QPC v2 per-page woff2 (recommended baseline).** Already present, proven fidelity. Change is purely runtime: lazy-load current page + prefetch ±1, `font-display: block` on the Arabic to avoid glyph-substitution flashes. Zero fidelity risk.
2. **quran.com / Quranic Universal Library (QUL)** — same lineage as our current data source (README credits TarteelAI/QUL). Worth checking for newer/smaller per-page woff2 or a v4 layout, but only adopt if pixel-identical.
3. **Tajweed coloring mechanism** — determine whether the 50M tajweed set is COLR/CPAL color fonts or paired with segment data. If segment-based CSS coloring is viable, it could drop the 50M font set entirely and color via spans. **Phase 1 spike with screenshot diffs required before deciding.**

**Recommendation:** ship Phase 1 on candidate (1) (lowest risk), run the tajweed-mechanism spike (3) in parallel; adopt (2)/(3) only on a proven pixel-diff match.

---

## 4. Repo-size decision (task 0.6.5)
- The 611M PNGs are committed to git (source total 824M). This bloats clones.
- **Decision:** the raw PNGs become **inputs to the `data-pipeline`**, not shipped assets. Optimized WebP output goes to `app/public` (or a separate assets host). Move the raw PNGs to **Git LFS** or an untracked `assets-src/` referenced by the pipeline. Executed in Phase 1 (produce optimized set) and finalized in Phase 9 (drop raw PNGs from the deployed app). No history rewrite in Phase 0.

---

## 5. Per-page budget projection (the point of all this)
| Surface | Today (to first read) | After Phase 1 (per page) |
|---|---|---|
| QPC text page | parse 7.5M WBW + 1.7M layout + 94M fonts available | ~15–25K data + 1 page woff2 |
| Tafsir open | up to 7.3M ar-tafsir | 1 page chunk |
| Mushaf image page | 2.4M PNG (spread) | ~120–180K WebP (single page) |

This is the foundation Phase 3 (reader) depends on; see [phase-1-data-assets.md](./phase-1-data-assets.md).
