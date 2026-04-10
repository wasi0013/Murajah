# Guided Plan System — Architecture & Product Design Document

> **Generated:** 2026-04-10
> **Skills Applied:** CEO Review (SCOPE EXPANSION), Engineering Review, QA Strategy, Pre-Landing Review, Retro Insights
> **Status:** Design Phase — Pre-Implementation

---

## Table of Contents

1. [CEO Review: Product Vision](#1-ceo-review-product-vision)
2. [System Audit: What Exists](#2-system-audit-what-exists)
3. [Architecture & Data Model](#3-architecture--data-model)
4. [Scheduling Engine](#4-scheduling-engine)
5. [UI/UX Flow](#5-uiux-flow)
6. [Edge Cases & Failure Modes](#6-edge-cases--failure-modes)
7. [Phased Implementation Plan](#7-phased-implementation-plan)
8. [QA Strategy & Test Plan](#8-qa-strategy--test-plan)
9. [Code Review: Integration Points](#9-code-review-integration-points)
10. [Retro Insights: Risk & Post-Launch](#10-retro-insights-risk--post-launch)
11. [NOT in Scope](#11-not-in-scope)
12. [TODO Registry](#12-todo-registry)

---

## 1. CEO Review: Product Vision

### 1A. Premise Challenge

**Is this the right problem?** Yes. The #1 drop-off reason for Quran memorizers is lack of structure. The current daily goals system is a task checklist — it doesn't think FOR the user. The gap between "mark pages as memorized" and "retain them permanently" is where users fail. A guided plan bridges that gap.

**What happens if we do nothing?** Users who are serious about Hifz will use external spreadsheets, paper schedules, or competing apps (Tarteel, Quran Companion). Murajah becomes a nice Quran viewer with quizzes but not a retention system.

**Dream State Mapping:**
```
  CURRENT STATE                     THIS PLAN                        12-MONTH IDEAL
  ─────────────────────────────     ──────────────────────────────   ─────────────────────────────
  • Manual page memorization        • Auto-generated adaptive plan   • AI-assisted plan that learns
  • Rotating chunk review (dumb)    • SM-2 based review scheduling   • Personalized difficulty curves
  • 4 fixed daily tasks             • Dynamic daily tasks from plan  • Contextual task suggestions
  • No beginner/hafiz distinction   • Two distinct plan modes        • N user segments (teacher, student, etc.)
  • Quiz exists but disconnected    • Quiz feeds weakness data       • Quiz IS the reinforcement engine
  • Audio recording exists          • Recordings verify plan steps   • Speech recognition auto-grades
  • No calendar view                • Calendar with drag-drop        • Calendar syncs w/ Google/Apple
  • Streak is just a counter        • Streak reflects real progress  • Gamification + social accountability
```

### 1B. The 10-Star Version (for guidance, not for Phase 1)

| Star Level | Feature |
|------------|---------|
| 5★ (MVP)   | Auto-generated plan with calendar view; beginner vs hafiz modes; adaptive rescheduling on missed days |
| 7★         | SM-2 algorithm using quiz + recording scores to adjust intervals; weak area heat map; milestone celebrations |
| 10★        | Speech recognition auto-grading recitations; teacher dashboard; social accountability groups; plan sharing |

**We are building the 5★ version in Phases 1-3, with architecture that supports 7★.**

### 1C. Delight Opportunities (30-Minute Wins)

1. **"Quick Jump to Review"** — When plan says "Review pages 45-52", one tap opens that page with audio ready
2. **"Today's Focus" card** — Single-screen summary: what to memorize, what to review, what's weak
3. **"Plan Health" indicator** — Simple green/yellow/red showing if user is on track, falling behind, or ahead
4. **Milestone toasts** — "You've completed 1 juz of revision this cycle!" with confetti (we already removed confetti, but can bring back tastefully)

### 1D. Critical Product Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Plan granularity | **Page-based** (not ayah-based) | Matches existing page-by-page features, audio, and UI grid |
| Minimum plan unit | **1 page** | Consistent with existing `memorizedPages` Set |
| Revision cycle unit | **Juz** (for Hafiz), **Surah** (for Beginner) | Natural Quran divisions; Hafiz thinks in Juz, beginners in Surah |
| Weakness metric | **Composite score** (quiz errors + missed revisions + time since last review) | Single number, multiple inputs |
| Calendar scope | **Weekly view default** (scrollable to monthly) | Daily is too narrow, monthly is overwhelming for beginners |

---

## 2. System Audit: What Exists

### 2A. Reusable Components (DO NOT REBUILD)

| Existing Feature | File(s) | Reuse Strategy |
|-----------------|---------|----------------|
| **Daily Goals Framework** | `dailyGoalsManager.js` | Extend `initializeTodayGoals()` to accept plan-generated tasks instead of static 4 |
| **Review rotation** | `calculateReviewRange()` | Replace with SM-2 scheduler for plan mode; keep for non-plan users |
| **Perfect revision tracking** | `perfectRevisions` Map in appData | Feed into weakness score calculation |
| **Mistake tracking** | `mistakesMap` in appData | Feed into weakness score; per-word mistakes → page-level weakness |
| **Page grid visualization** | `calculations.js` → `generateMistakeBubbles()` | Overlay plan progress colors on existing grid |
| **Streak calculation** | `calculateStreak()` | Extend to count plan-adherence streaks |
| **MurajahDB** | `MurajahDB` class | Add 2 new object stores: `plans`, `planHistory` |
| **i18n system** | `i18nStore.js` + `/data/i18n/*.json` | Add `plan.*` translation keys |
| **Audio player** | `QuranAudioPlayerComponent.js` | Link "Review pages X-Y" task → opens audio at page X |
| **Quiz system** | `quizHelpers.js` + `quiz.html` | Plan-triggered quiz for weak pages |
| **Timeline/contribution graph** | In `index.html` daily goals section | Show plan milestones as overlay dots |
| **Logger** | `logger.js` | Add `PLAN` module |
| **Touch helpers** | `touchHelper.js` | Reuse for calendar drag-and-drop |

### 2B. What Must NOT Be Duplicated

- Page memorization state → single source: `memorizedPages` Set
- Perfect revision count → single source: `perfectRevisions` Map
- Mistake data → single source: `mistakesMap` Map
- Settings → single source: `settingsStore`
- Daily task completion → single source: `dailyGoals` IndexedDB store

**Rule:** The plan system READS from these sources. It WRITES only to `plans` and `planHistory` stores. It GENERATES tasks that flow INTO the existing `dailyGoals` system.

### 2C. Known Technical Debt (from NEXT_ITERATION_PLAN.md)

| ID | Issue | Impact on This Feature | Action |
|----|-------|----------------------|--------|
| A1 | `fetch mode: 'no-cors'` always fails | Audio links from plan won't work reliably | Fix BEFORE plan feature |
| A6 | Event listener leak in QuranAudioPlayer | Calendar → audio transitions will leak | Fix BEFORE plan feature |
| U1 | Streak edge case (today complete = 0 streak) | Plan streak display will be wrong | Fix IN plan PR |
| D1 | `scheduleResourceRefresh` timeout leak | Not directly blocking | Defer |

---

## 3. Architecture & Data Model

### 3A. System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           USER INTERFACE                             │
│  ┌──────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────────┐  │
│  │ Calendar  │  │ Today Focus  │  │  Plan Setup │  │ Progress View│  │
│  │ Component │  │    Card      │  │   Wizard    │  │ (Milestone)  │  │
│  └─────┬─────┘  └──────┬───────┘  └──────┬─────┘  └──────┬───────┘  │
│        │               │                 │                │          │
└────────┼───────────────┼─────────────────┼────────────────┼──────────┘
         │               │                 │                │
         ▼               ▼                 ▼                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        PLAN MANAGER (planManager.js)                 │
│  ┌──────────────┐  ┌───────────────┐  ┌────────────────┐            │
│  │ Plan Generator│  │   Scheduler   │  │ Reschedule     │            │
│  │ (createPlan) │  │ (getToday     │  │ Engine         │            │
│  │              │  │  Tasks)       │  │ (handleMissed) │            │
│  └──────┬───────┘  └───────┬───────┘  └────────┬───────┘            │
│         │                  │                    │                    │
│         ▼                  ▼                    ▼                    │
│  ┌──────────────────────────────────────────────────────┐           │
│  │              WEAKNESS SCORER (weaknessScorer.js)      │           │
│  │  Inputs: perfectRevisions + mistakesMap + quizScores  │           │
│  │          + daysSinceLastReview + reviewCount           │           │
│  │  Output: Map<pageNum, weaknessScore 0-100>            │           │
│  └───────────────────────┬──────────────────────────────┘           │
│                          │                                          │
└──────────────────────────┼──────────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│ dailyGoals   │  │   plans      │  │   planHistory    │
│ (existing)   │  │ (NEW store)  │  │   (NEW store)    │
│ IndexedDB    │  │ IndexedDB    │  │   IndexedDB      │
└──────────────┘  └──────────────┘  └──────────────────┘
         │                 │                  │
         └─────────────────┼──────────────────┘
                           ▼
                  ┌──────────────┐
                  │  MurajahDB   │
                  │  (extended)  │
                  └──────────────┘

READS FROM (existing, never writes):
  ├── memorizedPages (Set)
  ├── perfectRevisions (Map<page, count>)
  ├── mistakesMap (Map<page, Set<wordId>>)
  └── settingsStore (reactive)
```

### 3B. Data Model

#### Plan Object (IndexedDB: `plans` store)

```javascript
{
  // Identity
  id: "plan_1712700000000",          // "plan_" + timestamp
  name: "Complete Juz Amma",         // User-editable or auto-generated
  type: "beginner" | "hafiz",        // Determines scheduling algorithm

  // Scope
  targetPages: [582, 583, ..., 604], // Ordered page numbers in plan
  targetJuz: [30],                   // Juz numbers (derived from pages)

  // Timing
  createdAt: "2026-04-10T00:00:00Z",
  startDate: "2026-04-10",           // Plan start date
  endDate: "2026-06-10",             // Estimated end date (recalculated)
  pace: {                            // User-configured pace
    newPagesPerDay: 1,               // Beginner only
    revisionPagesPerDay: 5,          // Both modes
    daysPerWeek: 6,                  // Active days (default: 6, Friday off)
    offDays: [5],                    // 0=Sunday, 5=Friday
  },

  // State
  status: "active" | "paused" | "completed" | "abandoned",
  currentCycleNumber: 1,            // Hafiz: which full revision cycle
  totalCycles: null,                 // Hafiz: null = infinite

  // Progress (denormalized for fast reads)
  stats: {
    totalPagesInPlan: 23,
    pagesMemorized: 10,              // Beginner: pages marked memorized within plan scope
    pagesReviewed: 15,               // Total unique pages reviewed at least once this cycle
    revisionCyclesCompleted: 0,      // Hafiz: full passes through all pages
    currentStreak: 5,                // Consecutive plan-days completed
    longestStreak: 12,
    missedDays: 2,
    totalDaysActive: 15,
    weakPageCount: 3,                // Pages with weakness score > 70
  },

  // Scheduling state
  schedulerState: {
    // Per-page review data (the core of SM-2)
    pageReviewData: {
      // Map<pageNum, ReviewData>
      "582": {
        lastReviewDate: "2026-04-09",
        nextReviewDate: "2026-04-12",
        interval: 3,                  // Days until next review
        easeFactor: 2.5,              // SM-2 ease factor (1.3 - 3.0)
        reviewCount: 4,
        consecutiveCorrect: 2,        // Resets on poor performance
        weaknessScore: 25,            // 0=strong, 100=very weak
      },
      "583": { ... }
    },
    lastScheduledDate: "2026-04-09",  // Last date tasks were generated
    backlogPages: [],                  // Pages overdue for review
  },

  // Milestones (auto-generated)
  milestones: [
    { id: "m1", type: "surah_complete", surah: 114, targetDate: "2026-04-15", completedDate: null },
    { id: "m2", type: "juz_complete", juz: 30, targetDate: "2026-05-01", completedDate: null },
    { id: "m3", type: "cycle_complete", cycle: 1, targetDate: "2026-06-10", completedDate: null },
  ],
}
```

#### Plan Day Record (IndexedDB: `planHistory` store)

```javascript
{
  // Key: "plan_1712700000000_2026-04-10" (planId + date)
  id: "plan_1712700000000_2026-04-10",
  planId: "plan_1712700000000",
  date: "2026-04-10",

  // Tasks generated for this day
  tasks: {
    newMemorization: {                // Beginner only
      pages: [585],
      completed: false,
      completedAt: null,
    },
    revision: {                       // Both modes
      pages: [582, 583, 584],
      source: "scheduled",            // "scheduled" | "backlog" | "weak_reinforcement"
      completed: false,
      completedAt: null,
      performance: null,              // Set after completion: "perfect" | "good" | "needs_work"
    },
    weakReinforcement: {              // Adaptive — only if weak pages exist
      pages: [580],
      reason: "quiz_score_low",       // Why this page was flagged
      completed: false,
      completedAt: null,
      performance: null,
    },
  },

  // Daily summary
  summary: {
    totalTasks: 3,
    completedTasks: 0,
    status: "pending" | "partial" | "complete" | "missed",
    missedReason: null,               // "skipped" | "inactive" | "rescheduled"
  },
}
```

#### Weakness Score Composite

```javascript
// weaknessScorer.js — pure function, no side effects
//
// SCORE FORMULA (0-100, higher = weaker):
//
//   weakness = w1 * daysSinceReview_normalized
//            + w2 * (1 - perfectRevisionRatio)
//            + w3 * mistakeRatio
//            + w4 * (1 - quizAccuracy)
//            + w5 * lowReviewCount_penalty
//
// WEIGHTS:
//   w1 = 0.30  (recency — most important for forgetting curve)
//   w2 = 0.25  (revision quality — perfect revisions indicate mastery)
//   w3 = 0.20  (mistakes — word-level errors indicate weak spots)
//   w4 = 0.15  (quiz performance — independent verification)
//   w5 = 0.10  (review count — new pages with few reviews are risky)
//
// NORMALIZATION:
//   daysSinceReview: min(daysSince / 30, 1.0)  — caps at 30 days
//   perfectRevisionRatio: perfectCount / max(reviewCount, 1)  — 0 to 1
//   mistakeRatio: mistakeWordCount / totalWordsOnPage  — 0 to 1
//   quizAccuracy: correctAnswers / totalQuestions  — 0 to 1 (default 0.5 if no quiz data)
//   lowReviewCount: reviewCount < 3 ? (3 - reviewCount) / 3 : 0
```

### 3C. IndexedDB Schema Changes (MurajahDB v6)

```javascript
// In MurajahDB class — version bump from 5 to 6
// onupgradeneeded handler:
if (oldVersion < 6) {
  // Plan store — one active plan at a time (v1), multiple later
  const planStore = db.createObjectStore('plans', { keyPath: 'id' });
  planStore.createIndex('status', 'status', { unique: false });
  planStore.createIndex('type', 'type', { unique: false });

  // Plan history — daily records
  const historyStore = db.createObjectStore('planHistory', { keyPath: 'id' });
  historyStore.createIndex('planId', 'planId', { unique: false });
  historyStore.createIndex('date', 'date', { unique: false });
  historyStore.createIndex('planId_date', ['planId', 'date'], { unique: true });
}
```

### 3D. New Files Map

```
source/resources/js/
  utils/
    planManager.js          ← Plan CRUD, task generation, lifecycle
    planScheduler.js        ← SM-2 algorithm, interval calculation, rescheduling
    weaknessScorer.js       ← Composite weakness score (pure function)
  components/
    PlanCalendarComponent.js ← Calendar grid UI
    PlanSetupWizard.js       ← Onboarding wizard (2-3 steps)
    PlanTodayCard.js         ← "Today's Focus" daily summary card
    PlanProgressView.js      ← Milestones + progress visualization

tests/unit/
    planManager.test.js
    planScheduler.test.js
    weaknessScorer.test.js

tests/e2e/
    planSetup.spec.js
    planCalendar.spec.js
    planScheduling.spec.js
```

**File count: 7 new source files + 6 new test files = 13 total.** This is above the 8-file smell threshold but justified: each file has a single clear responsibility and the alternative (fewer files with mixed concerns) would be worse.

---

## 4. Scheduling Engine

### 4A. SM-2 Based Review Scheduling

The core insight: **not all pages need equal review frequency.** Pages with high weakness scores need review in 1-2 days; strong pages can wait 7-14 days.

#### Algorithm: `calculateNextReview(pageReviewData, performance)`

```
INPUT:
  pageReviewData: { interval, easeFactor, reviewCount, consecutiveCorrect }
  performance: 0-5 scale
    0 = Complete failure (couldn't recall at all)
    1 = Recalled with major mistakes
    2 = Recalled with minor mistakes
    3 = Recalled with hesitation
    4 = Recalled correctly
    5 = Perfect recall, no hesitation

ALGORITHM (Modified SM-2):
  if performance < 3:
    // Reset — page needs more work
    interval = 1
    consecutiveCorrect = 0
  else:
    if consecutiveCorrect == 0:
      interval = 1
    else if consecutiveCorrect == 1:
      interval = 3
    else:
      interval = round(interval * easeFactor)

    consecutiveCorrect += 1

  // Update ease factor (SM-2 formula)
  easeFactor = max(1.3, easeFactor + (0.1 - (5 - performance) * (0.08 + (5 - performance) * 0.02)))

  // Cap interval based on user type
  if userType == "beginner":
    interval = min(interval, 14)    // Beginners: max 14 days between reviews
  else:  // hafiz
    interval = min(interval, 21)    // Hafiz: max 21 days (full Quran cycle constraint)

  nextReviewDate = today + interval days

OUTPUT:
  { interval, easeFactor, nextReviewDate, consecutiveCorrect }
```

#### Performance Score Mapping

How existing data feeds into performance (0-5):

```
  DATA SOURCE                    MAPPING TO PERFORMANCE
  ────────────────────────────   ─────────────────────────────────
  Perfect revision (already      perfectRevisions[page] >= 3 → 5
    tracked in appData)          perfectRevisions[page] == 2 → 4
                                 perfectRevisions[page] == 1 → 3
                                 perfectRevisions[page] == 0 → 2

  Mistakes (already tracked      0 mistakes → +0
    in appData)                  1-2 mistakes → -1
                                 3+ mistakes → -2

  Quiz score (from quiz.html     > 90% on page's ayahs → +1
    — needs new data flow)       < 50% → -1

  User self-report               "I know this well" → 4
    (new: task completion         "I need more practice" → 2
     with rating)                "I couldn't recall" → 0
```

### 4B. Beginner Mode Scheduling

```
DAILY TASK GENERATION (Beginner):

  ┌─────────────────────────────────────────────────┐
  │              DAILY BUDGET                         │
  │  Total pages/day = newPagesPerDay                 │
  │                   + revisionPagesPerDay            │
  │                   + weakReinforcementPages (0-2)   │
  └─────────────────────────────────────────────────┘

  1. NEW MEMORIZATION (if pace.newPagesPerDay > 0):
     → Next N unmemoized pages in plan scope
     → Always sequential (don't skip)

  2. SHORT-TERM REVISION (last 7 days of new memorization):
     → Pages memorized in last 7 days
     → Review 2-3 pages/day from this window
     → Higher frequency for very recent (1-2 days old)

  3. LONG-TERM REVISION (SM-2 scheduled):
     → Pages where nextReviewDate <= today
     → Sorted by: overdue days DESC, weakness DESC
     → Take up to revisionPagesPerDay - shortTermCount

  4. WEAK REINFORCEMENT (adaptive):
     → Top 1-2 pages by weaknessScore (if score > 60)
     → Only if not already in today's revision list
     → Cap: max 2 extra pages/day (prevent overload)

  PRIORITY ORDER (if budget exceeded):
     New Memorization > Short-Term Revision > Weak Reinforcement > Long-Term Revision

  OVERLOAD PREVENTION:
     Total daily pages NEVER exceeds: newPagesPerDay + revisionPagesPerDay + 2
     If backlog grows > 10 pages: pause new memorization for 1 day, catch up
```

### 4C. Hafiz Mode Scheduling

```
DAILY TASK GENERATION (Hafiz):

  ┌─────────────────────────────────────────────────┐
  │              DAILY BUDGET                         │
  │  Total pages/day = revisionPagesPerDay             │
  │                   + weakReinforcementPages (0-3)   │
  │  No new memorization.                              │
  └─────────────────────────────────────────────────┘

  TARGET: Complete full Quran revision in N days
    e.g., 604 pages / 20 pages per day = ~30 days per cycle

  1. CYCLE REVISION (primary):
     → SM-2 scheduled pages where nextReviewDate <= today
     → If fewer due pages than budget: pull forward pages due tomorrow
     → Sorted by: overdue days DESC, then sequential order (Juz 1 → 30)

  2. WEAK REINFORCEMENT (higher priority for Hafiz):
     → Pages with weaknessScore > 50 (lower threshold than beginner)
     → Up to 3 extra pages/day
     → These pages get SHORTER intervals (easeFactor reduced by 0.2)

  3. CYCLE TRACKING:
     → When all 604 pages have been reviewed at least once → cycle complete
     → Increment currentCycleNumber
     → Recalculate all intervals (keep ease factors, reset review dates)
     → Milestone: "Completed Quran revision cycle #N"

  4. JUZ BALANCING:
     → Track reviews per Juz in current cycle
     → If any Juz falls behind by > 5 days from others: boost priority
     → Prevent: "Juz 1-10 reviewed 3x, Juz 20-30 never touched"

  EVEN DISTRIBUTION CONSTRAINT:
     Over any 30-day window, each Juz should be reviewed at least once.
     If violated: scheduler forces Juz catch-up before continuing normal flow.
```

### 4D. Missed Day Handling

```
STATE MACHINE: Missed Day Resolution

  User opens app after missing N days:

  ┌──────────┐     N=1      ┌──────────────────┐
  │  ACTIVE  │─────────────▶│  LIGHT RESCHEDULE │
  │          │              │  - Move overdue   │
  │          │              │    to today+1,+2  │
  └──────────┘              │  - No pace change │
       │                    └──────────────────┘
       │
       │         N=2-4      ┌──────────────────┐
       ├───────────────────▶│  MEDIUM RESCHEDULE│
       │                    │  - Spread overdue │
       │                    │    over next 3 days│
       │                    │  - Reduce new memo│
       │                    │    by 50% for 3 days│
       │                    └──────────────────┘
       │
       │         N=5-13     ┌──────────────────┐
       ├───────────────────▶│  HEAVY RESCHEDULE │
       │                    │  - Pause new memo │
       │                    │    for N/2 days   │
       │                    │  - Recalculate all│
       │                    │    SM-2 intervals │
       │                    │  - Show "Welcome  │
       │                    │    Back" prompt    │
       │                    └──────────────────┘
       │
       │         N=14+      ┌──────────────────┐
       └───────────────────▶│  PLAN RESET       │
                            │  - Mark plan as   │
                            │    "needs restart" │
                            │  - Keep all data  │
                            │  - Offer: Resume  │
                            │    or New Plan    │
                            └──────────────────┘

  ON RESCHEDULE:
    1. Mark missed days as { status: "missed", missedReason: "inactive" }
    2. All overdue pages get: interval = 1 (review ASAP)
    3. Weakness scores recalculated (daysSinceReview increased)
    4. Backlog sorted by weakness DESC
    5. Backlog distributed across next N days (never >2x normal load)
    6. endDate recalculated
    7. Milestones shifted
```

### 4E. Plan Lifecycle State Machine

```
                 create()
                    │
                    ▼
              ┌──────────┐
              │  ACTIVE   │◀──── resume()
              └─────┬─────┘
                    │
          ┌─────────┼─────────┐
          │         │         │
     pause()   complete()  abandon()
          │         │         │
          ▼         ▼         ▼
    ┌──────────┐ ┌─────────┐ ┌───────────┐
    │  PAUSED  │ │COMPLETED│ │ ABANDONED  │
    └──────────┘ └─────────┘ └───────────┘

  ACTIVE → PAUSED:   User explicitly pauses; no tasks generated; data preserved
  PAUSED → ACTIVE:   Triggers missed day handling (N = days paused)
  ACTIVE → COMPLETED: Beginner: all targetPages memorized + 1 full revision cycle
                       Hafiz: user-defined (manual or after N cycles)
  ACTIVE → ABANDONED: User deletes plan or starts new plan; data kept in history
  
  INVARIANT: Only 1 plan can be ACTIVE at a time (v1).
```

---

## 5. UI/UX Flow

### 5A. Plan Setup Wizard (3 Steps)

```
STEP 1: User Type
┌─────────────────────────────────────────┐
│        What describes you best?          │
│                                          │
│  ┌─────────────────┐  ┌──────────────┐  │
│  │  🌱 I'm actively │  │ 📖 I've       │  │
│  │  memorizing new  │  │ completed the │  │
│  │  portions        │  │ full Quran    │  │
│  │                  │  │               │  │
│  │  (Beginner)      │  │  (Hafiz)      │  │
│  └─────────────────┘  └──────────────┘  │
└─────────────────────────────────────────┘

STEP 2: Scope (differs by type)

  BEGINNER:                          HAFIZ:
  "What do you want to memorize?"    "What do you want to revise?"
  ○ Specific Surah(s) [dropdown]     ○ Full Quran (all 30 Juz)
  ○ Specific Juz [multi-select]      ○ Specific Juz [multi-select]
  ○ Custom page range                ○ Custom page range

  "Which pages have you already      (auto-detected from memorizedPages)
   memorized?" → pre-filled from
   existing memorizedPages

STEP 3: Pace
  "How much time per day?"
  ┌───────────────────────────┐
  │ New pages/day:    [1] ▲▼  │  ← Beginner only
  │ Review pages/day: [5] ▲▼  │
  │ Active days/week: [6] ▲▼  │
  │ Off days: [☐S ☐M ☐T ☐W   │
  │            ☐T ☑F ☐S]      │
  └───────────────────────────┘

  "Estimated completion: ~60 days (June 10, 2026)"

          [ Create Plan → ]
```

### 5B. Calendar Component

```
WEEKLY VIEW (default):
┌──────────────────────────────────────────────────────┐
│  ◀  April 7 – April 13, 2026                    ▶   │
│  [Week ▾]                                [Month ▾]   │
├──────┬──────┬──────┬──────┬──────┬──────┬──────┤
│ Mon  │ Tue  │ Wed  │ Thu  │ Fri  │ Sat  │ Sun  │
│  7   │  8   │  9   │  10  │  11  │  12  │  13  │
├──────┼──────┼──────┼──────┼──────┼──────┼──────┤
│ 🟢   │ 🟢   │ 🟡   │ 📍   │ 🔕   │      │      │
│ New: │ New: │ New: │ New: │ REST │ Rev: │ Rev: │
│ p585 │ p586 │ p587 │ p588 │ DAY  │ p100 │ p120 │
│──────│──────│──────│──────│──────│ -105 │ -125 │
│ Rev: │ Rev: │ Rev: │ Rev: │      │──────│──────│
│ p582 │ p583 │ p580 │ p581 │      │ Weak:│ Weak:│
│ -584 │ -585 │ -582 │ -584 │      │ p200 │ p210 │
│──────│──────│──────│──────│      │      │      │
│ Weak:│      │ Weak:│      │      │      │      │
│ p200 │      │ p210 │      │      │      │      │
└──────┴──────┴──────┴──────┴──────┴──────┴──────┘

LEGEND:
  🟢 = completed    🟡 = partial    📍 = today
  🔕 = off day      🔴 = missed     (empty) = future

INTERACTIONS:
  • Tap day → expand to show full task list with page links
  • Tap page number → navigate to Quran view at that page
  • Long-press task → drag to reschedule to another day
  • Swipe left/right → previous/next week
```

### 5C. Today's Focus Card

```
┌─────────────────────────────────────────┐
│  📅 Today's Plan                  Day 15 │
│  ─────────────────────────────────────── │
│                                          │
│  🆕 New Memorization          [ ] p.588  │
│     Surah Al-Fajr, verses 1-14          │
│     [▶ Listen] [📖 Open Page]            │
│                                          │
│  📖 Revision                   [ ] 3 pgs │
│     Pages 581, 582, 584                  │
│     [▶ Listen] [📖 Open Page 581]        │
│                                          │
│  ⚡ Weak Area                  [ ] p.200 │
│     Last reviewed 12 days ago            │
│     [▶ Listen] [📖 Open Page] [🧪 Quiz]  │
│                                          │
│  ─────────────────────────────────────── │
│  Progress: ████████░░ 67% of today       │
│  Streak: 5 days 🔥                       │
│  Plan health: 🟢 On track               │
└─────────────────────────────────────────┘

"Open Page" → navigates to existing Quran page view
"Listen" → opens QuranAudioPlayer at that page
"Quiz" → opens quiz.html filtered to that page's surah
```

### 5D. Navigation Integration

```
EXISTING NAV:
  [Quran] [Daily Goals] [Notes] [Settings]

UPDATED NAV (when plan is active):
  [Quran] [📅 Plan] [Daily Goals] [Notes] [Settings]
             │
             └── Plan tab contains:
                 ├── Today's Focus Card (default view)
                 ├── Calendar View (tap "Calendar" sub-tab)
                 └── Progress/Milestones (tap "Progress" sub-tab)

WHEN NO PLAN EXISTS:
  Plan tab shows: "No active plan. [Create a Plan →]"
```

---

## 6. Edge Cases & Failure Modes

### 6A. Data Flow Edge Cases

```
INPUT ──▶ VALIDATION ──▶ TRANSFORM ──▶ PERSIST ──▶ OUTPUT
  │            │              │            │           │
  ▼            ▼              ▼            ▼           ▼
[nil?]    [invalid?]    [exception?]  [conflict?]  [stale?]
[empty?]  [too long?]   [timeout?]    [dup key?]   [partial?]

SPECIFIC CASES:

1. memorizedPages is empty at plan creation (beginner)
   → Valid: plan starts from 0, all target pages are "new"
   → Show: "You're starting fresh! Great."

2. memorizedPages updated OUTSIDE of plan (user manually marks page)
   → Plan must detect: "Page 585 was marked memorized outside plan"
   → Action: Credit it to plan progress, skip in new memorization queue

3. Plan created but user never opens app again
   → No crash. On next open: missed day handling kicks in.
   → planHistory entries NOT created for days user was absent.

4. Two plan day records for same date (race condition)
   → Prevented by: compound index [planId, date] with unique=true
   → On conflict: merge tasks (union of pages), keep higher completion count

5. IndexedDB upgrade fails mid-migration (v5 → v6)
   → MurajahDB already has onerror handler
   → Plan feature degrades gracefully: "Plans unavailable, please refresh"
   → Existing features (daily goals, quran view) continue to work

6. User changes pace mid-plan
   → Recalculate endDate and all future task assignments
   → Keep all historical completion data
   → Show: "Plan updated. New estimated completion: [date]"

7. User memorized pages shrink (unmarked pages that were memorized)
   → Detect: page in plan.schedulerState but not in memorizedPages
   → Action: Remove from revision queue, mark as "unmemorized" in plan
   → Weakness score → 100 (needs re-memorization)

8. 604 pages all memorized, beginner creates plan
   → Detect: no new pages to memorize
   → Redirect: "It looks like you've memorized everything! Try Hafiz mode."

9. Hafiz selects only 1 Juz but reviews 20 pages/day
   → 20 pages / 20 pages per juz = 1 day cycle
   → Valid but warn: "Your cycle is only 1 day. Consider reducing pace or adding more Juz."

10. Plan completion while backlog exists
    → Beginner: all targetPages memorized AND backlog cleared
    → Don't complete plan with outstanding backlog (user might think they're done)
```

### 6B. Interaction Edge Cases

```
INTERACTION              | EDGE CASE                | HANDLING
─────────────────────────|──────────────────────────|──────────────────────────
Calendar day tap         | Tap day with no tasks    | Show "Rest day" or "No tasks scheduled"
Calendar day tap         | Tap future day (>7 days) | Show "Preview — tasks may change"
Calendar drag-drop       | Drop on off-day          | Reject with toast: "That's a rest day"
Calendar drag-drop       | Drop on past day         | Reject: "Can't schedule in the past"
Plan create              | Double-tap "Create"      | Debounce 500ms; disable button after first tap
Plan create              | Network error mid-save   | All writes are local (IndexedDB). No network needed.
Task "Open Page"         | Page data not loaded     | Show loading spinner, load page, then navigate
Task completion          | Complete same task twice  | Idempotent; second tap = no change
Task uncomplete          | Uncomplete after day end | Allowed; recalculates streak
Wizard step 2            | 0 pages selected         | Disable "Next" button; show validation message
Wizard step 3            | pace.newPagesPerDay = 0  | Valid for Hafiz; invalid for Beginner (show error)
Switch between plans     | Active plan exists       | "You already have an active plan. Abandon it first?"
App opened after 30 days | Plan reset threshold     | Show "Welcome back" with resume/restart option
```

### 6C. Failure Modes Registry

```
CODEPATH                     | FAILURE MODE          | HANDLED? | TESTED? | USER SEES
─────────────────────────────|───────────────────────|──────────|─────────|──────────────────
planManager.createPlan()     | IndexedDB write fail  | Y        | Y       | "Couldn't save plan. Try again."
planManager.createPlan()     | Invalid page range    | Y        | Y       | Validation error in wizard
planScheduler.getToday()     | No active plan        | Y        | Y       | "No plan" empty state
planScheduler.getToday()     | Plan data corrupted   | Y        | Y       | Reset scheduler state, log error
planScheduler.reschedule()   | Circular reschedule   | Y        | Y       | Max 3 reschedule attempts, then stop
weaknessScorer.calculate()   | Missing input data    | Y        | Y       | Default scores (50 for unknown)
PlanCalendarComponent        | >1000 history records | Y        | Y       | Virtualized list / pagination
PlanSetupWizard              | Back button mid-step  | Y        | Y       | State preserved, no data loss
MurajahDB upgrade v5→v6     | Upgrade interrupted   | Y        | Y       | Plans unavailable, rest works
Task "Open Page" link        | Page outside QPC range| Y        | Y       | Redirect to closest valid page
```

---

## 7. Phased Implementation Plan

### Phase 1: Foundation (Core scheduling + data model)
**Goal:** Plan CRUD, SM-2 scheduler, weakness scorer — all with tests. No UI yet.

| Task | File | Est. Effort |
|------|------|-------------|
| MurajahDB v6 migration (add `plans` + `planHistory` stores) | `MurajahDB` class | Small |
| `weaknessScorer.js` — pure function, all weights, normalization | New file | Small |
| `planScheduler.js` — SM-2 algorithm, interval calc, beginner/hafiz modes | New file | Medium |
| `planManager.js` — createPlan, getActivePlan, generateDailyTasks, handleMissedDays, completePlan | New file | Medium |
| Unit tests: `weaknessScorer.test.js` (30+ cases) | New file | Small |
| Unit tests: `planScheduler.test.js` (40+ cases) | New file | Medium |
| Unit tests: `planManager.test.js` (40+ cases) | New file | Medium |
| Update `dailyGoalsManager.js` — if active plan exists, delegate task generation to planManager | Edit existing | Small |
| i18n keys for plan feature (all 3 locales) | Edit `en.json`, `ar.json`, `bn.json` | Small |

**Exit criteria:** 100% of scheduling logic covered by unit tests. No UI. `npm run test:unit` passes.

### Phase 2: Plan Setup + Today's Focus UI
**Goal:** User can create a plan and see today's tasks. Calendar is NOT in this phase.

| Task | File | Est. Effort |
|------|------|-------------|
| `PlanSetupWizard.js` — 3-step wizard component | New file | Medium |
| `PlanTodayCard.js` — daily summary with task list, page links, completion toggles | New file | Medium |
| Navigation integration — add Plan tab | Edit `index.html` | Small |
| "Open Page" integration — tap task → navigate to Quran page | Edit `index.html` | Small |
| "Listen" integration — tap → open audio at page | Edit `index.html` | Small |
| Empty state — no plan view + "Create Plan" CTA | Edit `index.html` | Small |
| E2E tests: `planSetup.spec.js` (wizard flow, validation, creation) | New file | Medium |
| E2E tests: `planScheduling.spec.js` (today card, task completion, streak) | New file | Medium |

**Exit criteria:** User can create plan, see today's tasks, complete tasks, navigate to Quran pages. E2E tests pass.

### Phase 3: Calendar + Rescheduling + Progress
**Goal:** Full calendar view, drag-drop rescheduling, milestone tracking, progress visualization.

| Task | File | Est. Effort |
|------|------|-------------|
| `PlanCalendarComponent.js` — week/month views, day expansion, drag-drop | New file | Large |
| `PlanProgressView.js` — milestones, cycle count, juz coverage heat map | New file | Medium |
| Drag-drop rescheduling logic in `planManager.js` | Edit existing | Medium |
| Missed day handling UI — "Welcome back" prompt, resume/restart | Edit `index.html` | Small |
| Plan health indicator (green/yellow/red) | Edit `PlanTodayCard.js` | Small |
| E2E tests: `planCalendar.spec.js` (navigation, drag-drop, week/month toggle) | New file | Medium |
| Performance testing — calendar with 180+ day records | Edit `planCalendar.spec.js` | Small |

**Exit criteria:** Full feature complete. All E2E tests pass. Performance acceptable on low-end devices.

### Phase 4: Polish + Quiz Integration + Hardening
**Goal:** Quiz feeds weakness data, celebrations, edge case hardening.

| Task | File | Est. Effort |
|------|------|-------------|
| Quiz → Plan data bridge (quiz scores update weakness scores) | Edit `quiz.html` + `planManager.js` | Medium |
| Milestone celebrations (toast + optional animation) | Edit `PlanProgressView.js` | Small |
| Plan export (share plan summary as text/image) | Edit `planManager.js` | Small |
| Accessibility audit (ARIA labels, keyboard nav for calendar) | Multiple files | Small |
| Performance audit (IndexedDB query optimization, memoization) | Multiple files | Medium |
| Regression test suite | Edit existing test files | Small |

**Exit criteria:** Feature production-ready. Health score ≥ 80/100.

---

## 8. QA Strategy & Test Plan

### 8A. Test Architecture

```
TEST PYRAMID:
                    ┌───────┐
                    │  E2E  │  ~25 tests (Playwright)
                    │ (slow)│  Critical user flows only
                   ┌┴───────┴┐
                   │  Integ  │  ~15 tests (Vitest)
                   │ (medium)│  Component + store interaction
                  ┌┴─────────┴┐
                  │   UNIT    │  ~110+ tests (Vitest)
                  │  (fast)   │  Pure logic, schedulers, scorers
                  └───────────┘

  TARGET COVERAGE: 80% statements, branches, functions, lines
  CURRENT BASELINE: 75% threshold (vitest.config.js)
```

### 8B. Unit Test Plan (Vitest)

#### `weaknessScorer.test.js` (~30 tests)
```
Category: Pure Function Tests
├── Input validation
│   ├── All inputs null/undefined → returns default score (50)
│   ├── Negative values → clamps to 0
│   ├── Values exceeding max → clamps to max
│   └── Empty mistakesMap → handled
├── Individual weight factors
│   ├── daysSinceReview: 0 → low score, 30 → high score, 60 → capped at max
│   ├── perfectRevisionRatio: 0→weak, 1→strong
│   ├── mistakeRatio: 0→strong, >0.5→very weak
│   ├── quizAccuracy: no quiz data → default 0.5
│   └── lowReviewCount: count<3 → penalty, count>=3 → no penalty
├── Composite scoring
│   ├── All perfect → score near 0
│   ├── All terrible → score near 100
│   ├── Mixed → score in 30-70 range
│   └── Weights sum to 1.0 (invariant test)
├── Edge cases
│   ├── Brand new page (no history) → score ~70 (conservative)
│   ├── Page reviewed today → daysSinceReview=0 factor
│   ├── Page with 100 reviews → high reviewCount, low penalty
│   └── Float precision → scores always 0-100 integer
└── Regression tests (added as bugs found)
```

#### `planScheduler.test.js` (~40 tests)
```
Category: SM-2 Algorithm Tests
├── calculateNextReview()
│   ├── First review (no history) → interval=1
│   ├── Performance=5 → interval increases, easeFactor increases
│   ├── Performance=0 → interval resets to 1, consecutiveCorrect=0
│   ├── Performance=3 (boundary) → interval increases (not reset)
│   ├── Performance=2 (boundary) → interval resets
│   ├── easeFactor never drops below 1.3
│   ├── Beginner: interval capped at 14 days
│   ├── Hafiz: interval capped at 21 days
│   └── 20 consecutive perfect reviews → stable high interval
├── generateDailyTasks() — Beginner mode
│   ├── Day 1: new memo + short-term revision (empty) + no weak
│   ├── Day 2: new memo + short-term (yesterday's page) + no weak
│   ├── Day 8: new memo + short-term (last 7 days) + long-term starts
│   ├── Backlog > 10 pages: new memo paused
│   ├── Off day: no tasks generated
│   ├── All pages memorized: only revision tasks
│   └── Budget overflow: priority ordering applied
├── generateDailyTasks() — Hafiz mode
│   ├── Normal day: revision pages sorted by overdue+weakness
│   ├── No overdue pages: pulls forward tomorrow's pages
│   ├── Weak reinforcement: top 3 weak pages added
│   ├── Juz balancing: detect imbalanced coverage, force catchup
│   ├── Cycle complete detection: all pages reviewed → new cycle
│   └── Off day: no tasks
├── handleMissedDays()
│   ├── 1 day missed → light reschedule
│   ├── 3 days missed → medium reschedule (50% new memo reduction)
│   ├── 7 days missed → heavy reschedule (new memo paused)
│   ├── 14+ days missed → plan reset state
│   ├── Overdue pages never exceed 2x normal daily load
│   └── endDate recalculated after reschedule
├── Edge cases
│   ├── 1 page in plan → always reviewed daily
│   ├── 604 pages in plan → proper chunking
│   ├── pace change mid-plan → recalculates everything
│   └── Date timezone handling (UTC vs local)
└── Determinism tests
    ├── Same inputs → same outputs (no randomness in scheduler)
    └── Order independence (pages sorted consistently)
```

#### `planManager.test.js` (~40 tests)
```
Category: Plan CRUD & Lifecycle Tests
├── createPlan()
│   ├── Beginner plan with valid inputs → correct shape
│   ├── Hafiz plan with full Quran → 604 pages, correct milestones
│   ├── Invalid inputs → throws with descriptive error
│   ├── Duplicate active plan → rejects with "already active" error
│   ├── Plan ID is unique (timestamp-based)
│   └── Milestones auto-generated (surah/juz boundaries)
├── getActivePlan()
│   ├── No plans → returns null
│   ├── One active → returns it
│   ├── One active + one completed → returns active only
│   └── Plan data corrupted → returns null + logs error
├── completePlan()
│   ├── Sets status to "completed"
│   ├── Backlog exists → rejects (can't complete with backlog)
│   ├── Already completed → no-op
│   └── Triggers milestone completion
├── pausePlan() / resumePlan()
│   ├── Pause → status changes, no tasks generated
│   ├── Resume after 3 days → triggers missed day handling
│   ├── Resume after 20 days → triggers plan reset prompt
│   └── Pause already paused → no-op
├── abandonPlan()
│   ├── Status changes to "abandoned"
│   ├── History preserved
│   └── New plan can be created after abandonment
├── updatePace()
│   ├── Valid pace change → endDate recalculated
│   ├── newPagesPerDay = 0 for beginner → error
│   ├── revisionPagesPerDay = 0 → error
│   └── Off days changed → future tasks regenerated
├── External memorization sync
│   ├── Page memorized outside plan → credited to plan
│   ├── Page unmarked outside plan → added back to queue
│   └── Sync runs on getActivePlan() (lazy detection)
└── Integration with dailyGoalsManager
    ├── Active plan → initializeTodayGoals delegates to planManager
    ├── No plan → original behavior preserved
    └── Plan paused → original behavior preserved
```

### 8C. E2E Test Plan (Playwright)

#### `planSetup.spec.js` (~10 tests)
```
├── Wizard renders on "Create Plan" click
├── Beginner flow: select type → choose surah → set pace → create
├── Hafiz flow: select type → choose "Full Quran" → set pace → create
├── Validation: can't proceed with 0 pages selected
├── Validation: beginner can't set 0 new pages/day
├── Pre-fill: existing memorized pages shown as pre-selected
├── Pace estimation: changing pace updates estimated completion date
├── Cancel wizard: no plan created, no data persisted
├── Plan created: redirects to Today's Focus view
└── Duplicate plan: shows "already have active plan" warning
```

#### `planScheduling.spec.js` (~8 tests)
```
├── Today card shows correct tasks for beginner (new + revision)
├── Today card shows correct tasks for hafiz (revision only)
├── Complete task: checkbox toggles, progress bar updates
├── Uncomplete task: reverts state
├── "Open Page" link navigates to correct Quran page
├── "Listen" opens audio player at correct page
├── Streak counter increments on full day completion
└── Plan health indicator: green when on track, yellow when behind
```

#### `planCalendar.spec.js` (~7 tests)
```
├── Calendar renders with current week highlighted
├── Navigate forward/backward weeks with arrows
├── Tap day → expands to show tasks
├── Completed days show green indicator
├── Missed days show red indicator
├── Off days show "Rest" label
└── Calendar performance: renders 6 months of data within 2s
```

### 8D. Coverage Targets

| Module | Statement | Branch | Function | Lines |
|--------|-----------|--------|----------|-------|
| `weaknessScorer.js` | 95% | 90% | 100% | 95% |
| `planScheduler.js` | 90% | 85% | 100% | 90% |
| `planManager.js` | 85% | 80% | 95% | 85% |
| Components (UI) | 75% | 70% | 80% | 75% |
| **Overall new code** | **85%** | **80%** | **90%** | **85%** |

### 8E. Health Score Projection

```
Post-Phase 1 (logic only):
  Health Score: 75/100
  - Tests pass:     25/30  (unit only, no E2E for new code yet)
  - Test coverage:  18/20  (pure functions → high coverage)
  - Critical bugs:  20/20  (no UI → no UI bugs)
  - Error handling: 8/15   (not yet stress-tested)
  - Edge cases:     10/15  (unit tests cover most)

Post-Phase 3 (feature complete):
  Health Score: 85/100
  - Tests pass:     30/30  (all passing)
  - Test coverage:  16/20  (80%+ across all new code)
  - Critical bugs:  18/20  (1-2 minor bugs expected)
  - Error handling: 12/15  (comprehensive for new paths)
  - Edge cases:     12/15  (drag-drop edge cases are hard to test)
```

---

## 9. Code Review: Integration Points

### 9A. Files That Must Be Edited (Existing)

| File | Change | Risk |
|------|--------|------|
| `MurajahDB` class (in `index.html`) | Add v6 migration, `savePlan()`, `loadPlan()`, `savePlanDay()`, `loadPlanHistory()` | Medium — DB migration must be backward-compatible |
| `dailyGoalsManager.js` | Add plan-awareness: if active plan, delegate to `planManager.generateDailyTasks()` | Low — additive change, original path preserved |
| `index.html` | Add Plan tab navigation, mount plan components, wire up plan store | Medium — large file, risk of merge conflicts |
| `en.json` / `ar.json` / `bn.json` | Add `plan.*` keys (~50 keys per locale) | Low — additive |
| `sw.js` | Cache new JS files | Low — append to pre-cache list |
| `logger.js` | Add `PLAN` module constant | Trivial |
| `calculations.js` | Add `getJuzPagesInRange(juzNum)` → returns pages 1-20 for juz 1, etc. | Low — pure function addition |

### 9B. Critical Integration: dailyGoalsManager Bridge

```javascript
// In dailyGoalsManager.js — PROPOSED CHANGE:
//
// BEFORE (current):
//   initializeTodayGoals() always generates static 4 tasks
//
// AFTER:
//   initializeTodayGoals() checks for active plan first

export function initializeTodayGoals(settings, memorizedPages, lastDailyGoal, activePlan = null) {
  // NEW: If plan is active, delegate task generation
  if (activePlan && activePlan.status === 'active') {
    return initializePlanTodayGoals(activePlan, memorizedPages, lastDailyGoal, settings);
  }

  // EXISTING: Original behavior preserved exactly
  const today = getTodayDate();
  // ... (no changes to existing code)
}
```

**Key principle:** New parameter is optional with default `null`. ALL existing callers continue to work without changes. Zero risk of regression.

### 9C. Security Considerations

| Threat | Likelihood | Impact | Mitigation |
|--------|-----------|--------|------------|
| IndexedDB data tampering (dev tools) | Low | Low | Client-only app; no server to protect. User can only harm their own data. |
| Plan data exceeds IndexedDB quota | Low | Medium | Cap plan history to 365 days. Prune on plan completion. |
| XSS via plan name (user input) | Medium | Medium | Sanitize plan name: strip HTML, max 100 chars. Use `textContent` not `innerHTML`. |
| Prototype pollution via plan import | Low | High | If plan import/export is added later: validate schema strictly, use `Object.create(null)`. |

### 9D. Performance Concerns

| Operation | Concern | Target | Mitigation |
|-----------|---------|--------|------------|
| `generateDailyTasks()` | Iterates all plan pages with SM-2 data | < 50ms for 604 pages | Pre-sorted arrays, no nested loops |
| `weaknessScorer.calculate()` for all pages | Called on plan load | < 100ms for 604 pages | Batch calculate, memoize until data changes |
| Calendar render (6 months) | 180+ day records from IndexedDB | < 200ms initial render | Paginate: load current week + 2 future weeks. Lazy-load on scroll. |
| IndexedDB reads on app open | Load active plan + today's record | < 50ms | Single transaction, compound index on [planId, date] |
| Plan history growth | 365 days × 1 record = ~365 objects | < 500KB total | Each record ~1.5KB. Well within IndexedDB limits. |

---

## 10. Retro Insights: Risk & Post-Launch

### 10A. Recent Development Patterns (Last 30 Days)

From git history analysis:
- **Ship velocity:** ~20 commits in 30 days = solid pace
- **Focus areas:** Audio system (page-by-page), navigation UX, PWA stability
- **Code hotspots:** `index.html` (141 of 30 commits touch it) — this is the #1 risk for the plan feature
- **Removed features:** Achievement/badge system was removed (simplification) — good precedent for avoiding bloat
- **Test discipline:** Tests added with every feature (touchHelper, pageAudio, MurajahDB, settings)

### 10B. Risk Assessment

```
RISK MATRIX:

                          IMPACT
                    Low         High
              ┌───────────┬───────────┐
  LIKELIHOOD  │ Calendar  │ index.html│
    High      │ perf on   │ merge     │
              │ low-end   │ conflicts │
              ├───────────┼───────────┤
              │ i18n      │ SM-2      │
    Low       │ missing   │ algorithm │
              │ keys      │ edge case │
              └───────────┴───────────┘

TOP 3 RISKS:

1. index.html merge conflicts
   Probability: 90%
   Mitigation: Extract plan UI into components early.
   Keep index.html changes minimal (mount points + imports only).

2. SM-2 tuning requires iteration
   Probability: 70%
   Mitigation: Log all scheduling decisions. Build admin/debug
   view to visualize intervals. Make weights configurable (Phase 4).

3. Calendar performance on mobile
   Probability: 50%
   Mitigation: Virtual scrolling. Render only visible week.
   Test on low-end Android (Chrome 90+) in Phase 3.
```

### 10C. Post-Launch Monitoring

```
METRICS TO TRACK (via console + localStorage):

1. Plan creation rate
   - How many users create a plan within first session?
   - Beginner vs Hafiz split

2. Plan retention (most important)
   - Day 1, Day 7, Day 30 active rate
   - Median streak length before drop-off
   - % of plans that reach completion vs abandonment

3. Scheduling accuracy
   - % of days where user completes all tasks
   - Average overdue backlog size
   - Reschedule frequency

4. Feature integration
   - % of "Open Page" link clicks (do users use the quick-jump?)
   - % of "Listen" clicks (do users use audio from plan?)
   - % of "Quiz" clicks from weak area card

5. Performance
   - Time to generate daily tasks (p50, p95, p99)
   - Calendar render time
   - IndexedDB query time for plan data

IMPLEMENTATION:
  Use existing Logger module with PLAN module tag.
  In Phase 4: Add optional analytics event layer.
```

### 10D. Retrospective Predictions

| What We Think Will Happen | What Might Actually Happen | Hedge |
|--------------------------|---------------------------|-------|
| Users want weekly calendar view | Users might prefer daily-only "just tell me what to do today" | Today's Focus Card is the default view; calendar is opt-in |
| SM-2 will produce good intervals | Intervals might be too aggressive or too relaxed for Quran specifically | All SM-2 parameters are configurable; can tune post-launch |
| Beginner/Hafiz split is binary | Some users are Hafiz for some Juz, beginner for others | Phase 5 consideration: per-Juz mode. For now, use primary mode. |
| Drag-drop rescheduling is wanted | Users might rarely reschedule (just complete or miss) | Build drag-drop in Phase 3, monitor usage. If <5% use it, simplify in Phase 5. |
| 30 days per cycle is good default | Different users have wildly different capacities | Pace is fully configurable in wizard. Provide 3 presets: Light (60 days), Standard (30), Intensive (15). |

### 10E. 6-Month Improvement Roadmap

```
MONTH 1-2 (Post-launch):
  → Collect usage data
  → Fix SM-2 tuning issues
  → Address top 3 user complaints

MONTH 3-4:
  → Quiz integration (Phase 4)
  → Speech recognition experiment (feasibility)
  → Plan sharing (export as image/text)

MONTH 5-6:
  → Multi-plan support (different Juz with different modes)
  → Teacher mode (create plan for students)
  → Cloud sync exploration (optional — currently fully offline)
```

---

## 11. NOT in Scope

| Item | Rationale |
|------|-----------|
| Cloud sync / server-side storage | App is client-only PWA. Adding server = entirely different architecture. Defer to 6-month roadmap. |
| Social features (group plans, accountability partners) | Cool but requires server. Not aligned with "distraction-free" philosophy. |
| Speech recognition grading | Requires ML model (Whisper/Tarteel). Exploratory, not production-ready. |
| Google/Apple Calendar sync | Requires OAuth + server. Defer. |
| Multi-plan support | V1 supports 1 active plan at a time. Architecture supports multiple (plan ID on everything). |
| Teacher dashboard | Requires multi-user support. Defer. |
| Custom notification/reminder system | PWA push notifications require server-side push infrastructure. Defer. |
| Gamification (XP, levels, badges) | Achievement system was intentionally removed. Avoid re-adding complexity. |
| Per-ayah granularity | Pages are the atomic unit. Matching existing architecture. |
| Indopak layout support for plans | Indopak has 610 pages vs QPC 604. Add after core plan works with QPC. |

---

## 12. TODO Registry

| ID | What | Why | Depends On | Priority |
|----|------|-----|------------|----------|
| T1 | Fix audio `no-cors` bug (A1) BEFORE plan feature | Plan's "Listen" links will fail if audio is broken | Nothing | P0 — Pre-requisite |
| T2 | Fix QuranAudioPlayer listener leak (A6) | Plan → audio navigation will leak memory | Nothing | P0 — Pre-requisite |
| T3 | Fix streak calculation edge case (U1) | Plan streak display will show wrong count | Nothing | P1 — Fix in Phase 1 PR |
| T4 | Indopak layout plan support | 610 pages vs 604, different page mapping | Phase 3 complete | P2 — Phase 5 |
| T5 | Multi-plan support | Users with partial Hifz want per-Juz plans | Phase 3 complete | P2 — Phase 5 |
| T6 | Quiz → Plan score data bridge | Quiz results should update weakness scores | Phase 2 complete | P1 — Phase 4 |
| T7 | SM-2 parameter tuning dashboard | Debug view for reviewing scheduling decisions | Phase 1 complete | P2 — Phase 4 |
| T8 | Plan data export/import | Backup/share functionality | Phase 3 complete | P3 — Phase 4+ |
| T9 | Accessibility audit for calendar | Keyboard navigation, screen reader support | Phase 3 complete | P1 — Phase 4 |
| T10 | Performance optimization: memoize weakness scores | Called on every plan load; batch + cache | Phase 1 complete | P2 — Phase 3 |

---

## Appendix A: Quick Reference — Key Technical Decisions

| Decision | Choice | Alternative Considered | Why This Choice |
|----------|--------|----------------------|-----------------|
| Scheduling algo | Modified SM-2 | Simple rotation (existing), Leitner boxes, Anki's FSRS | SM-2 is well-understood, battle-tested, easy to implement and tune. FSRS is better but complex; can upgrade later. |
| Storage | IndexedDB (existing) | localStorage, SQLite (via WASM) | IndexedDB already used everywhere. Adding SQLite = new dependency + WASM bundle size. |
| 1 active plan | Hard limit | Allow multiple | Simplicity. Architecture uses planId everywhere so upgrading is easy. |
| Page-based | Pages as atomic unit | Ayah-based, word-based | Matches all existing features: memorizedPages, perfectRevisions, audio, quiz. |
| Off-days | User configurable | No off-days, auto-detect | Muslim users typically take Friday lighter. Configurability covers all cases. |
| Calendar library | Custom (no dependency) | FullCalendar, DayPilot | App uses zero npm runtime deps (CDN-loaded Vue/Tailwind). Adding a calendar lib breaks the pattern. |
| Weakness weights | Fixed (v1), configurable (v2) | User-adjustable from day 1 | Avoid paradox of choice. Ship with research-backed defaults, add tuning later. |

---

## Appendix B: i18n Key Structure

```json
{
  "plan": {
    "title": "My Plan",
    "create": "Create a Plan",
    "setup": {
      "step1Title": "Choose Your Path",
      "beginner": "I'm actively memorizing",
      "hafiz": "I've completed the Quran",
      "step2Title": "Select Scope",
      "step3Title": "Set Your Pace",
      "estimatedCompletion": "Estimated completion: {date}",
      "createButton": "Create Plan"
    },
    "today": {
      "title": "Today's Plan",
      "dayN": "Day {n}",
      "newMemo": "New Memorization",
      "revision": "Revision",
      "weakArea": "Weak Area",
      "openPage": "Open Page",
      "listen": "Listen",
      "quiz": "Quiz",
      "progress": "{completed} of {total} tasks",
      "streak": "{n} day streak",
      "health": {
        "onTrack": "On track",
        "slightlyBehind": "Slightly behind",
        "needsAttention": "Needs attention"
      }
    },
    "calendar": {
      "title": "Calendar",
      "weekView": "Week",
      "monthView": "Month",
      "restDay": "Rest Day",
      "noTasks": "No tasks",
      "preview": "Preview — tasks may change"
    },
    "progress": {
      "title": "Progress",
      "cycle": "Revision Cycle {n}",
      "milestone": "Milestone",
      "completed": "Plan Completed!"
    },
    "status": {
      "active": "Active",
      "paused": "Paused",
      "completed": "Completed",
      "abandoned": "Abandoned"
    },
    "actions": {
      "pause": "Pause Plan",
      "resume": "Resume Plan",
      "abandon": "Abandon Plan",
      "changePace": "Change Pace"
    },
    "missed": {
      "welcomeBack": "Welcome back!",
      "missedDays": "You missed {n} days",
      "rescheduling": "Rescheduling your plan...",
      "resume": "Resume Plan",
      "restart": "Start Fresh"
    }
  }
}
```

---

*End of Design Document. Ready for implementation pending approval of Phases 1-4.*
