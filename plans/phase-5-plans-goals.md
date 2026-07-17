# Phase 5 — Plan & Daily Practice (granular tasks)

**Parent:** [redesign-2026.md](./redesign-2026.md) §5 (Phase 5) · **Prereqs:** Phase 4 (progress store: `memorized`, `strength`, `hasanah`, `reviewData`; weakness scoring; reward engine) complete. **Goal:** one **unified daily-practice experience** that lets a user *maintain* their hifz (revise memorized pages efficiently) and *grow* it (manage new memorization) from a single adaptive plan — replacing the legacy split between "Plans" and "Daily Goals".

## Why this is a redesign, not a straight port

The legacy app shipped **two overlapping "what do I do today?" systems**:

- **Daily Goals** (`dailyGoalsManager.js`) — a fixed checklist (recite ayahs · quick test · review-range · memorize-daily) where the revision set was a **blind chunk rotation** over all memorized pages (`finishRevisionDays` chunks, one per day, wrap around). Predictable but dumb — never prioritised weak or recently-missed pages.
- **Plans** (`planManager.js` + `planScheduler.js`) — an **SM-2 spaced-repetition** scheduler with beginner/hafiz/mixed modes, per-juz mode maps, milestones, multi-plan support, and missed-day handling. Powerful, but heavy config, and it **generated tasks that flowed *into* the Daily-Goals list** (`planTasksToDailyGoals` → `mergePlanTasks`) — the two were bolted together, not unified.

They also each kept **their own per-page review data** — separate from the Phase-4 `progress.reviewData` that already feeds weakness scoring. Three copies of "when did you last review page N."

**The decisions taken for this phase (product-owner confirmed):**

1. **One unified adaptive plan.** A single, editable plan = **scope** (which pages you maintain) + **pace** (daily budgets, off days) + an optional **memorization front** (where you're adding new pages). The legacy `beginner / hafiz / mixed` taxonomy collapses into "*scope + are you adding new pages?*": a hafiz is scope = all-memorized, no new front; a beginner is a small scope with an active new front; "mixed" falls out for free. No multi-plan, no `juzModes` maps.
2. **Smart adaptive scheduling (SM-2 + weakness).** Each page carries **one** review schedule (interval grows when clean, resets on mistakes); today's revision queue = pages **due within scope**, ranked by overdue-ness + weakness, capped at the daily budget, filled with never-reviewed pages. Weak/mistake-heavy pages resurface faster. This is the proven `planScheduler` math, retained and unit-tested.
3. **Review scheduling is a per-page global fact, not per-plan.** The Phase-4 `progress.reviewData` record is **enriched** to carry the SM-2 fields and becomes the *one* scheduling source — read by the scheduler and by weakness scoring. Kills the three-copies problem; a page can never sit in two conflicting schedules.
4. **The reward loop is the completion loop.** Finishing a revision task routes through the existing `progress.recordReview` / `recordPerfectRevision` / `penalizeMistake` path — so hasanah, memorization strength, weakness scoring, streaks, and the SM-2 schedule all update from a single action. No separate plan accounting.

**Definition of done:** a user with memorized pages gets a **Today** screen showing their streak, the day's new-memorization page, a due-today revision queue, and weak-page reinforcement — each actionable (open in reader, mark clean, mark mistake) and each feeding the reward + schedule + streak in one write. A plan is set up (or smart-defaulted from existing data) and editable. Streaks reset at local midnight and survive reload. Legacy plan + daily-goals data migrates without losing memorized pages, review history, or streak. §3-style perf/size budgets + a11y (3 themes) hold.

> Local-first: IndexedDB is the source of truth; every write debounce-persisted; **no backend**. Must never regress Phase-4 progress/reward or the reader's mistake data.

---

## 5.0 — Unified review-schedule model & storage
> Phase 4 shipped `PageReview { lastReviewDate, reviewCount }` under the `progress` record. This grows it into the single SM-2-capable scheduling record, with zero data loss for existing Phase-4 / legacy users.

- [x] **5.0.1** Enrich `PageReview` → **`ReviewSchedule`** in `core/storage/userData.ts`: keep `lastReviewDate`, `reviewCount`; add `interval: number` (days), `easeFactor: number`, `nextReviewDate: string`, `consecutiveCorrect: number`. Serialize as **plain objects** (proxy-safe, per the Phase-4 gotcha). Deserialize with **back-compat defaults** when the SM-2 fields are absent (Phase-4 data / legacy backups): `interval = 1`, `easeFactor = 2.5`, `consecutiveCorrect = 0`, `nextReviewDate = lastReviewDate ?? today`.
  - *Verify:* round-trip (fake-indexeddb); a stored record with only `{lastReviewDate, reviewCount}` hydrates with sane SM-2 defaults; proxy-safe save round-trip asserted.
  - **Done:** `ReviewSchedule` interface + exported `normalizeSchedule` (fills SM-2 defaults, **preserves** existing schedule so a reading mark never resets it). `serializeProgress` writes all six fields as plain objects; `deserializeProgress` normalizes each record. Store `markReviewed` builds full records via `normalizeSchedule`. Tests: updated round-trip + persist assertions to the six-field shape, added a legacy-recency-only hydration test. Full suite **433 green**, type-check clean.
- [x] **5.0.2** Progress store: add **`recordReview(page, performance)`** that runs the SM-2 step (5.1.1) against the page's `ReviewSchedule`, updates `lastReviewDate`/`reviewCount`/`nextReviewDate`/`interval`/`easeFactor`/`consecutiveCorrect`, and (for a clean review) awards hasanah + bumps strength — i.e. the reward path and the schedule update in one action. `recordPerfectRevision` becomes `recordReview(page, 'perfect')`. Keep it **one record per page**.
  - *Verify:* clean review → strength +1, hasanah += `pageHasanah`, `nextReviewDate` advances, `consecutiveCorrect`++; a `needs_work` review resets interval to 1 and `consecutiveCorrect` to 0 without touching hasanah; existing Phase-4 progress tests stay green.
  - **Done:** Extracted the pure SM-2 per-page step into a new typed module `core/memorization/reviewScheduler.ts` (`calculateNextReview` retargeted to `ReviewSchedule` — the legacy `userType` string collapses into a `maxInterval` option; `mapToPerformance`; `ratingToPerformance` for the `'perfect' | 'good' | 'needs_work'` completion vocabulary; SM-2 constants) rather than disturbing the still-coupled legacy `planScheduler.js` ↔ `planManager.js` (both keep their green `.js` suites until the 5.1 port). Store `recordReview(page, rating='perfect')` calls it, advances the record, bumps `reviewCount`, and — on a pass (perf ≥ `PASSING_THRESHOLD`) — awards hasanah + strength; `needs_work` resets interval/streak, no reward (strength penalties stay in `penalizeMistake`). `recordPerfectRevision` is now a thin alias. Tests: new `reviewScheduler.test.ts` (SM-2 intervals/ease caps, `mapToPerformance`, `ratingToPerformance`) + three `recordReview` store tests. Full suite **448 green**, type-check clean.
  - **Structure note for 5.1.1:** `calculateNextReview` / `mapToPerformance` now live in `reviewScheduler.ts`; the 5.1.1 `planScheduler.ts` becomes just the **day's task generator** (`generateDailyTasks` single path + `handleMissedDays` + `initializeReviewSchedule`) and **imports** the SM-2 step from `reviewScheduler.ts` instead of re-defining it.
- [ ] **5.0.3** Storage keys for the new state (same `murajah-userdata` DB, **no version bump** — keyed `data` store): `plan` (the single plan config, 5.2) and `dayLog` (date → completion record, for streaks/history, 5.3). Serialize/deserialize + best-effort load/save mirroring `loadProgress`/`saveProgress`.
  - *Verify:* plan + dayLog save → reload → restored; absent keys hydrate to empty/default; no interference with `progress`/`mistakes` keys.

## 5.1 — Domain logic → TypeScript (port + slim to the unified model)
> `git mv` each `.js` to preserve history; keep the existing unit tests as the parity net where behaviour is preserved; **adapt/replace** tests where the model deliberately changes (multi-plan, modes, rotation removed). Tests live outside `src/**` so aren't type-checked by vue-tsc.

- [ ] **5.1.1** `planScheduler.js` → `planScheduler.ts`. **Keep** the SM-2 core: `calculateNextReview`, `mapToPerformance`, `handleMissedDays`, `initializeReviewSchedule` (was `initializePageReviewData`), and the exported constants. **Retarget** it to read/write the unified `ReviewSchedule` (5.0.1) instead of a plan-owned `pageReviewData` map. **Collapse** `generateDailyTasks` to a single adaptive path (no beginner/hafiz/mixed branches): inputs = `{ scopePages, memorizedPages, reviewData, mistakes, strength, pace, today }`; output = `{ newMemorization, revision, weakReinforcement, metadata }`.
  - *Verify:* port the SM-2 unit tests (`calculateNextReview` intervals/ease caps, `mapToPerformance`, `handleMissedDays` light/medium/heavy/reset) — unchanged. New tests for the single-path `generateDailyTasks`: due pages within scope selected, budget respected, off-day skips new memorization only, never-reviewed fill.
- [ ] **5.1.2** `dailyGoalsManager.js` → `dailyGoalsManager.ts`. **Keep** the streak + completion helpers: `calculateStreak` (complete-day history, longest-streak, midnight anchor), `isNewDay`, `getTodayDate`, `checkAllTasksComplete`, `getTaskCounts`, `getCompletionPercentage`. **Drop** `calculateReviewRange` (blind rotation — superseded by the smart queue) and the plan-merge glue (`mergePlanTasks`, `planTasksToDailyGoals` in 5.1.3). **Keep** optional standing-habit task definitions (recite ayahs, quick test) as a small typed catalog.
  - *Verify:* the `calculateStreak` tests (consecutive days, reset on gap, longest) port unchanged; removed-function tests deleted with a note; habit catalog typed.
- [ ] **5.1.3** `planManager.js` → `planManager.ts`, **slimmed** to the unified model. **Keep** `getPagesForJuz` / `getJuzForPages` (retarget to the derived QPC nav index, not the legacy off-by-one tables — see [legacy-hardcoded-tables.md](./legacy-hardcoded-tables.md)), `generateSmartPlan` (defaults a plan from existing memorized/strength/mistakes data), `advanceMemorizationPage`, `syncExternalMemorization`. **Drop** multi-plan CRUD (`loadActivePlans`, status transitions), `juzModes`/mixed logic, and the plan→daily-goals bridge. Milestones: **defer** (optional stretch, 5.5.x) — not required for done.
  - *Verify:* `generateSmartPlan` on a memorized fixture returns a sane scope + pace + memorization front; `getJuzForPages` matches the derived nav index (not the legacy tables); `advanceMemorizationPage` skips already-memorized pages.

## 5.2 — Plan store & persistence
- [ ] **5.2.1** `stores/plan.ts` (Pinia): the single plan config — `scope` (`{ kind: 'all-memorized' } | { kind: 'juz', juz: number[] }`), `newFront` (`null | { layout, nextPage }`), `pace` (`{ newPagesPerDay, revisionPagesPerDay, weakPagesPerDay, daysPerWeek, offDays }`), `habits` (enabled standing-habit ids), `startDate`, `createdAt`. Actions: `create(config)`, `update(partial)`, `clear()`, plus derived `scopePages` (computed from scope + `progress.memorized` + nav index).
  - *Verify:* unit tests for create/update/clear and `scopePages` derivation (juz scope → correct page set; all-memorized → the memorized set).
- [ ] **5.2.2** `composables/usePlanPersistence.ts` — hydrate/persist the plan store to the `plan` key (debounced watch → save; `hydrate()` loads), mirroring `useProgressPersistence` / `useMistakesPersistence`.
  - *Verify:* create plan → debounce → reload → restored (fake-indexeddb); best-effort (storage errors swallowed).

## 5.3 — Today engine (the merged practice loop)
- [ ] **5.3.1** `composables/useToday.ts` — the reactive view-model. Derives today's task set by feeding `progress` + `plan` + `mistakes` into `generateDailyTasks` (5.1.1). Exposes `newMemorization`, `revision` (due queue), `weakReinforcement`, optional `habits`, and per-task `complete(perf)` / `uncomplete()` that route through `progress.recordReview` / `penalizeMistake` (5.0.2) and update the **day log** (5.0.3). Off-day / no-plan / all-done states handled.
  - *Verify:* component/unit tests: completing a revision task records the review (schedule + reward advance) and marks it done; marking a mistake decrements strength and re-queues the page sooner; off-day hides new memorization; empty scope → graceful empty state.
- [ ] **5.3.2** `composables/useStreak.ts` (or fold into `useToday`) — current/longest streak from the day log via `calculateStreak` (5.1.2), with **local-midnight** rollover (a new day resets today's tasks; a fully-completed day extends the streak; a gap breaks it).
  - *Verify:* fake-clock tests: complete-today extends streak; skip a day breaks it at reload; longest-streak retained; rollover at midnight generates a fresh day.

## 5.4 — Today view (flagship surface)
- [ ] **5.4.1** `features/today/TodayView.vue` + route `/today` + **tab-bar entry** (Home/Today as the primary landing per the merged UX). Streak header (current streak + a subtle flame/ring), a completion progress ring, then task sections in priority order: **New memorization** (the page + "Open in reader"), **Revision** (due-today queue; each page openable, with **Mark clean** / **Mark mistake**), **Weak reinforcement**, and optional **Habits** (recite N ayahs — manual check; quick test — soft-links to Quiz, Phase 6). Reuse `BottomSheet`, `Toggle`, `Icon`. Token-driven; colour never the only cue.
  - *Verify:* e2e — with seeded memorized pages + a plan, Today renders the queue; completing a revision updates the ring and persists across reload; "Open in reader" deep-links `/read/qpc/N`; off-day and no-plan states render.
- [ ] **5.4.2** Empty/first-run: when no plan exists, Today shows a concise "Set up your practice" call-to-action → 5.5 setup (or one-tap **smart plan** from existing data).
  - *Verify:* e2e — fresh state shows the CTA; smart-plan one-tap creates a plan and Today populates.

## 5.5 — Plan setup (guided, lightweight)
- [ ] **5.5.1** `features/today/PlanSetup.vue` (sheet or route) replacing the legacy 24KB wizard. Steps kept minimal: **scope** (all memorized · pick juz), **add new?** (toggle → starting page + layout), **pace** (new/day, revise/day, off days), and a **Smart defaults** button (`generateSmartPlan`, 5.1.3) that pre-fills everything from the user's existing data. Editable after creation via the same surface.
  - *Verify:* e2e — set scope + pace → create → Today reflects it; Smart defaults pre-fills sane values; editing pace re-generates the queue.
- [ ] **5.5.2** *(stretch, optional)* Milestones (juz-complete / cycle-complete) + toast on completion — deferred from 5.1.3; not required for done.

## 5.6 — Streaks & history
- [ ] **5.6.1** A compact **completion calendar / timeline** (last ~90 days from the day log): per-day completion state, current + longest streak. Reachable from Today. Token-driven, a11y-labelled (state not by colour alone).
  - *Verify:* e2e — a seeded day-log renders the calendar with correct completed/missed days and streak counts.

## 5.7 — Migration parity
> Roadmap acceptance: "a plan created in legacy loads/advances in the new app." Because the model is deliberately unified, this is **data-preservation parity**, not byte-identical task generation.

- [ ] **5.7.1** `core/memorization/planMigration.ts` — from a committed legacy export fixture (plan(s) + dailyGoals history), migrate into the unified model: legacy plan `schedulerState.pageReviewData` → per-page `ReviewSchedule` (merged into `progress.reviewData`, most-recent wins); legacy plan scope/pace → the single plan config (dominant active plan wins if several); dailyGoals history → the day log (for streak continuity).
  - *Verify:* unit — memorized set, review history (interval/ease/nextReview), and streak survive the import; no page ends up double-scheduled.
- [ ] **5.7.2** e2e — seed a migrated IndexedDB (plan + review data + day log), load `/today`: streak shows, the due queue is sane on day one, and completing a task persists.
  - *Verify:* Playwright — seeded records via `page.evaluate` (opening `murajah-userdata`), reload, assertions on streak + queue + persistence.

## 5.8 — Quality gate
- [ ] **5.8.1** a11y — axe (wcag2a/2aa, no serious/critical) on **TodayView** and **PlanSetup** across light/dark/sepia.
- [ ] **5.8.2** perf/size — size-limit within the 120 KB JS / 30 KB CSS budgets (the `/today` route is code-split; scheduler/streak logic is small pure TS).
- [ ] **5.8.3** full suite green — unit + e2e, `vue-tsc` clean, `npm run build` clean.

---

## Deferred / soft-linked (not blocking Phase 5)
- **Quick test** habit task → wires to **Quiz** (Phase 6); soft-link/stub until then.
- **Record a page** habit → wires to **Audio** (Phase 7); omit or manual-check for now.
- **Milestones + toasts** (5.5.2) — optional stretch.

## Exit checklist
- [ ] One editable plan (scope + pace + new front); smart-defaultable from existing data.
- [ ] Today screen: streak + new-memorization + due revision queue + weak reinforcement, each actionable and feeding reward + schedule + streak in **one** write.
- [ ] Review scheduling is a single per-page `ReviewSchedule`, shared by scheduler + weakness scoring (no duplicate stores).
- [ ] Streaks reset at local midnight; survive reload; covered by tests.
- [ ] Legacy plan + daily-goals data migrates without losing memorized pages, review history, or streak.
- [ ] a11y clean (3 themes) · size within budget · unit + e2e green · type-check + build clean.
