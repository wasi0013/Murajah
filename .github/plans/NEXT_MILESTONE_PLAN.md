# Next Milestone Plan — Stability, Audio, & Pre-Release Hardening

> **Generated:** 2026-04-11
> **Skills Applied:** Retro (branch analysis), QA (health score), Review (diff audit), CEO (direction), Eng (execution plan)
> **Branch:** `dev` (21 files changed, +7544/-4 vs master)
> **Baseline:** 811 unit tests passing, 0 E2E tests for plan feature
> **Prior Plans Resolved:** GUIDED_PLAN_DESIGN.md (✅ removed), NEXT_ITERATION_PLAN.md (✅ merged here), PERFORMANCE_ISSUES_PHASE2.md (6/7 ✅, 1 carried)

---

## Table of Contents

1. [Retro & Current State](#1-retro--current-state)
2. [QA Health Score](#2-qa-health-score)
3. [CEO Direction: What Matters Now](#3-ceo-direction-what-matters-now)
4. [Priority Matrix](#4-priority-matrix)
5. [Milestone 1: Critical Bug Fixes (P0)](#5-milestone-1-critical-bug-fixes-p0)
6. [Milestone 2: Audio Hardening (P1)](#6-milestone-2-audio-hardening-p1)
7. [Milestone 3: PWA Stability (P1)](#7-milestone-3-pwa-stability-p1)
8. [Milestone 4: Store Reliability (P2)](#8-milestone-4-store-reliability-p2)
9. [Milestone 5: Plan Feature Polish (P2)](#9-milestone-5-plan-feature-polish-p2)
10. [Milestone 6: Performance Sprint (P3)](#10-milestone-6-performance-sprint-p3)
11. [E2E Test Coverage Gaps](#11-e2e-test-coverage-gaps)
12. [NOT in Scope](#12-not-in-scope)
13. [What Already Exists & Was Completed](#13-what-already-exists--was-completed)
14. [Risk Assessment](#14-risk-assessment)

---

## 1. Retro & Current State

### 1.1 Branch Summary (dev vs master)

```
Commits on dev:     3 (phase 1, phase 4, audio player added)
Files changed:      21
Lines added:        7,544
Lines removed:      4
New source files:   8 (plan system + audio card)
New test files:     3 (planManager, planScheduler, weaknessScorer)
```

### 1.2 What Shipped on `dev`

| Feature | Files | Lines | Test Coverage |
|---------|-------|-------|---------------|
| Guided Plan System (Phases 1-3) | 7 source + 3 test | ~4,000 | 811 unit tests |
| PlanAudioCard (playlist tabs) | 1 component | 416 | manual only |
| Smart Plan auto-generation | planManager.js | ~150 | unit tests |
| Mixed mode (beginner+hafiz) | planScheduler.js | ~200 | unit tests |
| Memorization threshold (≥40) | planScheduler.js | ~50 | unit tests |
| User page selection + auto-advance | plan.html + planManager | ~100 | manual only |
| MurajahDB v6 (plans + planHistory) | index.html | ~50 | unit tests |

### 1.3 Ship of the Week

```
🏆 Ship of the Week: Guided Plan System
   Author: wasi
   Commits: 3
   Files: 21
   Why: Complete adaptive memorization scheduling with SM-2,
        3 plan modes, calendar, progress tracking, audio integration.
        From zero to production-ready in one sprint.
```

### 1.4 Code Hotspots (Most Modified)

```
Hotspots (most-modified files, last 14 days)
 8 changes  source/index.html              ← monolith risk
 5 changes  source/plan.html               ← new, stabilizing
 4 changes  source/resources/js/utils/planScheduler.js
 4 changes  source/resources/js/utils/planManager.js
 3 changes  source/resources/data/i18n/en.json
```

### 1.5 Outstanding Debt (Carried Forward)

From NEXT_ITERATION_PLAN.md (33 items total):
- **12 items remain unfixed** (A1, A2, A3, A4, A6, A7, A8, A11, A12, D1-D4, S1-S5, S6, U1-U4)
- **8 performance items remain** (D5-D8, A9, S6, U3, U4)

From PWA_STABILITY_AND_CACHE_PLAN.md (4 bugs):
- **4 bugs remain unfixed** (Safari redirect, banner nag, fake stats, incomplete clear)

From PERFORMANCE_ISSUES_PHASE2.md:
- **1 item remains** (#2 Notes search debounce)

---

## 2. QA Health Score

### Current Assessment: **68 / 100**

| Category | Score | Notes |
|----------|-------|-------|
| Tests pass | 28/30 | 811 unit tests pass; 0 E2E for plan feature |
| Test coverage | 14/20 | Plan logic well-tested; no E2E, no audio tests, no store error-path tests |
| Critical bugs | 12/20 | A1 (no-cors) + A6 (listener leak) + BUG-1 (Safari SW crash) active |
| Error handling | 10/15 | Plan system handles errors well; stores use optimistic UI without rollback |
| Edge cases | 9/15 | Plan edge cases solid; audio/PWA edge cases unaddressed |

### Delta from Last Assessment (62 → 68)

```
Tests pass:     25 → 28  (+3)  ← 811 tests vs 687
Test coverage:  12 → 14  (+2)  ← plan tests added, still no E2E for plan
Critical bugs:  10 → 12  (+2)  ← no new critical bugs introduced
Error handling: 10 → 10  (=)   ← store bugs unchanged
Edge cases:      5 →  9  (+4)  ← plan edge cases well-handled
```

---

## 3. CEO Direction: What Matters Now

### 3A. Premise Challenge

**Q: What should we do next?**

The plan feature is the biggest feature Murajah has ever shipped. It is functionally complete on `dev`. The question is NOT "what new feature to build" — it's **"how to ship what we have with confidence."**

### 3B. Dream State Mapping

```
CURRENT STATE                     THIS MILESTONE                    NEXT BIG FEATURE
─────────────────────────────     ──────────────────────────────   ─────────────────────────────
• Plan feature on dev branch      • Merge dev → master             • Multi-plan per-Juz mode
• 3 critical bugs in audio/PWA    • All P0/P1 bugs fixed           • Cloud sync (optional)
• No E2E tests for plan           • E2E coverage for plan flow     • Speech recognition grading
• PWA Safari crash                • PWA rock-solid                 • Teacher dashboard
• 811 unit tests, 0 plan E2E      • 811 unit + ~20 plan E2E        • Offline-first push notifications
```

### 3C. Mode: HOLD SCOPE

This is a **stabilization + merge** milestone. No new features. Fix bugs, add tests, ship.

### 3D. Success Criteria for Merge to Master

1. ✅ All 811 unit tests pass
2. ⬜ A1 (no-cors) fixed — audio primary URL works
3. ⬜ A6 (listener leak) fixed — no memory growth on nav
4. ⬜ At least 10 E2E tests covering plan creation → task completion → calendar
5. ⬜ PWA Safari redirect fixed (BUG-1)
6. ⬜ Refresh banner de-duped (BUG-2)
7. ⬜ QA health score ≥ 78/100

---

## 4. Priority Matrix

### P0 — Must Fix Before Merge (Blocking)

| ID | Issue | File | Impact |
|----|-------|------|--------|
| A1 | `fetch mode: 'no-cors'` always fails | audioLoader.js:~83 | Audio primary URL never works; plan "Listen" links broken |
| A6 | Event listener leak in QuranAudioPlayer | QuranAudioPlayerComponent.js | Memory grows on every page nav; leaks compound with plan usage |
| BUG-1 | Safari SW redirect crash | sw.js | iOS Safari users can't reload the app |

### P1 — Should Fix Before Merge (High Value)

| ID | Issue | File | Impact |
|----|-------|------|--------|
| BUG-2 | Refresh banner shows repeatedly | index.html + sw.js | Annoys every user on every visit |
| A3 | Silent reciter fallback | audioLoader.js:153 | User hears wrong reciter without knowing |
| A4 | Seek when duration = 0 → NaN | QuranAudioPlayerComponent.js | Player can freeze |
| A5 | Mode switch during playback | QuranAudioPlayerComponent.js | Inconsistent player state |
| E2E | Plan feature E2E tests | tests/e2e/ | No automated coverage for biggest new feature |

### P2 — Fix When Convenient (Medium)

| ID | Issue | File | Impact |
|----|-------|------|--------|
| A7 | Blob URL leak in FloatingAudioPlayer | FloatingAudioPlayerComponent.js | Memory grows per recording |
| S1 | Optimistic delete without rollback (notes) | notesStore.js | UI/DB desync on failure |
| S2 | Optimistic save without rollback (notes) | notesStore.js | UI/DB desync on failure |
| S4 | Failed locale fetch breaks UI | i18nStore.js | Broken translations on network error |
| D1 | scheduleResourceRefresh timeout accumulation | unifiedDataLoader.js | Stale cache updates after rapid switching |
| BUG-3 | Inaccurate offline stats | resourceCache.js | Wrong cache sizes shown in settings |
| BUG-4 | Clear cache incomplete | resourceCache.js + index.html | SW cache not cleared |
| PLAN-1 | Milestone celebration toasts | PlanProgressView.js | No celebration when milestones hit |
| PLAN-2 | Plan export/share | planManager.js | Can't share plan progress |

### P3 — Performance Sprint (Deferred)

| ID | Issue | File | Impact |
|----|-------|------|--------|
| D5 | getWordByIdLookup rebuilds 77k map | unifiedDataLoader.js | 100-200ms per rebuild |
| D6 | getPageLineIndex O(n) scan | unifiedDataLoader.js | 50-100ms on low-end |
| D7 | getPageText rebuilds wordById per call | dataLoader.js | O(770k) ops for 10-page render |
| D8 | getPageWordsDetailed same rebuild | dataLoader.js | Duplicate of D7 |
| A9 | O(n) page-verse lookup per call | audioLoader.js | Latency per verse transition |
| S6 | Notes filter 6× toLowerCase per keystroke | notesStore.js | Janky search with many notes |
| U3 | generateMistakeBubbles 604-page iter | calculations.js | GC pressure during scroll |
| U4 | generateMemorizedGrid 604-page iter | calculations.js | GC pressure during UI updates |

---

## 5. Milestone 1: Critical Bug Fixes (P0)

### Fix A1: Remove `mode: 'no-cors'` from audioLoader.js

**File:** `source/resources/js/utils/audioLoader.js` ~line 83
**Problem:** `fetch(url, { mode: 'no-cors' })` returns opaque response where `response.ok` is always `false`. Audio only works because fallback URL happens to work.
**Fix:** Remove `mode: 'no-cors'` entirely. If CORS headers aren't available, use `new Audio(url)` for direct playback instead of fetch.

```
BEFORE: fetch(url, { mode: 'no-cors' }) → response.ok always false → fallback
AFTER:  fetch(url) → response.ok true → use primary URL
        OR if CORS blocked → catch → new Audio(url) direct load
```

**Tests needed:** Unit test for audioLoader URL resolution (currently 0 tests).

---

### Fix A6: Event Listener Leak in QuranAudioPlayer

**File:** `source/resources/js/components/QuranAudioPlayerComponent.js`
**Problem:** `addEventListener` calls in `onMounted` have no `removeEventListener` in `onUnmounted`. Listeners accumulate on page navigation.
**Fix:** Store references to all listener functions. Remove them in `onUnmounted`.

```javascript
// Pattern:
const handlers = {};
onMounted(() => {
  handlers.timeupdate = () => { /* ... */ };
  audio.addEventListener('timeupdate', handlers.timeupdate);
});
onUnmounted(() => {
  audio.removeEventListener('timeupdate', handlers.timeupdate);
  // ... all other listeners
});
```

**Tests needed:** Unit test verifying listener cleanup.

---

### Fix BUG-1: Safari Service Worker Redirect Crash

**File:** `source/sw.js`
**Problem:** Cached responses for `'./'` may be redirected. Safari rejects redirected responses for navigation requests.
**Fix:**
1. In `staleWhileRevalidate()`, after `cache.match()`, guard: `if (cachedResponse && !(isNavigation && cachedResponse.redirected))` → return cached
2. For navigation to `/`, also try `./index.html` in cache as fallback
3. In install handler, cache root content under both `'./'` AND `'./index.html'`

```
NAVIGATION REQUEST: './'
  ├── Cache './' found + NOT redirected → return ✅
  ├── Cache './' found + IS redirected → SKIP, try './index.html'
  ├── Cache './index.html' found → return ✅
  └── Network fetch (existing fallback)
```

**Tests needed:** E2E test for SW navigation resolution.

---

## 6. Milestone 2: Audio Hardening (P1)

### Fix A3: Silent Reciter Fallback

**File:** `source/resources/js/utils/audioLoader.js` ~line 153
**Fix:** Show a toast when falling back to default reciter.

### Fix A4: Seek When Duration = 0

**File:** `source/resources/js/components/QuranAudioPlayerComponent.js`
**Fix:** Guard: `if (isFinite(audio.duration) && audio.duration > 0)` before seeking.

### Fix A5: Mode Switch During Playback

**File:** `source/resources/js/components/QuranAudioPlayerComponent.js`
**Fix:** Watch `audioPlayMode` prop change → stop playback + reset state.

### Fix A7: Blob URL Leak in FloatingAudioPlayer

**File:** `source/resources/js/components/FloatingAudioPlayerComponent.js`
**Fix:** Track created blob URLs, revoke in `onUnmounted` and on replacement.

---

## 7. Milestone 3: PWA Stability (P1)

### Fix BUG-2: Refresh Banner Persistence

**File:** `source/index.html` + `source/sw.js`
**Fix:**
1. Save `CACHE_VERSION` after `needsVersionRefresh()` check (not only on preload)
2. Add session guard: `sessionStorage.setItem('murajah-just-refreshed', Date.now())` → suppress banner if < 30s
3. In SW, only send `CONTENT_UPDATED` when response body actually changed (compare ETag/Content-Length)

See PWA_STABILITY_AND_CACHE_PLAN.md Task 2 for full implementation spec.

---

## 8. Milestone 4: Store Reliability (P2)

### Fix S1 + S2: Optimistic UI Without Rollback (notesStore)

**File:** `source/resources/js/stores/notesStore.js`
**Fix:** DB operation first, UI update on success. On failure, revert or show error toast.

### Fix S4: Failed Locale Fetch Breaks UI

**File:** `source/resources/js/stores/i18nStore.js`
**Fix:** Only update `currentLocale` after successful fetch. Keep previous locale on failure.

### Fix D1: Timeout Accumulation in scheduleResourceRefresh

**File:** `source/resources/js/utils/unifiedDataLoader.js`
**Fix:** Store timeout ID per key, `clearTimeout` before scheduling new one.

---

## 9. Milestone 5: Plan Feature Polish (P2)

### PLAN-1: Milestone Celebration Toasts

**File:** `source/resources/js/components/PlanProgressView.js`
**Spec:** When a milestone is completed (surah/juz/cycle), show a celebratory toast with the milestone name. Keep it simple — a 3s toast notification, no confetti.

### PLAN-2: Plan E2E Tests (CRITICAL — blocks confident merge)

**File:** `tests/e2e/plan.spec.js` (new)
**Minimum coverage:**

```
├── Plan creation flow
│   ├── Beginner: type → scope → pace → create → redirects to today view
│   ├── Hafiz: type → full quran → pace → create
│   └── Validation: no pages = can't proceed
├── Today card
│   ├── Shows correct task types for plan mode
│   ├── Complete task toggles state
│   └── "Open Page" navigates correctly
├── Calendar
│   ├── Renders current week
│   ├── Navigate forward/backward
│   └── Today highlighted
├── Plan lifecycle
│   ├── Pause/resume
│   ├── Abandon
│   └── Smart plan generation
└── [Optional] Audio card renders playlists
```

### PLAN-3: Remaining Phase 4 Items

| Item | Priority | Notes |
|------|----------|-------|
| Plan export/share | P3 | Defer to next milestone |
| Full accessibility audit | P3 | Defer — basic labels exist |
| SM-2 parameter tuning dashboard | P3 | Debug-only; defer |
| Indopak layout support for plans | P3 | 610 vs 604 pages; defer |

---

## 10. Milestone 6: Performance Sprint (P3)

All deferred. These are optimization-only changes with no user-facing bugs.

**Theme:** "Build index once, cache, invalidate on change."

| ID | Fix Pattern | Est. Impact |
|----|------------|-------------|
| D5-D8 | Shared `getOrBuildWordById()` with stable-ref memoization | -200ms per layout switch |
| A9 | `Map<page, verse[]>` built once at init | -50ms per verse transition |
| S6 | 200ms debounce on notes search + pre-lowercase fields | Smooth search |
| U3-U4 | Memoize `generateMistakeBubbles` / `generateMemorizedGrid` | Less GC pressure |

---

## 11. E2E Test Coverage Gaps

Current E2E tests exist for: appInit, audioRecording, dailyGoals, memorization, pwa, quiz, quizAlgorithm, quizI18n, quranDisplay, quranNavigation, settings, surahView, tafsir, touchInteraction, wordByWord.

**Missing:**

| Test File | Priority | Covers |
|-----------|----------|--------|
| `plan.spec.js` | P1 | Plan creation, today card, calendar, lifecycle |
| `planAudio.spec.js` | P3 | Audio card playlists, page-by-page from plan |
| `audioLoader.spec.js` | P2 | Audio URL resolution, reciter fallback |

---

## 12. NOT in Scope

| Item | Rationale |
|------|-----------|
| Cloud sync / server-side storage | App is client-only PWA; requires entirely different architecture |
| Multi-plan per-Juz mode | Architecture supports it (planId on everything) but scope is stabilization |
| Speech recognition grading | Requires ML model; exploratory, not production-ready |
| Teacher dashboard | Requires multi-user support |
| Push notifications | Requires server-side infrastructure |
| Google/Apple Calendar sync | Requires OAuth + server |
| Per-ayah plan granularity | Pages are the atomic unit, matching all existing features |

---

## 13. What Already Exists & Was Completed

### Guided Plan System (GUIDED_PLAN_DESIGN.md — ✅ REMOVED)

| Phase | Status | Highlights |
|-------|--------|------------|
| Phase 1: Foundation | ✅ 100% | weaknessScorer, planScheduler (SM-2), planManager, MurajahDB v6, 811 tests |
| Phase 2: Setup + Today UI | ✅ 100% | PlanSetupWizard (3-step), PlanTodayCard, dedicated plan.html page |
| Phase 3: Calendar + Progress | ✅ 100% | PlanCalendarComponent, PlanProgressView, missed day handling, health indicator |
| Phase 4: Polish | ⚠️ 60% | Quiz bridge done, smart plan done; celebrations & export missing |

### Beyond Original Plan (Bonuses)

| Feature | What It Does |
|---------|--------------|
| Smart Plan Generation | `generateSmartPlan()` auto-detects user level from existing data |
| Mixed Mode | Beginner + hafiz in different juz with proportional budgets |
| PlanAudioCard | Quick audio playlists for today's revision/weak/new pages |
| Memorization Threshold | Configurable: ≥40 perfect revisions = page memorized |
| User Page Selection | Choose which page to memorize next + auto-advance |

### PERFORMANCE_ISSUES_PHASE2.md — ✅ 6/7 RESOLVED

| # | Issue | Status |
|---|-------|--------|
| 1 | Achievement grid re-computation | ✅ System removed |
| 2 | Notes search no debounce | ⬜ Carried → S6 |
| 3 | Quiz timer memory leak | ✅ Fixed |
| 4 | Quiz auto-nav 3s delay | ✅ Fixed |
| 5 | Morphology preloader O(n²) | ✅ Fixed |
| 6 | Quiz surah selection O(n²) | ✅ Fixed |
| 7 | Audio player sorted recordings | ✅ Fixed |

### Prior Plan Files

| Plan | Disposition |
|------|-------------|
| MOBILE_UX_IMPROVEMENT_PLAN.md | ✅ 8/8 items done, removed in prior milestone |
| NAVIGATION_IMPROVEMENT_PLAN.md | ✅ 5/6 done, 1 carried, removed in prior milestone |
| GUIDED_PLAN_DESIGN.md | ✅ Phases 1-3 complete, removed this milestone |
| NEXT_ITERATION_PLAN.md | ⚠️ 33 items, 12 remain unfixed, merged into this plan |

---

## 14. Risk Assessment

```
RISK MATRIX:

                          IMPACT
                    Low         High
              ┌───────────┬───────────┐
  LIKELIHOOD  │ P3 perf   │ index.html│
    High      │ items get  │ merge to  │
              │ deferred   │ master    │
              ├───────────┼───────────┤
              │ Plan E2E   │ Safari    │
    Low       │ tests      │ SW crash  │
              │ flaky      │ persists  │
              └───────────┴───────────┘

TOP 3 RISKS:

1. Large dev→master merge (7,544 lines)
   Mitigation: Fix P0 bugs first, then merge. Don't accumulate more.

2. Safari SW redirect not fully testable locally
   Mitigation: Manual test on real iOS device. Add E2E guard.

3. Audio fixes may introduce regressions
   Mitigation: Add audioLoader unit tests BEFORE making changes.
```

---

## Execution Order

```
RECOMMENDED SEQUENCE:

  Week 1: P0 Critical Fixes
  ├── A1: Remove no-cors from audioLoader
  ├── A6: Fix listener leak in QuranAudioPlayer
  └── BUG-1: Fix Safari SW redirect

  Week 2: P1 Audio + PWA + E2E
  ├── A3, A4, A5, A7: Audio hardening batch
  ├── BUG-2: Fix banner persistence
  └── Plan E2E tests (minimum 10 tests)

  Week 3: P2 Store + Plan Polish (if time)
  ├── S1, S2: Notes rollback
  ├── S4: Locale fetch failure
  ├── D1: Timeout accumulation
  └── PLAN-1: Celebration toasts

  Merge: dev → master
  └── QA health score target: ≥ 78/100

  Post-merge: P3 Performance Sprint
  └── D5-D8, A9, S6, U3, U4
```

---

*Total items: 3 P0 + 5 P1 + 7 P2 + 8 P3 + 10 E2E tests = 33 items*
*Blocking merge: P0 (3) + Plan E2E (1) = 4 items*
*Target QA health score after this milestone: ≥ 78/100*

---

*End of Milestone Plan. PWA_STABILITY_AND_CACHE_PLAN.md retained as reference for BUG-1 through BUG-4 implementation details.*
