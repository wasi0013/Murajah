# Murajah: app/

The Vue 3 + Vite + TypeScript app. This is the whole product; there is no
separate legacy codebase anymore. It replaced the pre-2026 app end to end; see
[`../plans/archive/redesign-2026.md`](../plans/archive/redesign-2026.md) for
that history.

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
| `core/` | Framework-agnostic domain logic, **no Vue imports**. |
| `core/memorization/` | planManager, planScheduler, weaknessScorer, pageHasanah, calculations, … |
| `core/data/` | Data-access layer: page/juz/tafsir loaders + Web Worker client + manifest. |
| `core/storage/` | IndexedDB wrapper, schema migrations, export/import. |
| `stores/` | Pinia stores (settings, reader, plan, progress, partialProgress, journal, dayLog, quiz, audio, recordings, i18n…). |
| `design/` | Design tokens (`tokens.css`), theme, primitives. |
| `components/` | Reusable UI primitives (Sheet, Modal, Tabs, Icon, …). |
| `features/` | Feature areas, one folder each: reader, mushaf, memorize, today, progress, quiz, audio, listen, live, contents, preview, settings. Lazy-loaded routes. |
| `router/` | Vue Router, every route code-split via dynamic import. |
| `workers/` | Web Workers (data fetch/parse off the main thread). |
| `sw/` | Service worker (Workbox via vite-plugin-pwa). |

## Conventions

- **Path alias:** `@/` → `src/` (configured in `vite.config.ts` + `tsconfig.app.json`).
- **`core/` stays framework-agnostic** so its logic is unit-testable and portable.
- **Every route is code-split** (dynamic `import()` in the router) to protect the
  reader bundle budget.

## Caching ownership (no double-caching)

Each asset type has exactly one cache owner:

| Asset | Owner | Where |
|---|---|---|
| `/data/*.json` chunks | **IndexedDB AssetCache** (versioned, LRU + cap) | inside the data worker |
| `/fonts/*`, `/img/*`, app shell | **Service Worker** Cache API | N/A |
| User data (progress, plans, journal…) | **IndexedDB** (separate DB) | `core/storage/` |

The Service Worker must **not** runtime-cache `/data/*`; the AssetCache owns it.

## Deploy (Cloudflare Pages)

Production builds from `master`, deployed to Cloudflare Pages with no backend
servers (**murajah.pages.dev**).

**Dashboard setup (manual, requires the Cloudflare account):**

1. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git → this repo.
2. Settings:
   - **Production branch:** `master`
   - **Build command:** `cd app && npm ci && node ../data-pipeline/src/assets.mjs --no-images && npm run build`
     (`npm run build`'s own `prebuild` only regenerates `public/data/`; fonts are
     deliberately left out of that fast path, per `assets.mjs`'s header comment,
     because the 144MB set is slow. Skip this step and every `/fonts/*` request
     404s, or worse, silently 200s as the SPA-fallback shell. See
     `public/_redirects` and `data.worker.ts`'s content-type guard. Mushaf images
     are committed to git directly, so `--no-images` is intentional here: it's
     what `app-ci.yml` runs for the same reason.)
   - **Build output directory:** `app/dist`
   - **Root directory:** repo root (leave default)
3. Deploy. Deep links work via `public/_redirects` (SPA fallback) and caching is
   set by `public/_headers`.

Both files are emitted into `dist/` at build time. Verify after a build:

```bash
npm run build && ls dist/_redirects dist/_headers
```

**SEO prerendering:** `npm run build`'s own `postbuild` runs `scripts/prerender.mjs`,
which renders a small, deliberately narrow set of externally-linked static
routes (`/download`, `/preview`) in headless Chromium and writes each as a
real `dist/<route>/index.html` — otherwise every crawler that doesn't execute
JS (most AI-answer bots, and OG-unfurlers like Slack/Twitter) only ever sees
`index.html`'s "Loading Murajah…" boot placeholder, on every route. Cloudflare
Pages resolves that file at the *trailing-slash* URL (`/download` 308s to
`/download/` — confirmed with `wrangler pages dev dist`, which reproduces
Pages' real asset/redirect resolution; `vite preview` does not), which is why
`robots.txt`/`sitemap.xml`/this script's own canonical tags all use the
trailing-slash form. This step must never fail the build (Chromium hasn't
been verified to run inside Cloudflare's own build container — see the
script's header comment): a failure just logs a warning and ships the SPA
shell for those routes, same as before the script existed. Verify after a
build:

```bash
npm run build && ! grep -q "Loading Murajah" dist/download/index.html dist/preview/index.html
npx wrangler pages dev dist  # then curl -I localhost:8788/download — expect a 308 to /download/, not a 200
```
