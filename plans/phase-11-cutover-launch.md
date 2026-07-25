# Phase 11 — Cutover & launch

## History

1. First version of this doc claimed `source/` (824MB) was entirely dead and safe to delete.
   That was wrong — `data-pipeline` read its raw Quran text, translations, tafsir, morphology,
   fonts, and mushaf page scans directly from `source/resources/{data,styles/fonts,assets/images}`
   on every build. Deleting them broke `npm run data` with `ENOENT`. Corrected once the mistake
   was caught, restoring everything and re-tracing every reference from source.
2. Rather than leave `data-pipeline` reaching into a folder that was supposed to be legacy for
   data it actually owned, those three live folders were **relocated into `data-pipeline/input/`**
   (see `data-pipeline/src/lib/paths.mjs` — `INPUT_DATA`/`INPUT_FONTS`/`INPUT_IMAGES`, resolved
   relative to the package itself, not the repo root). Verified: `npm run data`,
   `npm run assets:build`, `data-pipeline`'s own test suite (30/30), and the app's `vue-tsc` +
   Vitest (846/846) all pass against the new location.

As a result, **`source/` now contains only dead content** — the live/dead split that made earlier
versions of this doc complicated no longer exists. Everything below is written against that
post-relocation state.

## Do NOT remove — still live, unaffected by this doc

- **`docs/`** (1.7GB, 12,708 `.mp3`) — GitHub Pages publish root (Pages source = `/docs`).
  `app/src/core/audio/reciters.ts` hardcodes `wasi0013.github.io/Murajah/recitations/...` as the
  primary source for two verse reciters (Shuraim, Ali Jaber) in the live app.
- **`plans/*.md`**, **`data-pipeline/`**, **`app/`** — active documentation / actively built and
  tested. `data-pipeline/input/` (the relocated data/fonts/images) is part of `data-pipeline/`
  here, obviously not for removal.

## Batch 1 — safe to remove now

`source/` no longer has a live/dead split — everything under it is the legacy vanilla-JS/Vue2 app
shell, now that its only load-bearing content has moved out. Safe to remove as one unit, plus the
root test harness that exists solely to test it:

| Path | Size | Why it's dead |
|---|---|---|
| `source/` (all of it) | ~6MB (post-relocation; was 824MB) | The legacy app's HTML shell (`index.html`, `quiz.html`, `plan.html`, `privacy.html`, `hotfix.html`, `manifest.json`, `sw.js`), its own JS (`resources/js/` — Vue 2 global build, Tailwind 3, Font Awesome), `resources/favicon.ico`, the unreferenced `resources/detailed_quran.json`, two unused legacy CSS files (`resources/styles/{qpc-v2-font,style}.css`), the now-data-pipeline-owned-elsewhere `resources/data/i18n/` (176KB, superseded by `app/src/core/i18n/catalogs/`), and 4 small unused logo images in `resources/assets/images/`. Nothing here is read by `data-pipeline` or `app/` — confirmed via grep, and via the relocation in this doc's History section actually moving out everything that *was* live. `app/src/core/pwa/legacyTeardown.ts` retires the old *installed* service worker client-side and needs none of these source files present to do it. |
| `tests/` (root, 46 files) | — | Vitest/Playwright specs for the legacy app. `tests/unit/calculations.test.js` mocks `source/resources/js/utils/pageHasanah.js` directly — confirms these tests target the JS above, not anything else. Not run by `app-ci.yml`. |
| `vitest.config.js` (root) | — | `coverage.include: ['source/resources/js/**/*.js']` — only wires up the JS above. |
| `playwright.config.js` (root) | — | `testDir: './tests/e2e'` — the same specs. |
| `scripts/generate_indopak_mappings.py` | — | Reads `source/resources/data/quran/detailed_quran.json`, a path that doesn't exist even before this relocation (the only `detailed_quran.json` was one level up). Cannot currently run; dead independent of anything else here. |

```bash
git rm -r source/ tests/
git rm vitest.config.js playwright.config.js scripts/generate_indopak_mappings.py
```

## Needs your judgment call, not a blanket delete — the other 3 `scripts/*.py`

`scripts/generate_tafsir_mapping.py`, `quran_pagemapping.py`, and `quran_pagemapping_combined.py`
all hardcode `source/resources/data/...` paths — now stale after the relocation (that data lives
at `data-pipeline/input/data/...`). None of them is invoked by any current build step; their
*output* is what was actually live (already sitting as static JSON, now moved to
`data-pipeline/input/data/tafsir/`, and read by `data-pipeline` from there). Losing these scripts
loses the *ability to regenerate* that data if it ever needs correcting — real provenance, but not
currently exercised. Two reasonable options, your call:

1. **Delete** — accept that if this data ever needs recomputing, someone writes a new script
   against the current shape.
2. **Keep, but relocate and fix** — move into `data-pipeline/tools/`, repoint their hardcoded paths
   at `data-pipeline/input/data/...`, since that's where they conceptually belong now that
   `data-pipeline/` is the one real build system.

Not included in the Batch 1 command above — left out on purpose pending your choice.

## Batch 2 — needs a small edit, not a straight delete

- **Root `package.json`** — after Batch 1, `test`, `test:unit*`, `test:e2e*`, `test:quick`, and
  `serve` (`npx serve source -p 3000`) all stop working, and the `devDependencies` that exist only
  to support them (`@playwright/test`, `@vitest/coverage-v8`, `fake-indexeddb`, `happy-dom`,
  `http-server`, `msw`, `serve`, `vitest`) become unused. `app/package.json` already has its own
  copies of everything it needs. Only `husky` + `setup-hooks`/`setup-hooks:fast` stay meaningful.
- **`.husky/pre-commit-fast`** — currently runs `npm run test:unit` at the **root** (the legacy
  suite being removed). Repoint at `cd app && npm run test:unit`, or drop the hook.
- **`.husky/pre-commit`** — its real test command is already commented out (echoes a message
  only) — decide intentionally rather than leaving it accidental.
- **`hooks_doc.md`** — update once the hooks change, or fold into `app/README.md`.
- **`app/README.md`** — one line says `core/` was "Ported from `../source/resources/js`"; still
  historically true but points at a path that Batch 1 removes. Update to note it's a historical
  reference once `source/` is gone, or drop the path.

## Optional, low-priority

- **`.retro/retro-2026-04-03.json`** — a single stale `/retro`-skill snapshot (its `hotspots` are
  all `source/*` paths). Harmless either way.

## Explicitly out of scope

- **Rewriting git history** to shrink the 4.0GB `.git` — far more destructive than deleting at
  HEAD (rewrites every commit hash on `master`, needs a force-push). Flagged, not proposed.
- **`docs/` migration off GitHub Pages** — a product/infra decision, not cleanup.

## Verification after Batch 1

1. `cd app && npm run data && npm run assets:build` (or from `data-pipeline/`) — unaffected by
   Batch 1 either way, since none of it touches `data-pipeline/input/`. Re-run as a sanity check.
2. `cd app && npx vue-tsc -b && npx vitest run && npx playwright test` — unaffected either way.
3. `git grep -rn "resources/js\|source/index.html\|source/manifest.json" -- . ':!plans'` — should
   return nothing once Batch 1 + the `app/README.md` edit in Batch 2 land.
