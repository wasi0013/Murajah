# Phase 0 — Foundations & Audit (granular tasks)

**Parent:** [redesign-2026.md](./redesign-2026.md) · **Goal:** New `app/` boots, CI/deploy/test/perf gates in place, key decisions grounded in a real audit. No product features yet — this phase de-risks everything after it.

**Definition of done for the phase:** a bundled, minified `app/` deploys to a Cloudflare Pages preview URL under the §3 budgets; CI blocks PRs that break budgets; the asset/data audit doc exists with concrete reduction numbers.

> Work top-to-bottom; each task lists a concrete **verify** step. Check the box only when verify passes. Keep each task to one small PR where possible.

---

## 0.1 — Repo & project scaffold
- [ ] **0.1.1** Create `app/` with Vite + Vue 3 + TypeScript (`npm create vite@latest`, template `vue-ts`). Keep it a sibling of `source/`; do not touch `source/`.
  - *Verify:* `cd app && npm i && npm run dev` serves a Vue page; `npm run build` produces `app/dist`.
- [ ] **0.1.2** Add Pinia and Vue Router; create an empty `router` with one placeholder `/` route and one Pinia store.
  - *Verify:* app boots with router-view rendering the placeholder; no console errors.
- [ ] **0.1.3** Establish folder skeleton from §2 of the master plan (`core/`, `stores/`, `design/`, `components/`, `features/`, `router/`, `workers/`). Add a short `app/README.md` describing each.
  - *Verify:* folders exist with `.gitkeep` or index stubs; README lists them.
- [ ] **0.1.4** Configure path aliases (`@/` → `app/src`) in `vite.config.ts` + `tsconfig`.
  - *Verify:* an `@/`-aliased import resolves in build and editor.

## 0.2 — Tailwind (compiled, zero runtime) + design tokens skeleton
- [ ] **0.2.1** Install Tailwind via the Vite plugin (`@tailwindcss/vite` for v4, or postcss for v3) — **build-time only**, no CDN/JIT script.
  - *Verify:* a Tailwind class renders; `grep -r tailwind app/dist/assets` shows compiled CSS, **not** the runtime compiler; built CSS file is small (<30KB gz for the shell).
- [ ] **0.2.2** Create `design/tokens.css` (CSS custom properties: color, space, radius, type scale, motion) + a `data-theme` switch stub for light/dark/sepia. Empty but structured.
  - *Verify:* toggling `data-theme` on `<html>` changes a demo swatch; tokens documented inline.
- [ ] **0.2.3** Choose + install a tree-shaken SVG icon approach (Lucide/Phosphor) to replace Font Awesome. Add one icon.
  - *Verify:* only the imported icon ships (check bundle); no full icon-font CSS.

## 0.3 — Testing harness
- [ ] **0.3.1** Wire Vitest for `app/` (config, happy-dom/jsdom, `fake-indexeddb` like legacy). One trivial passing unit test.
  - *Verify:* `npm run test:unit` green in `app/`.
- [ ] **0.3.2** Wire Playwright against the built `app/` (reuse patterns from root `playwright.config.js`). One smoke E2E (app loads, title correct).
  - *Verify:* `npm run test:e2e` green against `app/dist` preview server.
- [ ] **0.3.3** Decide test-runner ownership: root scripts vs `app/` scripts. Document how to run both legacy and new suites.
  - *Verify:* documented commands run both without collision.

## 0.4 — Performance budget gates (the enforcement layer)
- [ ] **0.4.1** Add a bundle-size gate (e.g. `size-limit` or a custom script) encoding §3: initial reader-route JS ≤ 120KB gz, shell CSS ≤ 30KB gz.
  - *Verify:* gate passes on the empty shell; artificially importing a huge lib fails it.
- [ ] **0.4.2** Add Lighthouse CI with budgets for FCP/LCP/TTI (§3) against a preview build, throttled "mid Android" profile.
  - *Verify:* LHCI runs locally and in CI, prints scores, fails on a budget breach.
- [ ] **0.4.3** Wire both gates into a GitHub Actions workflow triggered on PRs touching `app/`.
  - *Verify:* open a draft PR; checks appear and pass.

## 0.5 — Deploy pipeline (Cloudflare Pages, no backend)
- [ ] **0.5.1** Configure a **second** Cloudflare Pages project (or preview branch) whose build output is `app/dist`, build command `cd app && npm ci && npm run build`. **Do not disturb** the existing master→`source` production deploy.
  - *Verify:* pushing `redesign` deploys a preview URL serving the new shell.
- [ ] **0.5.2** Confirm SPA fallback (all routes → `index.html`) and correct caching headers for hashed assets vs. data.
  - *Verify:* deep-linking a route on the preview loads (no 404); `_headers`/`_redirects` in place.
- [ ] **0.5.3** Document the two-deploy setup (legacy prod vs. redesign preview) in `app/README.md`.
  - *Verify:* another dev could reproduce from the doc.

## 0.6 — Asset & data audit (deliverable: `plans/audit-assets-data.md`)
- [ ] **0.6.1** Inventory every runtime asset with exact size, count, and current load path: the 604 QPC fonts (94MB), tajweed fonts (50MB), Indopak, 62MB JSON (list each file), 611MB PNG spreads (305 files).
  - *Verify:* table with sizes reconciles to `du -sh` totals.
- [ ] **0.6.2** For each JSON, record its access pattern (whole-file vs per-page/per-surah) to design chunking in Phase 1.
  - *Verify:* each file tagged with a chunking strategy + projected per-page size.
- [ ] **0.6.3** Font research spike: document candidate uthmani+tajweed / indopak sources (QUL, quran.com, COLR/CPAL) with pros/cons and a recommendation; **constraint: identical script + tajweed output.**
  - *Verify:* a recommendation with rendering-fidelity evidence (screenshots) for the QPC surface.
- [ ] **0.6.4** Image spike: prototype AVIF/WebP transcode of 3 sample pages + a single-page split; record size reduction and legibility.
  - *Verify:* sample sizes (target ≤ ~200–400KB/page) + before/after screenshots recorded.
- [ ] **0.6.5** Repo-size decision: whether the 611MB raw PNGs stay in git, move to Git LFS, or become pipeline inputs stored outside git.
  - *Verify:* decision recorded with rationale; no action yet (executed in Phase 1/9).

## 0.7 — Domain-logic port map (planning only)
- [ ] **0.7.1** List every module under `source/resources/js/{utils,stores,components}` and classify: **port as-is** (framework-agnostic logic), **port + adapt** (light Vue coupling), **rewrite** (UI). Output a mapping table.
  - *Verify:* table covers all 36 JS files; each has a target location in `app/src`.
- [ ] **0.7.2** Identify existing unit tests that can move with ported logic (they are the safety net).
  - *Verify:* list of reusable test files noted against their modules.

---

### Exit checklist (all must be true to start Phase 1)
- [ ] `app/` builds, deploys to preview under §3 budgets.
- [ ] CI fails a PR that breaches bundle-size or Lighthouse budgets.
- [ ] `plans/audit-assets-data.md` complete with concrete reduction targets + font/image recommendations.
- [ ] Domain-logic port map agreed.
- [ ] Legacy master→`source` production deploy untouched and still live.
