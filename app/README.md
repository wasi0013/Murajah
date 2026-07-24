# Murajah — app/ (2026 redesign)

The new Vue 3 + Vite + TypeScript app. Built alongside the legacy `../source/`
during the redesign; see [`../plans/redesign-2026.md`](../plans/redesign-2026.md).

## Commands

```bash
npm install
npm run dev       # dev server
npm run build     # type-check (vue-tsc) + production build → dist/
npm run preview   # serve the built dist/
```

## Structure (`src/`)

| Path | Purpose |
|---|---|
| `core/` | Framework-agnostic domain logic — **no Vue imports**. Ported from `../source/resources/js`. |
| `core/memorization/` | planManager, planScheduler, weaknessScorer, pageHasanah, calculations, … |
| `core/data/` | Data-access layer: page/juz/tafsir loaders + Web Worker client + manifest. |
| `core/storage/` | IndexedDB wrapper, schema migrations, export/import. |
| `stores/` | Pinia stores (settings, reader, progress, goals, notes, i18n). |
| `design/` | Design tokens (`tokens.css`), theme, primitives. |
| `components/` | Reusable UI primitives (Sheet, Modal, Tabs, Icon, …). |
| `features/` | Feature areas, one folder each: reader, memorization, plans, quiz, audio, notes, settings. Lazy-loaded routes. |
| `router/` | Vue Router — every route code-split via dynamic import. |
| `workers/` | Web Workers (data fetch/parse off the main thread). |

## Conventions

- **Path alias:** `@/` → `src/` (configured in `vite.config.ts` + `tsconfig.app.json`).
- **`core/` stays framework-agnostic** so its logic is unit-testable and portable.
- **Every route is code-split** (dynamic `import()` in the router) to protect the
  reader bundle budget (see redesign plan §3).

## Caching ownership (no double-caching)

Each asset type has exactly one cache owner:

| Asset | Owner | Where |
|---|---|---|
| `/data/*.json` chunks | **IndexedDB AssetCache** (versioned, LRU + cap) | inside the data worker |
| `/fonts/*`, `/img/*`, app shell | **Service Worker** Cache API (Phase 8) | — |
| User data (progress, notes, goals…) | **IndexedDB** (separate DB) | Phase 1.9+ |

The Service Worker must **not** runtime-cache `/data/*` — the AssetCache owns it.

## Deploy (Cloudflare Pages)

The redesign runs as a **second, separate** Cloudflare Pages project so the legacy
production deploy (`master` → `source/`) is never touched.

**One-time dashboard setup (manual — requires the Cloudflare account):**

1. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git → this repo.
2. Settings:
   - **Production branch:** `redesign`
   - **Build command:** `cd app && npm ci && node ../data-pipeline/src/assets.mjs --no-images && npm run build`
     (`npm run build`'s own `prebuild` only regenerates `public/data/` — fonts are
     deliberately left out of that fast path, per `assets.mjs`'s header comment,
     because the 144MB set is slow. Skip this step and every `/fonts/*` request
     404s, or worse, silently 200s as the SPA-fallback shell — see
     `public/_redirects` and `data.worker.ts`'s content-type guard. Mushaf images
     are committed to git directly, so `--no-images` is intentional here — it's
     what `app-ci.yml` runs for the same reason.)
   - **Build output directory:** `app/dist`
   - **Root directory:** repo root (leave default)
3. Deploy. Preview URL serves the new app; deep links work via `public/_redirects`
   (SPA fallback) and caching is set by `public/_headers`.

Both files are emitted into `dist/` at build time — verify after a build:

```bash
npm run build && ls dist/_redirects dist/_headers
```

Keep this project pointed at `redesign` until the Phase 9 cutover.
