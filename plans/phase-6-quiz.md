# Phase 6 — Quiz Mode (granular tasks)

**Parent:** [redesign-2026.md](./redesign-2026.md) §6 (Phase 6) · **Prereqs:** Phase 4 (progress store, weakness scoring with the reserved `quizScores` hook) and Phase 5 (unified plan: `scope` / `scopePages`, per-page `ReviewSchedule`) complete. **Goal:** fold the standalone `quiz.html` into the SPA as a **lazy, code-split** route that drills the pages you're actually memorizing, and closes the loop Phase 4.8 left open — quiz accuracy feeds per-page weakness so pages you keep failing resurface in revision.

## Why this is a redesign, not a port

The roadmap's port-map classes `quizHelpers.js` as **PORT** (move as-is). That classification is wrong for all but ~5 pure functions, and the product owner flagged that the legacy quiz "had some bugs." Two structural mismatches force a rebuild:

1. **The data contracts are gone.** Legacy quiz loaded `resources/data/quran/quran.json` and `en.json` as **verse-keyed arrays** (`{ "2": [{ chapter, verse, text, page }] }`), plus a **hash-keyed** word-by-word map and a 15-lines layout file. None of these shapes exist in the new pipeline, which is **page-chunked** (`getPage(layout, page).words[].text` for Arabic) and **surah-chunked** (`getTafsir(lang, surah)` verse translations; `getTranslations` word-level). So every data-shaping helper — `buildVerseCache`, `buildPageWordIndex`, `getPagesForSurahs`, `preloadFontsForPages`, `getRandomVerses` — is dead on arrival. Only the pure combinatorics survive (see 6.1).

2. **The quiz was a walled garden.** It ran on its **own IndexedDB** (`MurajahQuizDB`), picked surahs in a settings tab, and its scores **never touched** memorization data — no feedback into weakness or scheduling. The new app is memorization-centric and Phase 4.8 explicitly reserved a `quizScores → weaknessScorer` hook (still stubbed `new Map()` at `core/memorization/dailyTasks.ts`). Phase 6 wires it.

**The decisions taken for this phase (product-owner confirmed):**

1. **Plan/page-scoped, with a surah/juz override.** By default the quiz draws from the pages in your Phase 5 plan (`plan.scopePages`); an optional picker lets you target arbitrary surahs or juz. Both resolve to the same unit — **a set of pages** — so one machinery serves both. (Legacy was surah-picker only.)
2. **Three modes: translation match · verse continuation · word completion.** **No lightning round** in Phase 6 (deferred; it also carried the worst of the legacy bugs — see catalogue).
3. **Quiz results feed weakness, in a separate store.** Per-page quiz accuracy is persisted in its own key and fed into the weakness scorer (weight 0.15, the reserved hook). It **does not** advance the SM-2 review schedule — a lucky multiple-choice guess must not push out a real revision. Quiz ≠ revision.
4. **One data source, no new pipeline dataset.** Questions are built at runtime from **page chunks the reader already caches** (`getPage`), verse translations from `getTafsir`, and adjacency from `getNavIndex`. Continuation loads at most one adjacent page. Fonts come from the app's existing font system, never injected `<style>` tags. (Rationale + fallback in 6.0.)
5. **Interleave strong pages (~25%).** Question targets are weighted toward weak pages (so the quiz reinforces what needs it), but **~1 in 4 questions deliberately draws from a *strong* page** — to catch silent regressions in pages you think you know, and to keep a session from being an unbroken wall of your worst pages. The ratio is a single tunable constant (`STRONG_RATIO = 0.25`).

**Definition of done:** a `/quiz` route, lazy and code-split (0 KB added to the reader bundle), offering three question modes over the plan's pages (or a chosen surah/juz). Each answered question persists per-page accuracy, which feeds weakness scoring so weak-quiz pages surface sooner in the Today revision queue. Arabic renders in the correct page font via the app pipeline; RTL and a11y clean across all three themes. Navigating quiz ↔ reader ↔ today never wedges IndexedDB (the legacy iOS failure mode is gone by construction and regression-tested). No lightning round. Legacy `MurajahQuizDB` history is not migrated (isolated, see 6.7).

> Local-first: IndexedDB is the source of truth; **no backend**. Must never regress Phase-4 progress/reward, Phase-5 scheduling, or the reader's data.

---

## Bug catalogue — legacy defects this phase must not reintroduce

Audited in `source/quiz.html` (3339 lines) + `source/resources/js/utils/quizHelpers.js`. Recorded here so the rebuild is measured against them, not the other way round.

- **B1 — Unbounded recursion on retry.** `generateNewQuestion`, `generateContinuationQuestion`, `generateLightning{Continuation,Translation}Question` all retry by `await`-ing *themselves* when a pick is ineligible (no translation; surah < 3 verses). A scope where every candidate is ineligible recurses until the stack blows. **Fix:** precompute the eligible pool once; if it's empty, surface an empty-state, never recurse.
- **B2 — Word-completion scores by text, not by blank.** `checkCompletionAnswer` compares the *sequence of selected option texts* (after a double reverse for RTL) against the correct-answer texts by position. Arabic function words repeat constantly (و، في، من، ما), so two identical blanked words let a swapped answer pass, and the `getFilledWord` reverse-mapping can misattribute which blank a tap fills. **Fix:** model each blank as a positioned slot with an id; validate per-slot against the word that belongs to *that* slot, independent of text equality and of RTL display order.
- **B3 — Lightning mistake off-by-one + contradictory hard mode.** `lightningMistakesLeft` starts at the limit and ends the round at `< 0`, so "3 mistakes" actually allows a 4th before ending; meanwhile a special-case `|| difficulty==='hard' && !isCorrect` ends hard mode on the first wrong regardless of the counter. Two rules disagreeing. *(Moot for Phase 6 — lightning is deferred — but recorded for when it returns: one rule, `mistakesLeft` reaches 0 → end.)*
- **B4 — Score persistence is manual.** Lightning saved only when the user tapped "save score" (`saveLightningScore`); closing the app mid/after a round lost it. **Fix:** persist each answer as it happens; no terminal save step.
- **B5 — Separate DB + iOS `pagehide` hack.** The `MurajahQuizDB` database and the `pagehide` handler that force-closed it ("iOS WebKit IDB contention when navigating to index.html") existed only because quiz was a **separate page**. In an SPA route sharing `murajah-userdata`, the whole failure mode disappears. **Fix:** use the app's existing DB/data client; delete the hack; add a nav-round-trip regression test (6.8).
- **B6 — Global font injection.** `loadFontForPage` / `preloadFontsForPages` append `<style>` tags with `!important` rules on `.quran-word`, leaking page-font state into the document. **Fix:** render through the app's font system (`getPage` font family + `fonts.ensure`), scoped to the component.
- **B7 — "O(count)" that's actually O(n).** `getRandomVerses` rebuilds a full eligible-index array (~6236 verses) every question despite the optimization claim. **Fix:** the page-scoped model keeps candidate pools tiny (verses on the pages in scope); no full-corpus scan exists to be slow.

---

## 6.0 — Data & question sourcing (page-chunk model)
> The one architectural decision the rest of the phase rests on. No new pipeline dataset: everything a question needs is already in the chunks the reader caches.

- [x] **6.0.1** `core/quiz/source.ts` — a thin sourcing layer over the data client. Given a **layout** and a **set of scope pages**, expose: `versesOnPage(page)` (assemble `{ "s:a": { arabic, surah, ayah } }` from `getPage(layout, page).words`, joining word `.text` per ayah — the same assembly `useVerseStudy` already does); `translationForVerse(surah, ayah, lang)` (from a cached `getTafsir(lang, surah)`); and `adjacentVerse(surah, ayah, dir)` → the next/previous verse **within the same surah**, resolving its page via `getNavIndex(layout).ayahToPage` and loading that chunk if it isn't the current one.
  - *Verify:* unit — assembles Fatiha verses in order from a page fixture; `adjacentVerse` crosses a page boundary correctly; returns `null` at surah start/end (continuation must not run past the surah).
  - **Done:** `createQuizSource(layout, data)` over a narrow `QuizDataAccess = Pick<DataClient, 'getPage' | 'getNavIndex' | 'getTafsir'>` (structural, so tests stub it). Per-page / per-surah-tafsir / nav caching. `adjacentVerse` uses nav-key **presence** as the surah-edge test — a hit is same-surah by construction (the key encodes the surah), so it can never bleed into the next surah (explicit test). 12 tests in `quiz-source.test.ts` incl. the page-boundary cross and both surah edges.
- [x] **6.0.2** Candidate + distractor pools. `buildCandidatePool(scopePages, layout)` → the flat list of `{ surah, ayah, page }` eligible for questions (all verses whose words fall on a scope page). Distractors are drawn **from the same pool** (other verses / other words on scope pages) — plausible near-neighbours, and no full-corpus scan (fixes **B7**). Falls back to widening beyond scope only if the pool is too small for N options.
  - *Verify:* unit — a 1-page scope yields only that page's verses; distractor selection never returns the correct answer or a duplicate; a tiny pool degrades option count gracefully (mirrors legacy `getContinuationOptionCount`, re-typed).
  - **Done:** `pool.ts` — `buildCandidatePool` (parallel page loads, a failed page is skipped not fatal, verses tagged `weak` by page), `wordBankFrom` (deduped distractor words across the pool), `completionCandidates` (verses with ≥2 words). 6 tests in `quiz-pool.test.ts`. The scope-widening fallback for undersized pools is deferred to the question factory (6.6), where distractor counts are known per mode.
- [x] **6.0.3** *Decision record — now verified, not assumed:* **runtime page-chunk assembly, not a build-time quiz dataset.** A full scan of the shipped data confirmed **every one of the 6236 verses sits wholly on a single page in both layouts** (QPC and Indopak) — page boundaries fall on verse boundaries — so a verse's full Arabic always assembles from one page chunk, no cross-page stitching. Candidate pages are few and reader-cached; continuation needs at most one adjacent page; translation is a surah-chunk the app loads anyway. A pre-baked `data/quiz/*` dataset would duplicate shipped content for no runtime win. **Fallback trigger:** if profiling on a low-end device shows the adjacent-page loads janking continuation, revisit with a per-surah verse-index dataset (`{ "s:a": { page } }`) — content stays in page chunks, only the ayah→page index is pre-baked.

## 6.1 — Quiz core logic (pure, typed `core/quiz/`)
> The only salvageable code from `quizHelpers.js` — re-typed to TS, unit-tested, and stripped of the dead data-shaping functions. Everything here is pure (no data client, no DOM), so it's fast to test exhaustively.

- [x] **6.1.1** `core/quiz/select.ts` — port + type the pure combinatorics: `shuffle<T>` (Fisher–Yates, returns a new array — not in-place, so it's referentially safe in Vue), `pickRandom<T>`, `sampleWithout<T>(pool, exclude, count)` (swap-to-end partial shuffle, the one genuine optimization worth keeping). Inject the RNG (`() => number`, default `Math.random`) so tests are deterministic.
  - *Verify:* unit — `shuffle` is a permutation (same multiset) and doesn't mutate input; `sampleWithout` excludes correctly, never duplicates, and returns `min(count, pool)` items; seeded RNG → deterministic output.
  - **Done:** `shuffle` copies then swaps (non-mutating, new array); `sampleWithout` takes an optional `keyOf` so callers exclude by verse ref / word text, not just identity. `Rng` type in `types.ts`; `Math.random` default. 11 tests in `quiz-select.test.ts`. The dead data-shaping helpers were **not** carried over.
- [ ] **6.1.2** `core/quiz/questions.ts` — pure question builders, each taking already-sourced verse data (from 6.0) + an RNG and returning a typed `Question`. `buildTranslationMatch(verse, distractors)`, `buildContinuation(verse, adjacent, distractors, dir)`, `buildWordCompletion(verse, wordBank)`. **No async, no retry, no recursion** (fixes **B1**) — ineligibility is decided by the caller having handed in a valid candidate.
  - **Word completion is rebuilt slot-based (fixes B2):** the builder returns blanks as `{ slotId, correctWord, position }[]` and a shuffled `wordBank`; scoring in 6.6 checks each slot against *its own* `correctWord` by `slotId`, never by text-sequence position. Duplicate words and RTL order become irrelevant.
  - *Verify:* unit — options always include exactly one correct + N distinct wrong; continuation options are the real adjacent verse + same-surah distractors; **word completion with a deliberately duplicated word (e.g. a verse containing و twice, both blanked) scores a correct fill correct and a swapped fill correct only if both words are genuinely identical** — the B2 regression test.
  - **Done:** `questions.ts` — three builders + `scoreChoice` / `scoreCompletion`, all pure and RNG-injected, no async or retry (B1 gone by construction). Completion emits `tokens` (natural order) + `answers` keyed by `slotId` + a `bank` with **one entry per blank, duplicates included** (so a doubly-blanked repeated word is fillable) and distractors excluded by text (no secretly-correct wrong option). `scoreCompletion` matches each slot to its own answer by id — never by text sequence — which is the B2 fix. 16 tests in `quiz-questions.test.ts`, incl. the duplicate-word (`و … و`) regression proving an identical-word swap passes while a real mismatch fails.
  - **Shared types** live in `core/quiz/types.ts` (`Verse`, `Target`, discriminated `Question` union, `Rng`).
- [x] **6.1.3** `core/quiz/target.ts` — the weak/strong interleave (decision 5), pure and RNG-injected. `pickTarget(pool, rng, { strongRatio = 0.25 })` takes candidates each tagged `weak: boolean` (the page's weakness computed upstream) and, per draw, chooses the weak or strong subset by `strongRatio`, then `pickRandom` within it. Degenerate scopes collapse cleanly: all-weak or all-strong always draws from the non-empty class. `STRONG_RATIO = 0.25` is the one tunable.
  - *Verify:* unit — over many seeded draws the strong share is ≈ 25% (within tolerance); an all-weak pool never yields strong and vice-versa; a mixed pool never starves either class to zero given enough draws.
  - **Done:** `pickTarget` treats the ratio as a *preference*, not a quota — the preferred class falls back to the other when empty, so a degenerate scope still yields questions. 6 tests in `quiz-target.test.ts` incl. the ~25% distribution over 4000 seeded draws and a `strongRatio: 0` boundary. **587 unit green, vue-tsc clean.**

## 6.2 — Quiz store & persistence
- [x] **6.2.1** `stores/quiz.ts` (Pinia) — the durable per-page accuracy tally. Shipped as a **bounded rolling window**: `Map<page, (0|1)[]>` capped at `QUIZ_WINDOW = 10`; accuracy = mean of the window, `null` until first quizzed. `accuracyByPage` exposes `page → 0..1` for the scorer.
  - **Done (the cap/decay decision):** the window gives both properties from one rule — **cap** (oldest outcomes evict past 10) and **decay** (a once-aced page that starts failing recovers a weak signal within a few quizzes, instead of a lifetime ratio burying it). Chosen over an EMA for transparency/testability. 7 tests in `quiz-store.test.ts` incl. explicit cap + decay cases. (Live question/session state deferred to the view — it isn't durable and doesn't belong here.)
- [x] **6.2.2** Persist under a **new `quiz` key in the existing `murajah-userdata` DB** (not a separate database — that was **B5**). `serializeQuizAccuracy` / `deserialize` rebuild plain objects (the Phase-4/5 proxy-safe gotcha). `useQuizPersistence` composable mirrors the Phase-5 pattern: debounced deep-watch save + `hydrate()` + `dispose()`.
  - *Verify:* unit — round-trips the accuracy map; e2e — an answered question survives reload.
  - **Done:** `StoredQuizAccuracy = Record<string, number[]>`, load/save on the shared DB, `useQuizPersistence` (300ms debounced snapshot save). 4 storage tests. The e2e survive-reload check lands with the quiz UI (6.6).

## 6.3 — Weakness integration (the reserved hook)
- [x] **6.3.1** Feed per-page quiz accuracy into `generateDailyTasks`. Replace the stubbed `quizScores: input.quizScores ?? new Map()` path so `useToday` passes `quiz.accuracyByPage` through `planBuilder` → `calculateAllWeaknesses`. Verse-level answers roll up to pages via the verse's `page` (already known from sourcing).
  - *Verify:* unit — a page with low quiz accuracy scores measurably weaker (crosses `WEAK_THRESHOLD` given otherwise-neutral inputs); a page with no quiz data stays neutral (scorer's `quizAccuracy ?? null` → 0.5, unchanged from today).
  - *Verify:* e2e — failing a page's quiz repeatedly makes it appear in Today's "Needs reinforcement" lane (end-to-end proof the loop closes). **Guard against inflating recall:** confirm the page's SM-2 `nextReviewDate` is **unchanged** by the quiz (decision 3).
  - **Done (unit half):** `useToday` now passes `quiz.accuracyByPage`; TodayView hydrates/disposes `useQuizPersistence` so accuracy is loaded before scoring. 3 tests in `quiz-weakness.test.ts` prove the Map plumbing moves the score both ways (failing → weaker, acing → stronger) and doesn't cross-contaminate un-quizzed pages. Existing Today e2e (25) stays green — an empty quiz store is a no-op. **The e2e half (fail-a-quiz → reinforcement lane, and SM-2 `nextReviewDate` untouched) needs the quiz UI to drive answers — deferred to 6.6.**

## 6.4 — Quiz route & shell
- [ ] **6.4.1** Lazy route `/quiz` (named `quiz`) → `features/quiz/QuizView.vue`, code-split like `/today`. Replace the Quiz **coming-soon toast** in `ReaderView.vue` (`{ value: 'quiz', ... }`) with real navigation; update the `reader-chrome.spec.ts` case that currently uses "Quiz" as its not-yet-built example (as Phase 5.4.1 did when "Goals" became "Today").
  - *Verify:* e2e — the reader's Quiz tab opens `/quiz`; deep-linking `/quiz` renders.
- [ ] **6.4.2** Scope selector — the plan-scoped-with-override control. Default source = **today's plan** (`plan.scopePages`); alternatives = **pick surah(s)** and **pick juz** (resolve to pages via `getNavIndex`), plus **whole mushaf**. Persisted in the quiz store. When there's no plan, default to a surah pick with a gentle prompt (not an error).
  - *Verify:* e2e — default drills plan pages; picking a surah re-scopes; selection persists across reload.

## 6.5 — Question UIs (SFCs on the design system)
- [ ] **6.5.1** `TranslationMatchCard.vue` — Arabic verse (page font via the app pipeline, **not** injected styles — fixes **B6**) + 4 translation options. Tokenised, RTL-correct, keyboard-operable, `aria` on options.
- [ ] **6.5.2** `ContinuationCard.vue` — displayed verse + a "next/previous" badge + verse options. Same font/RTL/a11y rules.
- [ ] **6.5.3** `WordCompletionCard.vue` — the verse with slot-shaped blanks + a word bank; tapping a bank word fills the **focused** slot (explicit slot focus, not implicit RTL fill order — the readable half of the **B2** fix). Filled slots are editable before submit.
  - *Verify (all three):* e2e — render, answer correct → marked correct; answer wrong → correct answer revealed; per-theme axe clean (light/dark/sepia) with the transition-`settle()` helper from Phase 5.8; RTL layout correct.

## 6.6 — Answer, scoring & session flow
- [ ] **6.6.1** One answer path per mode → updates session streak/score, writes the per-page tally (6.2), and **persists immediately** (no manual save — fixes **B4**). Auto-advance after a short reveal with tap-to-skip (port the legacy `scheduleAutoNext`/`skipToNext`/`clearAutoNext` timer trio — it was one of the few clean bits — as a small composable, cleared on unmount and on scope change).
  - *Verify:* unit — the auto-next composable fires once, is cancellable, and cleans its timer; e2e — correct/wrong updates the streak and the ring/score; skip advances instantly.
- [ ] **6.6.2** Empty/degenerate states (fixes **B1** at the UI): a scope whose pool is too small for a mode shows a clear "not enough verses in this selection for continuation — pick more pages" rather than spinning or recursing.
  - *Verify:* e2e — a 1-verse surah selection surfaces the empty-state for continuation, and still works for translation/word-completion if those are viable.

## 6.7 — Legacy data
- [ ] **6.7.1** *Decision record (no migration task):* legacy `MurajahQuizDB` scores are **not** imported. They're an isolated per-question history with no page mapping and never influenced anything; the new store is a per-page accuracy signal built from fresh answers. Importing would fabricate a weakness signal from data the user can't see or reconcile. Documented in the store module, mirroring the Phase-5 "don't import legacy streak counters" call.

## 6.8 — Quality gate
- [ ] **6.8.1** perf/size — new `.size-limit.json` entry for the **quiz route** (its own chunk); confirm the **reader** and **today** budgets are unchanged (0 KB leak — the roadmap's acceptance). Quiz core (`core/quiz/*`) is small pure TS.
- [ ] **6.8.2** a11y — axe (wcag2a/2aa, no serious/critical) on all three question cards + the scope selector, across light/dark/sepia, using the `settle()` transition guard.
- [ ] **6.8.3** iOS-nav regression (**B5**) — an e2e that round-trips quiz → reader → today → quiz, answers a question on each visit, and asserts writes persist and IndexedDB never wedges. This is the "iOS navigation issues do not recur" acceptance, proven by construction (shared DB, no page unload) rather than by the deleted hack.
- [ ] **6.8.4** full suite green — unit + e2e, `vue-tsc` clean, `npm run build` clean.

---

## Deferred / soft-linked (not blocking Phase 6)
- **Lightning round** — timed mixed-mode with difficulty tiers. Deferred; rebuild (not port) when it returns, with the single-rule mistake logic and per-answer persistence (**B3**, **B4**).
- **Record-a-page** habit (`quick-test` wired here; the audio-backed "record" variant lands in **Phase 7**).
- **Quiz history / stats view** — the legacy scores store had a history UI; a new per-page accuracy view could live under Progress (Phase 4 surface) later.

## Exit checklist
- [ ] `/quiz` lazy + code-split; 0 KB added to reader/today bundles.
- [ ] Three modes (translation match · continuation · word completion) working over plan-scoped pages, with a surah/juz override.
- [ ] Word completion scored **slot-based**, proven correct on a duplicated-word verse (B2 regression).
- [ ] Question targets interleave ~25% strong pages (decision 5); tunable via `STRONG_RATIO`.
- [ ] No question generator can recurse or spin on an empty/degenerate scope (B1); clear empty-states instead.
- [ ] Every answer persists immediately to the shared DB (B4/B5); no separate quiz database, no `pagehide` hack.
- [ ] Per-page quiz accuracy feeds weakness scoring; weak-quiz pages reach Today's reinforcement lane; SM-2 schedule untouched by quizzes.
- [ ] Arabic via the app font pipeline (no injected `<style>`); RTL correct; a11y clean (3 themes).
- [ ] iOS nav round-trip regression green; unit + e2e green; type-check + build clean.
