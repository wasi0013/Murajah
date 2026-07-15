# Murajah 2026 Redesign — Master Plan

**Decision baseline (agreed):** Greenfield rewrite · Vue 3 + Vite SFCs · Local-first (IndexedDB, static hosting, no backend) · Fresh 2026 visual language.

**Prime directive:** A blazing-fast, modern Quran reading + memorization app that keeps every current feature, targeted first at webview (Android Play Store) users.

---

## 1. Why we're doing this — current-state diagnosis

Measured facts about today's app (not assumptions):

| Problem | Evidence | Impact |
|---|---|---|
| Runtime CSS compiler | `tailwind.3.4.7.js` = 260KB **browser JIT**, generates all CSS on every load | Huge main-thread cost; Tailwind says never ship this |
| Monolithic app | `index.html` = **11,512 lines / 510KB**, entire app inlined (`createApp` spans lines 3368→11289), incl. 325 junk `}` lines + broken CSS | Parsed/evaluated every load; unmaintainable |
| No build step | Vue global CDN (unminified), FA full CSS (100KB), no bundling/tree-shaking/code-split/lazy-load | Everything ships upfront |
| Unbounded rendering | Quran/surah view is plain `v-for` over every line + word, **no virtualization** | Jank on long surahs |
| Oversized assets | 62MB JSON (word-by-word alone 7.5MB) · 94MB QPC per-page fonts (604 files) · 50MB tajweed fonts · **611MB PNG mushaf spreads** (~2MB each) | ~800MB "offline" ambition; slow first load |
| Main-thread data parsing | JSON loaded + parsed on main thread, then cached to IndexedDB | Blocks interaction on cold load |

**What's already good and reusable:** Domain logic is modularized under `source/resources/js/` — `planManager`, `planScheduler`, `weaknessScorer`, `dailyGoalsManager`, `pageHasanah`, `calculations`, and the `stores/` (notes, i18n, morphology). These are largely framework-agnostic and will be ported, not rewritten.

---

## 2. Target architecture

```
murajah/
├── app/                      # NEW Vite + Vue 3 + TS project (the product)
│   ├── src/
│   │   ├── core/             # framework-agnostic domain logic (ported from resources/js)
│   │   │   ├── memorization/ planManager, scheduler, weaknessScorer, hasanah…
│   │   │   ├── data/         # data-access layer (page/juz loaders, worker client)
│   │   │   └── storage/      # IndexedDB wrapper, migrations, export/import
│   │   ├── stores/           # Pinia stores (settings, reader, progress, goals, notes, i18n)
│   │   ├── design/           # design tokens, theme, primitives
│   │   ├── components/       # reusable UI (Sheet, Modal, Tabs, Icon, …)
│   │   ├── features/         # reader, memorization, plans, quiz, audio, notes, settings
│   │   ├── router/           # lazy, code-split routes
│   │   ├── workers/          # data + parsing web workers
│   │   └── main.ts
│   ├── public/               # static, versioned assets referenced at runtime
│   ├── vite.config.ts
│   └── index.html            # tiny shell only
├── data-pipeline/            # NEW build-time scripts: chunk/compress data + assets
├── source/                   # LEGACY app — stays live until per-screen cutover completes
└── plans/redesign-2026.md
```

**Stack:** Vue 3 (`<script setup>` + TS) · Vite · Pinia · Vue Router (lazy routes) · Tailwind **compiled by Vite** (`@tailwindcss/vite`, zero runtime) · SVG icon set (Lucide/Phosphor, tree-shaken — replaces 100KB Font Awesome) · Vitest + Playwright · vite-plugin-pwa (Workbox) for the service worker.

**Non-negotiables baked into the architecture:**
- Local-first: IndexedDB is the source of truth; export/import preserved; **no network dependency for core reading.**
- Data & fonts are **per-page lazy-loaded**, never bulk-loaded on entry.
- All heavy parsing runs in a **Web Worker**.
- Every route is **code-split**; audio/quiz/morphology libs load on demand.

---

## 3. Performance budgets (the definition of "blazing fast")

These are CI-gated (Lighthouse CI + bundle-size check). A phase is not "done" if it regresses these.

| Metric | Target |
|---|---|
| Initial JS (reader route, gzipped) | ≤ 120KB |
| First Contentful Paint (mid Android, throttled) | ≤ 1.2s |
| Largest Contentful Paint | ≤ 2.0s |
| Time to Interactive | ≤ 2.5s |
| Page-to-page navigation (already-loaded) | ≤ 100ms, no layout shift |
| Word tap → morphology popup | ≤ 100ms |
| Reader main-thread long tasks during scroll | none > 50ms |
| Cold data for one page (JSON transferred) | ≤ ~30KB (vs 7.5MB monolith) |
| Per-page font transferred | 1 page's woff2 only (+ neighbor prefetch) |

---

## 4. 2026 visual language (direction, detailed in Phase 2)

- **Reading-first, calm UI.** The mushaf is the hero; chrome recedes. Content-driven color, generous whitespace, restrained motion.
- **Design tokens** for color, type scale, spacing, radius, elevation, motion — light/dark/sepia (reading-comfortable) themes, full RTL support.
- **Typography:** dial in QPC/Indopak Arabic rendering (line-height, letter-spacing, size steps) + a modern UI font pairing that respects Arabic + Latin + Bengali.
- **Navigation:** refined bottom tab bar (mobile/webview-first) + command palette / quick-jump (surah:ayah, page, juz). Gesture-driven page turns with a real page-turn feel.
- **Micro-interactions:** instant tap feedback, skeletonless perceived-instant page loads (prefetch neighbors), haptics via webview bridge where available.

### 4.1 Reading surfaces & fonts — **priority-1, non-negotiable**

There are **three** reading surfaces, all of which we keep and improve:

| Surface | Font / source | Notes |
|---|---|---|
| **Madani (QPC) — text** | QPC v2 per-page glyph fonts, **uthmani** | **Tajweed (color-coded) is required** and cannot be compromised. Primary reading surface; sharp at any zoom, tiny payload. |
| **Asian (Indopak) — text** | Indopak Nastaleeq | Large Bangladesh / subcontinent user base — first-class, not secondary. |
| **Mushaf (image) — scans** | 611MB PNG page spreads | Standalone "real Quran" reading feel for memorization. **Kept.** |

Hard rules:
- **Uthmani script + color-coded tajweed (QPC) and Indopak are priority-1.** We may swap to a *better-compiling/rendering source* for these fonts, but the script (uthmani) and tajweed coloring must remain identical in output. Candidate sources to evaluate in Phase 1: quran.com / Quranic Universal Library (QUL) fonts, COLR/CPAL color-tajweed fonts vs. segment-based tajweed coloring.
- **Mushaf image view — responsive, both layouts matter:** the **2-page side-by-side spread is important to desktop/computer users** and must be preserved on wide screens. The fix is *only* for phones, where the spread becomes tiny and forces pinch-zoom: **collapse to single-page mode on narrow screens** (one page at a time). So: single page on mobile, 2-up spread on desktop (width-driven), pinch-zoom retained as an option in both.

---

## 5. Phased roadmap

Greenfield, but **de-risked**: the new app is built alongside `source/` on the `redesign` branch (legacy stays live from `master`, no time pressure), so we can optionally flag the reader to real users early. Quality-first: each phase is broken into granular, individually-verifiable tasks and gated by its acceptance criteria before the next begins. Near-term phases get their own detailed task file; later phases are detailed as we reach them to avoid stale speculation.

**Granular task files:**
- [phase-0-foundations.md](./phase-0-foundations.md) — scaffold, CI, perf gates, deploy, audit
- [phase-1-data-assets.md](./phase-1-data-assets.md) — chunking, fonts, images, workers, migration
- _(later phases granularized when reached)_

### Phase 0 — Foundations & audit
**Goal:** New app boots, CI/deploy/test harness in place, decisions locked.
- Scaffold `app/` (Vite + Vue 3 + TS + Pinia + Router + Tailwind-via-Vite).
- Port test tooling (Vitest, Playwright) to run against the new build.
- CI: build → deploy preview (Cloudflare Pages) → Lighthouse CI budget gate + bundle-size gate (fails PRs that break §3).
- **Asset & data audit** (deliverable doc): exact inventory + reduction plan for the 611MB PNGs, 144MB fonts, 62MB JSON. Decide mushaf-image view's future (keep as optional, but WebP/AVIF + strict lazy-load).
- Skeleton design-token file + empty theme.
**Acceptance:** `app/` deploys a hello-world reader shell to a preview URL under budget; CI gates active.

### Phase 1 — Data & asset pipeline (the real perf foundation)
**Goal:** Data and fonts stop being the bottleneck. This unlocks every later phase.
- `data-pipeline/` scripts: **chunk** word-by-word / layout / tafsir / translation JSON **per page** (and per juz where it fits access patterns) into small files; strip redundancy; ship compact/compressed formats.
- **Font strategy (priority-1 fonts):** load only the current page's QPC-uthmani + tajweed woff2, prefetch ±1 page; subset where feasible; lazy-init Indopak family. **Research spike:** evaluate a better-compiling/rendering source (quran.com/QUL fonts, COLR/CPAL color-tajweed vs. segment-based coloring) — but uthmani script + tajweed color output must remain identical. Font model change is only ever *how/when* they load, never the script or coloring.
- **Image strategy (mushaf scans, kept feature):** transcode 611MB PNG → AVIF/WebP (~5–10× smaller), responsive sizes, and **split 2-page spreads into single pages** so mobile can show one page at a time. Strictly lazy + on-demand; excluded from the default offline pack (opt-in, size shown).
- **Web Worker** data client + IndexedDB cache v2 (versioned, with migration from legacy DB so existing users keep progress).
- Progressive/resumable **offline download manager** core (UI comes in Phase 8).
- Port domain logic into `app/src/core/` with unit tests.
**Acceptance:** One reader page's data + font transfer ≤ budget; parsing off main thread; existing-user IndexedDB data migrates cleanly.

### Phase 2 — Design system
**Goal:** A real 2026 design language, componentized.
- Finalize tokens (color/type/space/radius/elevation/motion), light/dark/sepia, RTL.
- Primitive components: Button, Sheet/BottomSheet, Modal, Tabs, Toggle, Slider, Icon (SVG), Toast, Skeleton, Segmented control.
- Reading surface visual spec (typography sizing, tajweed color legend, word states).
**Acceptance:** Storybook-style demo route renders all primitives in all themes/RTL; tokens drive everything.

### Phase 3 — Reading experience (FLAGSHIP — ship to users behind a flag)
**Goal:** The screen users complain about, rebuilt and fast.
- Virtualized page renderer for the two **text** surfaces — **Madani/QPC (uthmani)** and **Asian/Indopak** — with layout switch; instant page switch; swipe/gesture nav; text-size control.
- **Color-coded tajweed** on the QPC surface (priority-1) with toggle + legend.
- Word-by-word translation; **morphology on tap** (lazy-loaded per surah, code-split); **mistake-mark mode** with the mode switch.
- Inline tafsir (Arabic/English/Bengali) toggle per page.
- URL/state preservation (page, tafsir, wbw settings) via router.
**Acceptance:** Meets all §3 reader budgets on a throttled mid Android; parity with legacy text reader incl. tajweed fidelity; can be enabled for a % of webview users via flag; no regression in memorization data.

### Phase 3b — Mushaf image view (standalone)
**Goal:** Keep the "real Quran" scan experience, fixed for phones.
- Dedicated menu/route (as today), fed by the optimized AVIF/WebP single-page assets from Phase 1.
- **Responsive layout:** single-page on narrow/mobile screens; **2-up side-by-side spread on desktop** (valued by computer users — keep it). Compose the desktop spread from two adjacent single-page images so one asset set serves both; smooth pinch-zoom retained as an option (no longer mandatory to read).
- Lazy per-page image load with neighbor prefetch; page/juz/surah quick-jump shared with the text reader.
**Acceptance:** On a phone, a page is legible without pinch-zoom; image transfer per page is a fraction of the old ~2MB PNG; view is not in the initial bundle.

### Phase 4 — Memorization & tracking
- Memorized page grid (color-coded status), juz progress overview, per-page perfect-revision counter, bulk-mark.
- `weaknessScorer` / `pageHasanah` wired into the new stores.
**Acceptance:** Marking + stats match legacy exactly on migrated data; grid renders 604 pages without jank (virtualized/canvas as needed).

### Phase 5 — Plans, daily goals & streaks
- Plan setup wizard, Today card, plan calendar, progress view, settings modal.
- Daily goals (recite/record/review/memorize), streaks with midnight reset, historical timeline.
- Port `planManager` + `planScheduler` + `dailyGoalsManager` with their existing tests.
**Acceptance:** A plan created in legacy loads/advances identically in the new app; streak reset logic covered by tests.

### Phase 6 — Quiz mode
- Fold the separate `quiz.html` into the SPA as a lazy, code-split route.
- Question types (word completion, verse continuation, translation), lightning round, real-time scoring.
**Acceptance:** Quiz route adds 0KB to reader bundle (code-split); parity with legacy quiz; iOS navigation issues from legacy do not recur (regression tests).

### Phase 7 — Audio
- Own-recitation record + playback; floating verse-by-verse Qari player (Shuraim, Luhaidan); live stream embed.
- Heavy audio deps (HLS etc.) code-split and loaded only when audio is used.
**Acceptance:** Audio route/libs absent from initial bundle; record→save→playback works in webview; AB-repeat preserved.

### Phase 8 — Notes, settings, i18n & PWA polish
- Markdown notes (lazy `marked`), settings, **export/import JSON** (verified round-trip against legacy exports).
- i18n en/ar/bn with full RTL; language selection.
- Service worker v2 (Workbox): precache app shell, runtime-cache page data/fonts, background update, install prompt, offline-download-manager UI.
**Acceptance:** Full offline reading after first visit; legacy export imports without loss; Lighthouse PWA = installable; all three languages + RTL correct.

### Phase 9 — Cutover & launch
- Per-screen flag flip to 100%; redirect legacy routes → new app; update Play Store webview target.
- Delete `source/` monolith and dead assets; shrink repo (move 611MB raw PNGs out of git / to optimized pipeline output).
- Final full-suite Lighthouse + Playwright run against §3 budgets; staged rollout with rollback plan.
**Acceptance:** New app serves 100% of traffic under budget; legacy removed; rollback documented and tested.

---

## 6. Cross-cutting workstreams (every phase)
- **Testing:** unit (Vitest) for ported domain logic; Playwright E2E per feature; visual/RTL checks in Phase 2+.
- **Accessibility:** RTL correctness, focus management, screen-reader labels for controls, sufficient contrast in all themes.
- **Performance gates:** §3 budgets enforced in CI on every PR — no silent regressions.
- **Data safety:** every phase that touches storage must migrate/preserve existing users' IndexedDB (memorization, mistakes, notes, plans, goals, recordings).

---

## 7. Top risks & mitigations
| Risk | Mitigation |
|---|---|
| Greenfield "nothing ships for weeks" | Build alongside legacy; ship the reader (Phase 3) to real users behind a flag |
| Losing existing users' local data | Explicit IndexedDB migration + export/import round-trip tests before any cutover |
| 800MB offline ambition | Per-page lazy load default; offline "download all" becomes an opt-in, size-shown, resumable pack of *optimized* assets |
| QPC per-page font rendering fidelity | Keep the proven glyph-font approach; only change *when/how* fonts load, not the rendering model |
| Scope creep across 6 feature areas | Strict per-phase acceptance criteria; reader is the priority, everything else follows in order |

---

## 8. Hosting note
Everything is served from **Cloudflare Pages with no backend servers** and must stay that way (local-first). The redesign adds a *second* Pages deploy (from `redesign` → `app/dist`) alongside the untouched legacy production deploy (`master` → `source`), so shipping the new app never risks the live one.

## 9. Immediate next step
Begin **Phase 0**, task **0.1.1** in [phase-0-foundations.md](./phase-0-foundations.md): scaffold `app/` (Vite + Vue 3 + TS), sibling to `source/`, without touching legacy. Work top-to-bottom; each task is checked off only when its **verify** step passes.
