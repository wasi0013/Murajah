# Phase 4 — Memorization & Tracking (granular tasks)

**Parent:** [redesign-2026.md](./redesign-2026.md) §5 (Phase 4) · **Prereqs:** Phase 1 (migration `legacyExport`, storage) + Phase 3 (reader, mistakes store 3.8) + Phase 3b (mushaf view) complete. **Goal:** the memorization tracking layer — a **redesigned hasanah reward engine** (earned by actually reading + by memorizing), a 604-page **memorized grid**, **juz progress**, per-page **memorization-strength** scoring, **bulk-mark**, and a **stats/weakness** overview — all reading/writing one canonical local-first user-data store, migrating losslessly from legacy.

## Reward model (redesigned — supersedes legacy `hasanah × perfectRevisions`)

**Hasanah** = a user's **cumulative reward total**. It only ever **increases**, earned two ways:
1. **Reading a page** — while the page is the active surface (text QPC/Indopak *or* mushaf image), count **active reading time** (only while the tab is visible/focused and the page is on screen). When active time on that page in a session reaches:
   - **≥ 90s** → award `pageHasanah × 1` (once for the session);
   - **≥ 250s** → award an additional `pageHasanah × 1` (total **×2** — reward for the extra struggle).
   Re-earnable **each session** (a fresh visit to the page); active-time-only so it can't be farmed by leaving a page open/idle.
2. **Perfect revision** — reciting a page from memory with no mistakes → **memorization strength +1** *and* hasanah **+= `pageHasanah × 1`**.

**Memorization strength** (the honest name for legacy `perfectRevisions`) = per-page counter: **+1** per clean recitation, **−1 per mistake** (**floored at 0**). Mistakes reduce *strength only* — never hasanah.

**`pageHasanah`** = the existing per-page reward weight (kept — `pageHasanah.js`, 604 Madani values; the sum of the page's verse-hasanah). Only the *awarding* is redesigned, not the base weight. For a layout whose paging differs (Indopak, 610 pages) the page weight is the sum of that page's verses' hasanah from the same source (`quran.json` carries per-verse `hasanah`), so the basis stays identical.

**Definition of done:** reading a page for 90s/250s and marking perfect revisions accrue hasanah exactly per the model; mistakes decrement strength (floor 0); everything persists to IndexedDB and imports from a legacy export (seeding historical hasanah from prior revisions); the 604-page grid + juz progress + stats render without jank; a Progress view is reachable from the reader; §3-style budgets + a11y hold.

> Local-first: IndexedDB is the source of truth; every write debounce-persisted; **no backend**. Must never regress the reader's mistake data (3.8).

---

## 4.0 — Canonical user-data store
> 3.8 shipped `stores/mistakes.ts` + `core/storage/userData.ts` (mistakes only). This grows it into the full `UserData` the memorization features need.

- [x] **4.0.1** One canonical store holding `memorized: Set<page>`, `strength: Map<page, count>` (persisted under the legacy `perfectRevisions` key), `mistakes` (from 3.8), and **`hasanah: number`** (cumulative total). Actions: `toggleMemorized`, `setMemorized`, `bumpStrength(page, ±1)` (floor 0), `awardHasanah(amount)`, plus derived getters (`memorizedCount`, `isMemorized`, `strengthOf`, `totalHasanah`).
  - *Verify:* unit tests for each action incl. strength floor + hasanah monotonicity; 3.8 mistakes behaviour unchanged.
  - **Done:** `stores/progress.ts` (canonical 604; `TOTAL_PAGES`; range-guarded; strength floors at 0 and drops the key; hasanah monotonic). `useMistakesStore` (3.8) kept separate, co-persisting via `userData.ts` (no parallel schema). 6 unit tests.
- [x] **4.0.2** Persistence (`core/storage/userData.ts`): serialize/deserialize `memorized[]`, `perfectRevisions{}` (= strength), `mistakes{}`, and `hasanah` (new field) in one record; debounce-persist; hydrate on load.
  - *Verify:* set → reload → restored (fake-indexeddb); legacy keys preserved; the new `hasanah` field defaults sanely when absent.
  - **Done:** `serializeProgress`/`deserializeProgress` + `loadProgress`/`saveProgress` under a `progress` key (mistakes stay under `mistakes`); legacy keys `memorized`/`perfectRevisions` preserved; `hasanah` defaults 0. Round-trip + fake-indexeddb reload tested.
- [x] **4.0.3** **Migration**: import a legacy v2.0.0 export via `parseLegacyExport` (`setAll`) and export back via `serializeUserData`. **Seed** the cumulative `hasanah` from prior memorization = `Σ pageHasanah(page) × strength(page)` (the historical reward), since legacy computed it on the fly; reading rewards start fresh (0). Export keeps `perfectRevisions` (= strength) for round-trip.
  - *Verify:* `json → import → export` round-trips `memorized`/`perfectRevisions`/`mistakes`; seeded `hasanah` equals `Σ hasanah×strength` of the imported data.
  - **Done:** pure `core/memorization/progressMigration.ts` `progressFromLegacy` seeds hasanah = `Σ getPageHasanah×strength`; carries memorized + strength; serializes back to the legacy keys. 2 unit tests.

## 4.1 — Hasanah reward engine (the redesign)
- [x] **4.1.1** **Reading-time reward** — `useReadingReward` (shared by the text reader + mushaf view): tracks **active** seconds for the current page (accrue only while `document.visibilityState === 'visible'`, window focused, and this page is the on-screen one; pause otherwise). At the **90s** threshold award `pageHasanah × 1`; at **250s** award another `pageHasanah × 1`; each is granted **once per session**, reset when the page changes or the surface unmounts.
  - *Verify:* unit tests on a pure timer/threshold reducer (fake clock): 89s → 0, 90s → ×1, 250s → ×2, idle/hidden time doesn't count; re-visiting the page starts a new session; leaving at 120s and returning doesn't double-award the same session.
  - **Done:** pure `core/memorization/readingReward.ts` (`tickReadingReward`, once-per-threshold, active-time only) with 7 fake-clock unit tests. `composables/useReadingReward.ts` (1s interval, gated on `visibilityState`+focus, resets session on page change) wired into `ReaderView` (via `useMadaniPage`) and `MushafView`; 3 fake-timer component tests (×1@90s, ×2@250s, no accrual hidden, re-earns on page change).
- [x] **4.1.2** **Reading-reward page weight** (memorization is canonical-604, but reading happens in any layout): QPC/mushaf pages use `PAGE_HASANAH_VALUES[page-1]` directly; for **Indopak** reading, resolve the current Indopak page → its Madani (604) page via the nav index (top ayah → qpc page) and use that page's weight, so reading rewards stay in the same 604 hasanah basis without a separate Indopak weight table.
  - *Verify:* QPC/mushaf page N weight == `PAGE_HASANAH_VALUES[N-1]`; an Indopak page maps to the Madani page of its first ayah and awards that weight; both layouts feed the one hasanah counter.
  - **Done:** `composables/useMadaniPage.ts` (QPC→same; Indopak→`remapPage` through cached navs) feeds the reward the canonical page; the reader passes `getPageHasanah` as the weight so both layouts award in the 604 basis.
- [x] **4.1.3** **Perfect-revision reward**: `bumpStrength(page, +1)` also `awardHasanah(pageHasanah(page) × 1)`. Surfaced wherever a clean revision is recorded (grid cell sheet + reader).
  - *Verify:* +1 strength ⇒ hasanah increases by exactly that page's weight; strength colour tier updates.
  - **Done:** store `recordPerfectRevision(page)` = `awardHasanah(getPageHasanah(page))` + `bumpStrength(+1)`. Unit-tested (strength up + exact hasanah). UI surfacing lands with the grid (4.5).
- [x] **4.1.4** **Mistake penalty**: each mistake on a page `bumpStrength(page, −1)` (floor 0); hasanah untouched. Route the reader's mistake toggle (3.8) through the canonical store so marking N mistakes lowers strength by N. **Un-marking a mistake does NOT restore strength** — strength only ever *rises* via a clean recitation from memory (user-confirmed).
  - *Verify:* marking a mistake lowers strength by 1 (not below 0); un-marking leaves strength unchanged; hasanah never moves on mistakes; grid reflects it.
  - **Done:** `useMistakes.markWord` now calls `progress.penalizeMistake(qpcPage)` **only when it marks** (uses the toggle's return); un-marking never restores. Unit-tested (mark → −1, un-mark → unchanged).

## 4.2 — Type + wire the ported domain logic
- [ ] **4.2.1** Convert to **`.ts`** with real types: `pageHasanah`, `calculations`, `weaknessScorer`, `scoreFormatter`. **Drop** the legacy `calculateTotalScore = Σ hasanah×perfectRevisions` as the *live* total (it's now the migration-seed only); keep the per-page weight + colour/grid/stat helpers + weakness maths.
  - *Verify:* kept helpers unchanged (characterization tests); `vue-tsc` clean; removed/replaced pieces documented.
- [ ] **4.2.2** **Parity where it still applies**: the 6-tier strength colours (`getScoreColor`), grid/juz shapes, and `weaknessScorer` maths match legacy on a migrated fixture; the seeded hasanah matches `Σ hasanah×strength`.
  - *Verify:* numbers match on the committed fixture.

## 4.3 — Memorized page grid
- [x] **4.3.1** `features/progress/MemorizedGrid.vue`: the **604-page canonical (Madani/QPC) grid** — memorization is tracked in one scheme regardless of reading layout (user-confirmed); the Indopak reader is just a view. Grouped by juz (from the **derived `nav.juzToPage`** for QPC — not the legacy off-by-one tables, see [legacy-hardcoded-tables.md](./legacy-hardcoded-tables.md)), each cell **colour-coded** (not-started / memorized / strength tier via `getScoreColor` / has-mistakes) showing page number + strength.
  - *Verify:* 604 cells; juz boundaries match `nav.juzToPage` (qpc); cells correct for a sample dataset; legend; AA contrast in all 3 themes; colour is not the only status cue.
  - **Done:** 604 cells across 30 juz (e2e-asserted); success ramp via `color-mix(var(--color-success) 22–94%)` by strength tier (design tokens, not legacy `getScoreColor` Tailwind classes); page number always shown + a danger dot for mistakes (colour is never the only cue); a compact legend (empty / weaker→stronger ramp / has-mistakes); axe-clean in light/dark/sepia.
- [x] **4.3.2** **Interaction**: tap a cell → per-page sheet (memorized toggle · strength stepper · "open in reader"); a bulk-select mode (4.4); keyboard-navigable roving grid.
  - *Verify:* tap toggles + persists; "open in reader" deep-links `/read/qpc/{page}`; arrows move focus, Enter activates.
  - **Done:** tap → `BottomSheet` (memorized `Toggle` · strength stepper · "Open in reader" → `/read/qpc/{page}`); mark→persist→reload e2e-asserted. Cells are native `<button>`s (Tab-reachable, Enter/Space activate). ⚠️ **Arrow-key roving-tabindex not implemented** (604 native buttons = Tab-through) — deferred; acceptable for the touch-first target but leaves the "arrows move focus" verify open.
- [x] **4.3.3** **Perf**: marking updates just the affected cell(s); 604 cells scroll smoothly; virtualize only if measured necessary.
  - *Verify:* no long task >50ms on a mid profile when marking/scrolling.
  - **Done:** Vue patches only changed cells; e2e mark/scroll shows no jank. Not virtualized (unnecessary at 604). *Formal long-task profiling still TODO under 4.10.*

## 4.4 — Bulk-mark
- [x] **4.4.1** Range/multi-select to (un)mark a span memorized at once (a juz, or a page range `A–B`), reusing `generatePageRange`/`isValidPageRange`, as **one** persisted batch.
  - *Verify:* marking a juz flips exactly its pages; invalid range rejected; single write, not N.
  - **Done:** `ProgressView` range inputs (from–to) + Memorized/Clear; clamped to 1..604; debounced persistence coalesces the loop into a single save. Range-mark e2e-asserted (pages 1–3 flip). *(Uses inline clamp, not the legacy `generatePageRange`/`isValidPageRange` helpers — those get typed/reused in 4.2.)*

## 4.5 — Memorization-strength stepper
- [x] **4.5.1** Per-page strength stepper (increment on a clean revision → also awards hasanah, 4.1.3; decrement to correct), on the grid cell sheet and reachable from the reader. Colour follows the 6-tier scale; relabel UI **"Memorization strength"** (storage key stays `perfectRevisions`).
  - *Verify:* increment awards the page's hasanah + raises the tier; decrement lowers strength (floor 0) **without** removing already-earned hasanah; persists.
  - **Done:** sheet stepper — "+" = `recordPerfectRevision` (strength +1 **and** awards `pageHasanah`), "−" = `bumpStrength(-1)` (floor 0, hasanah untouched); labelled "Memorization strength". e2e: "+" raises strength 0→1 and hasanah off 0. Reachable from the grid; reader entry is the top-bar button (4.9).

## 4.6 — Juz progress overview
- [x] **4.6.1** A 30-item juz overview: per-juz memorized progress (bar + %/count) from the store; tapping a juz scrolls/filters the grid. Juz boundaries come from the **derived `nav.juzToPage`** for the active layout (accurate per-layout — *not* the legacy 20-page blocks or the off-by-one hardcoded tables; see [legacy-hardcoded-tables.md](./legacy-hardcoded-tables.md)).
  - *Verify:* per-juz counts sum to the layout total (604/610); boundaries match `nav.juzToPage`; grouping identical to the reader's juz indicator.
  - **Done:** each juz section has a labelled `role="progressbar"` (aria-valuemin/now/max) + count; boundaries from `buildJuzGroups(nav.juzToPage('qpc'))`; 30 groups spanning 604 (unit + e2e asserted). ⚠️ **Tap-a-juz-to-scroll/filter not implemented** — the grid is one scroll surface with inline juz headers; jump-to-juz deferred.

## 4.7 — Stats dashboard
- [x] **4.7.1** Summary: memorized count + **%**, remaining, juz count, **total hasanah** (the cumulative counter — *not* recomputed from strength), mistakes count, average strength, est. completion (`estimateCompletionDate`, optional).
  - *Verify:* memorized/%/remaining match `calculations`; total hasanah == the store counter and updates live as reading/revisions accrue.
  - **Done:** stat cards — memorized/604 + %, hasanah (live store counter, `toLocaleString`), pages-with-mistakes, avg strength (`memorizationStats`, unit-tested). Hasanah updates live (e2e). *Juz-count + est-completion cards not shown (optional/low value); `remaining` computed but not surfaced as a card.*
- [x] **4.7.2** **Weakest pages**: `calculateAllWeaknesses` over the memorized set + `getWeakestPages(n)` → weakest first, each linking into the reader.
  - *Verify:* ordered by weakness desc; opens the right page; excludes non-memorized.
  - **Done:** `useMemorization.weakestPages` runs `calculateAllWeaknesses` over the memorized set (strength + mistakes; neutral `pageReviewData` until Phase 5) → `getWeakestPages(…,10)`; rendered as chips opening the per-page sheet. Excludes non-memorized (only iterates `progress.memorized`).

## 4.8 — Weakness scoring wired
- [ ] **4.8.1** Feed `calculateAllWeaknesses`: `perfectRevisions` (= strength), `mistakesMap`, and **`pageReviewData`** (`{page → {lastReviewDate, reviewCount}}`). Establish review data — a lightweight `lastReviewedAt`/`reviewCount` bumped when a page earns a reading reward or a revision here (full history is Phase 5); quiz accuracy is Phase 6 (neutral until then).
  - *Verify:* scores match `weaknessScorer` for given inputs; missing review data uses the neutral default (no crash); recency moves scores with a fixed `today`.

## 4.9 — Route, entry & chrome
- [x] **4.9.1** A **Progress** route (e.g. `/progress`, code-split — **not** in the reader bundle) hosting grid + juz overview + stats, reachable from the reader chrome (tab/menu). Consistent top-bar, safe-area, all 3 themes; deep-linkable.
  - *Verify:* opens from the reader and returns; separate chunk (size gate); themes + safe-area correct.
  - **Done:** `/progress` route (code-split → own `ProgressView` chunk ~10 kB gzip 4.4, absent from the reader bundle — size gate 54.16/120 kB). Entry = a **"Memorization progress" top-bar icon button** (`Brain`) in the reader — user chose a top-bar button over a tab, leaving the Home/Mushaf/Surahs/Goals/Quiz/More tab bar untouched. Sticky top-bar with `env(safe-area-inset-top)`, back-to-reader; e2e opens it from the reader; deep-linkable at `/progress`.

## 4.10 — Perf, a11y, migration & test gate
- [ ] **4.10.1** **Migration parity (headline):** a migrated legacy export shows identical memorized pages, strength colours, mistakes, and a hasanah seeded to `Σ hasanah×strength`.
  - *Verify:* e2e/integration on the committed fixture.
  - *Status:* unit parity covered (`progress-migration.test.ts` — seeded hasanah == `Σ pageHasanah×strength`). **e2e on a committed legacy-export fixture still TODO.**
- [x] **4.10.2** **A11y**: keyboard-navigable labelled grid (each cell announces page + status); colour never the only signal; axe clean across light/dark/sepia.
  - *Verify:* axe WCAG 2 A/AA clean; keyboard walkthrough; non-colour cue present.
  - **Done:** axe WCAG2 A/AA clean on `/progress` across light/dark/sepia (e2e); every cell has an aria-label (page + memorized/strength/mistakes); juz bars labelled; non-colour cues = page number + mistake dot. *(Arrow-key roving not implemented — see 4.3.2; Tab reaches every cell.)*
- [ ] **4.10.3** **Tests + budgets:** unit (store actions, reading-reward reducer, typed domain, parity), e2e (mark/persist/reload, bulk-mark, reading-reward accrual, strength + mistake coupling, weakest-pages nav, migration). `test:unit` + `test:e2e` green; `size` under budget; `build` clean; Progress absent from the reader chunk.
  - *Status:* unit **430** green, e2e **55** green (incl. Progress: entry, 604/30-juz render, mark/persist/reload, bulk-mark, strength+hasanah, a11y×3 themes); `size` under budget; `build` clean; Progress in its own chunk. **Remaining: typed-domain + parity unit tests (4.2), migration e2e (4.10.1), reading-reward accrual is unit-only (can't e2e a 90s threshold), weakest-pages-nav e2e.**

---

### Exit checklist (all true to close Phase 4)
- [ ] Redesigned hasanah engine live: reading-time rewards (90s ×1 / 250s ×2, active-time, per-session) + perfect-revision rewards accrue a monotonic hasanah total.
- [ ] Memorization strength = +1 per clean revision, −1 per mistake (floor 0); mistakes never touch hasanah.
- [ ] One canonical user-data store (memorized + strength + mistakes + hasanah) persisted + migrated losslessly (hasanah seeded from prior revisions); reader mistakes (3.8) unaffected.
- [ ] 604-page grid (colour-coded, tap-toggle, bulk-mark, open-in-reader) + juz progress + stats + weakest-pages; renders/updates without jank.
- [ ] Domain modules typed to `.ts`; kept maths legacy-identical where it still applies; Progress route code-split; a11y clean; budgets green.

### What later phases consume from here
Phase 5 (plans/daily goals/streaks) uses the memorized set + weakness + populates real `pageReviewData` (review history). Phase 6 (quiz) feeds quiz accuracy into weakness. Phase 8 (settings/export) reuses the migration import/export path.

### Open decisions to confirm before/at start
- **Store consolidation:** fold 3.8's `useMistakesStore` into one `useUserDataStore`, or keep separate and co-persist via `userData.ts`? *(Currently: kept separate, co-persisting — no parallel schema. Revisit only if it causes friction.)*
- ~~**Entry point / tab:** which chrome slot hosts Progress~~ — **Resolved:** a **top-bar icon button** in the reader (not a tab), leaving the user's Home/Mushaf/Surahs/Goals/Quiz/More tab bar untouched.

### Resolved
- **Memorization scheme = canonical 604 (Madani/QPC)** — one grid + one store keyspace regardless of reading layout; matches 3.8's QPC-page-keyed mistakes; legacy-compatible. · Reading reward is **per-session, active-time** (idle/hidden doesn't accrue). · `pageHasanah` base weights **kept** (existing 604 values; Indopak summed from verse hasanah). · Strength **floored at 0**; **un-marking a mistake never restores** strength. · Hasanah is a **cumulative counter** (reading + revision only; mistakes don't reduce it). · "perfect revision" relabeled **"memorization strength"** in UI, key unchanged. · **`pageReviewData`**: bump a lightweight `lastReviewedAt`/`reviewCount` on reading-reward/revision now (real history in Phase 5). · Juz/surah/page slicing uses the **derived per-layout nav indexes**, not the legacy hardcoded (off-by-one) tables ([legacy-hardcoded-tables.md](./legacy-hardcoded-tables.md)).
