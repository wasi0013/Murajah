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
- [ ] Task 5: `DayRecord.newMemorizationTouched` field
- [ ] Task 6: `dayLog` store touched-setter + `hasWork()` fix
- [ ] Task 7: `useToday.ts` wiring — **highest-risk task, has a named regression test**

## Checkpoint: Phase 2
- [ ] `npm run test:unit` green (including Task 7's idempotency regression test)
- [ ] `npm run build` clean

## Phase 3: Marking UI
- [ ] Task 8: marking view shell (route + `MarkPageView.vue`)
- [ ] Task 9: tap gesture + word-states wiring

## Checkpoint: Phase 3
- [ ] `npm run build` clean
- [ ] Manual: mark → reload → resume → complete walkthrough

## Phase 4: Today card integration
- [ ] Task 10: line-fill visual on the newMemorization row

## Checkpoint: Phase 4
- [ ] `npm run build` clean
- [ ] Manual: Today reflects live progress

## Phase 5: Journal integration
- [ ] Task 11: `'verses-memorized'` journal event type
- [ ] Task 12: fire the event from the marking flow
- [ ] Task 13: Journal UI rendering + i18n (en/ar/bn)

## Checkpoint: Complete
- [ ] `npm run test` (unit + e2e) green end-to-end
- [ ] `npm run build` clean
- [ ] Manual two-day walkthrough (see `tasks/plan.md`'s final checkpoint for the exact script)

## Outside this plan (flagged, not actioned without confirmation)
- [ ] Confirm or revert: `tasks/plan.md` (old, completed `/preview` plan) was staged as a git rename to `plans/preview-shareable-viewer.md`, not committed
