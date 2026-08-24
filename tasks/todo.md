# Todo: Partial-Page Memorization Tracking

See `tasks/plan.md` for full task detail, acceptance criteria, and dependencies. `plans/partial-page-tracking.md` is the design doc behind it.

## Phase 1: Data layer & pure logic
- [x] Task 1: `partialProgress` storage key (`core/storage/userData.ts`)
- [x] Task 2: `partialProgress` Pinia store (`stores/partialProgress.ts`)
- [x] Task 3: persistence composable (`composables/usePartialProgressPersistence.ts`)
- [x] Task 4: pure coverage/derivation helpers (`core/memorization/partialProgress.ts`)

## Checkpoint: Phase 1
- [x] `npm run test:unit` green
- [x] `npm run build` clean

## Phase 2: Wire into Today's completion, streak, and history
- [x] Task 5: `DayRecord.newMemorizationTouched` field
- [x] Task 6: `dayLog` store touched-setter + `hasWork()` fix
- [x] Task 7: `useToday.ts` wiring — **highest-risk task, has a named regression test**

## Checkpoint: Phase 2
- [x] `npm run test:unit` green (including Task 7's idempotency regression test)
- [x] `npm run build` clean

## Phase 3: Marking UI
- [x] Task 8: marking view shell (route + `MarkPageView.vue`) — landed combined with Task 9
- [x] Task 9: tap gesture + word-states wiring

## Checkpoint: Phase 3
- [x] `npm run build` clean
- [x] Verified via `mark-page-view.test.ts` (mounted-component test) instead of interactive manual — see tasks/plan.md Task 8/9 notes on this deviation

## Phase 4: Today card integration
- [x] Task 10: line-fill visual on the newMemorization row

## Checkpoint: Phase 4
- [x] `npm run build` clean
- [x] Today reflects live progress (verified via source + build, no component test — see tasks/plan.md)

## Phase 5: Journal integration
- [x] Task 11: `'verses-memorized'` journal event type
- [x] Task 12: fire the event from the marking flow
- [x] Task 13: Journal UI rendering + i18n (en/ar/bn)

## Checkpoint: Complete
- [x] `npm run test` (unit + e2e) green end-to-end — 1193 unit + 235 e2e, zero regressions
- [x] `npm run build` clean
- [x] Two-day-walkthrough behavior verified via tests, not a live interactive pass — see `tasks/plan.md`'s final checkpoint for exactly what is and isn't covered, and the flagged gap (no e2e spec through the real `MarkPageView.vue` UI across a simulated date change)

## Follow-up: e2e walkthrough (closes the gap above)
- [x] `tests/e2e/mark-page.spec.ts` — marks verses through the real `MarkPageView.vue` UI, navigates Today ↔ Mark ↔ Journal, advances the clock a day, reopens `/memorize` fresh and confirms prior marks hydrate from disk, finishes the page, and checks graduation + streak + journal across both days
- [x] `MarkPageView.vue` was missing its own hydrate/dispose lifecycle (a deep link, reload, or back/forward to `/memorize` saw a stale/empty plan) — fixed, mirroring `TodayView.vue`/`ProgressView.vue`
- [x] Found and fixed a real, pre-existing bug this surfaced: `useDayLogPersistence`/`useProgressPersistence`/`usePartialProgressPersistence`'s debounced-save watcher was silently killed by Vue when the first view to call `hydrate()` unmounted, permanently blocking any later view's writes for the rest of the session — fixed with a detached `effectScope`, regression-tested by mounting real components (see the commit for full rationale)
- [x] `TaskRow`'s front-page open button aria-label ("Open page {page} in the reader") was inaccurate now that it routes to `/memorize` — added an `openLabel` override, i18n'd in all three catalogs
- [x] `npm run test` green (1193 unit + 235 e2e), `npm run build` clean

## Follow-up: code review (agent-skills:code-reviewer) — REQUEST CHANGES, then fixed
Reviewed the full feature diff (`19a127da..HEAD`, 24 commits). Two critical findings, one important, both accepted and fixed; a few suggestions accepted, a couple deferred.
- [x] **Critical** — `TodayView.vue` never hydrated `usePartialProgressStore`, so the line-fill row was silently dark on a cold `/today` load (the ordinary case) despite real progress on disk; the existing e2e walkthrough couldn't catch it since it always visits `/memorize` first in-session. Fixed + a dedicated cold-load e2e test.
- [x] **Critical** — a tap in `MarkPageView.vue` landing before all four `hydrate()` calls resolve could be silently clobbered by the later `setAll()` (a real window: `TodayView`'s own front-page pre-fetch can leave the page chunk warm well before `partialProgress`'s own IndexedDB read resolves). Fixed with a `storesReady` gate, regression-tested via a controllable pending mock.
- [x] **Important** — a rapid same-task double-tap landing across a page-graduation boundary could mark the new page number against the old page's stale words (`pageNum` advances synchronously, `chunk` reloads asynchronously). Fixed with a `chunk.value.page !== page` guard, regression-tested via synchronous raw-DOM-event dispatch (bypassing `trigger()`'s implicit yield).
- [x] **Important** — the sticky `newMemorizationTouched` flag (never reverts to un-touched) was undocumented and untested at that specific boundary. Confirmed intentional (matches the app's no-un-check philosophy + the design doc's forward-progress rule), documented, regression-tested.
- [x] Suggestion — the line-fill `role="progressbar"` had no accessible name; added `aria-labelledby`.
- [ ] Suggestion (deferred, low value) — `TodayView`'s `useMarkPage(frontPage)` fetches the front page's chunk unconditionally even when it isn't in today's queue (e.g. `newPagesPerDay: 0`); a minor wasted-fetch inefficiency, not correctness.
- [ ] Suggestion (deferred, cross-cutting) — `useMarkPage.ts`/`usePreviewPage.ts` share a pre-existing lack of an out-of-order-resolution guard (no request token/AbortController) if `page` changes faster than a fetch resolves; this feature's auto-advancing front page makes it somewhat more likely to matter, but it's a shared follow-up across both composables, not scoped to this diff.
- All fixes verified RED-without/GREEN-with via temporarily reverting each guard. Final state: 1196 unit + 236 e2e, `npm run build` clean.

## Outside this plan (resolved)
- [x] `tasks/plan.md` (old, completed `/preview` plan) was moved to `plans/preview-shareable-viewer.md` and committed with the user's "commit the plan" approval — done, not reverted
