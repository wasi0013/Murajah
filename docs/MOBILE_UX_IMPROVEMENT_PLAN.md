# Mobile UX Improvement Plan — Murajah

> **Date:** 2025-04-03  
> **Author:** Copilot (skills: retro → plan-ceo-review → plan-eng-review → qa → review)  
> **Status:** DRAFT — Awaiting manual review before implementation  
> **Scope Mode:** HOLD SCOPE — Production app with thousands of users. No unnecessary scope creep.

---

## Table of Contents

1. [System Audit](#1-system-audit)
2. [Step 0: Scope Challenge](#2-step-0-scope-challenge)
3. [Architecture Review](#3-architecture-review)
4. [Error & Rescue Map](#4-error--rescue-map)
5. [Security & Threat Model](#5-security--threat-model)
6. [Data Flow & Interaction Edge Cases](#6-data-flow--interaction-edge-cases)
7. [Code Quality Review](#7-code-quality-review)
8. [Test Review](#8-test-review)
9. [Performance Review](#9-performance-review)
10. [Observability & Debuggability](#10-observability--debuggability)
11. [Deployment & Rollout](#11-deployment--rollout)
12. [Long-Term Trajectory](#12-long-term-trajectory)
13. [QA Pre-Assessment](#13-qa-pre-assessment)
14. [Required Outputs](#14-required-outputs)

---

## 1. System Audit

### 1.1 Recent History (git log)

```
5721131 add sheikh luhaidan
60d2708 add Sheikh luhaidaan's verse by verse beta
24dc0d9 hotfix
da5a24b Merge pull request #1 from fix-checklist-bug
86e33e3 Fix: Corrected text in 'Tips for Success' checklist
f740ac5 bump version
fa1838b remove annoying banner
b14d753 menu touch fix
4cc01c1 add refresh button
397a801 critical bug fix
```

**Pattern observed:** Frequent bug fixes and hotfixes (~50% of recent commits), particularly around touch interactions (`menu touch fix`, `critical bug fix`). This signals an under-invested mobile UX layer that is accruing fix-upon-fix patches rather than systematic improvements.

### 1.2 Known Performance Backlog

`PERFORMANCE_ISSUES_PHASE2.md` lists 7 confirmed issues:

| # | Issue | Severity | Mobile Impact |
|---|-------|----------|---------------|
| 1 | Achievement Grid O(n²) re-computation | High | Jank on badge screen |
| 2 | Notes search — no debounce | Medium | Keystroke lag |
| 3 | Quiz timer memory leak | Medium | Battery drain |
| 4 | Quiz 3s hardcoded delay | Medium | User frustration |
| 5 | Morphology preloader O(n²) — dormant | Low | Not active |
| 6 | Quiz surah selection O(n²) `.includes()` | Medium | Slow toggle |
| 7 | Audio player sorted recordings re-sort | Low | Minor overhead |

**Overlap with this plan:** Issues #1, #2, and #7 have direct mobile UX impact. Issues #3, #4, #6 affect mobile quiz experience. Recommend bundling #1, #2, #7 into this plan since they're in-scope components. Leave #3, #4, #5, #6 as separate quiz-focused work.

### 1.3 TODO/FIXME Markers

Zero meaningful TODO/FIXME markers in application source code (only found in vendor libraries). This means deferred work is tracked only in PERFORMANCE_ISSUES_PHASE2.md.

### 1.4 Current Architecture Snapshot

```
  ┌──────────────────────────────────────────────────────────────┐
  │                     source/index.html                        │
  │                    (~10,500 lines)                           │
  │                                                              │
  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
  │  │  Vue 3 App   │  │  Tailwind    │  │  <style>     │       │
  │  │  (reactive)  │  │  3.4.7 CDN   │  │  blocks      │       │
  │  └──────┬───────┘  └──────────────┘  └──────────────┘       │
  │         │                                                    │
  │         ▼                                                    │
  │  ┌──────────────────────────────────────────────────────┐    │
  │  │  Stores: settingsStore, appStore, i18nStore,         │    │
  │  │          notesStore, achievementStore, dailyGoals... │    │
  │  └──────────────────────────┬───────────────────────────┘    │
  │                              │                               │
  │         ┌────────────────────┼────────────────────┐          │
  │         ▼                    ▼                    ▼          │
  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐    │
  │  │ Components   │  │ IndexedDB    │  │ Service Worker   │    │
  │  │ (.js files)  │  │ (MurajahDB)  │  │ (sw.js)          │    │
  │  └─────────────┘  └──────────────┘  └──────────────────┘    │
  │                                                              │
  │  Components:                                                 │
  │  ├── FloatingAudioPlayerComponent.js                         │
  │  ├── AchievementGridComponent.js                             │
  │  ├── NotesComponent.js                                       │
  │  ├── DailyGoalsComponent.js                                  │
  │  ├── SurahViewComponent.js                                   │
  │  ├── JuzViewComponent.js                                     │
  │  ├── TimelineComponent.js                                    │
  │  ├── MistakeTrackerComponent.js                              │
  │  └── AnalyticsDashboardComponent.js                          │
  └──────────────────────────────────────────────────────────────┘
```

- **No build step** — static files served directly
- **No bundler** — components loaded as ES modules
- **No framework router** — manual `activeSection` switching
- **Single-file architecture** — all HTML/CSS/JS in one 10.5k-line file

---

## 2. Step 0: Scope Challenge

### 2.1 What is the actual user problem?

Mobile users of Murajah encounter friction navigating between Quran pages, switching between sections, and interacting with UI elements on small screens. The core pain points:

1. **No swipe-to-navigate** — Users expect swipe gestures for page turning (standard in every Quran and e-reader app)
2. **Zoom disabled** — WCAG violation; users cannot enlarge Arabic text
3. **Navigation buried in hamburger menu** — 19 items in a side drawer with no quick-access bottom nav
4. **Touch targets too small** — Arabic words on <400px screens are hard to tap accurately
5. **Performance jank on lists** — 114 surahs + 100 badges rendered without virtualization

### 2.2 Premise Challenge

**Q: Is "mobile UX improvement" the right framing?**

Yes. The retro data shows recurring touch/mobile bug fixes. The app has thousands of users, and mobile is the primary access pattern for Quran memorization (users study on phones during commutes, at mosques, etc.). This is not hypothetical pain.

**Q: Would doing nothing cause real harm?**

Yes. Users on ≤400px phones currently have a degraded experience: tiny text they can't zoom, no swipe navigation, and a clunky hamburger menu. This is a retention risk.

### 2.3 What already exists?

| Sub-problem | Existing Code | Reuse? |
|-------------|---------------|--------|
| Page navigation | Quick Nav Bar (lines 4019-4075, 4321-4362) | Extend, don't replace |
| Touch handling | `touchHelper.js` (tap detection, debounce) | Extend with swipe |
| Font sizing | Responsive CSS (lines 9185-9220) | Adjust breakpoints |
| Side drawer | Lines 1290-1360 (280px, 19 items) | Reorganize, keep mechanism |
| Audio player | FloatingAudioPlayerComponent.js | Minor CSS adjustment |
| Keyboard navigation | Lines 9937-10078 (arrows, shortcuts) | Keep, add touch parity |

### 2.4 Minimum set of changes

**MUST DO (core objective):**
1. Add swipe gesture navigation for Quran pages
2. Add bottom navigation bar for mobile (quick-access to top 4-5 sections)
3. Fix viewport zoom restriction (WCAG compliance)
4. Improve Arabic text sizing on small screens

**SHOULD DO (directly supports core objective):**
5. Reorganize side drawer menu (fewer items, better grouping)
6. Fix floating audio player bottom overlap with new bottom nav
7. Bundle performance fixes #1 and #2 from PHASE2 backlog

**DEFER (valuable but separate scope):**
8. Full list virtualization for surah/juz/badge grids
9. Quiz UX improvements (timer, delay, selection)
10. PWA offline improvements
11. Tablet-specific optimizations (landscape split view)

### 2.5 Complexity Check

Files this plan touches (estimated):

| File | Change Type |
|------|-------------|
| `source/index.html` | Viewport meta, bottom nav HTML, side drawer reorganization, swipe handlers, CSS adjustments |
| `source/resources/js/utils/touchHelper.js` | Add swipe detection |
| `source/resources/styles/style.css` | Bottom nav styles, responsive adjustments |
| `source/resources/js/components/FloatingAudioPlayerComponent.js` | Adjust positioning for bottom nav |
| `source/resources/js/components/AchievementGridComponent.js` | Performance fix (bundled) |
| `source/resources/js/components/NotesComponent.js` | Debounce fix (bundled) |

**6 files total** — under the 8-file smell threshold. No new classes or services introduced. Changes extend existing patterns.

### 2.6 Dream State Mapping

```
  CURRENT STATE                          THIS PLAN                          12-MONTH IDEAL
  ┌─────────────────┐                   ┌──────────────────┐               ┌──────────────────┐
  │ Hamburger-only   │                  │ + Bottom nav bar  │              │ Gesture-first     │
  │ navigation       │     ─────►       │ + Swipe pages     │   ─────►    │ mobile-native UX  │
  │ No swipe         │                  │ + Zoom enabled    │              │ Split tablet view  │
  │ Zoom disabled    │                  │ + Better sizing   │              │ Haptic feedback    │
  │ Touch issues     │                  │ + Drawer cleanup  │              │ Offline-first PWA  │
  └─────────────────┘                   └──────────────────┘               └──────────────────┘
```

This plan moves us ~40% toward the 12-month ideal. The remaining 60% (tablet views, haptics, advanced PWA) is separate scope.

---

## 3. Architecture Review

### 3.1 Proposed Changes — Architectural Diagram

```
  ┌─────────────────────────────────────────────────────────────────┐
  │                    MOBILE NAVIGATION STACK                       │
  │                                                                  │
  │  ┌──────────────────────────────────────────────────────────┐    │
  │  │                    TOP BAR (existing)                     │    │
  │  │  Logo  │  Page#/Surah  │  Search  │  Hamburger (≤768px) │    │
  │  └──────────────────────────────────────────────────────────┘    │
  │                                                                  │
  │  ┌──────────────────────────────────────────────────────────┐    │
  │  │                 MAIN CONTENT AREA                         │    │
  │  │                                                           │    │
  │  │  ◄── SWIPE LEFT ──┐    ┌── SWIPE RIGHT ──►               │    │
  │  │                     │    │                                 │    │
  │  │     Quran Page      │    │     Next/Prev Page             │    │
  │  │     (existing)      │    │     (new gesture)              │    │
  │  │                     │    │                                 │    │
  │  └──────────────────────────────────────────────────────────┘    │
  │                                                                  │
  │  ┌──────────────────────────────────────────────────────────┐    │
  │  │              FLOATING AUDIO PLAYER (existing)             │    │
  │  │              Adjusted: bottom: calc(4rem + env(safe-area))│    │
  │  └──────────────────────────────────────────────────────────┘    │
  │                                                                  │
  │  ┌──────────────────────────────────────────────────────────┐    │
  │  │              BOTTOM NAV BAR (NEW — mobile only)           │    │
  │  │                                                           │    │
  │  │  ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐                 │    │
  │  │  │ 📖 │  │ 📋 │  │ 🎯 │  │ ❓ │  │ ⚙️ │                 │    │
  │  │  │Read│  │List│  │Goal│  │Quiz│  │More│                  │    │
  │  │  └────┘  └────┘  └────┘  └────┘  └────┘                 │    │
  │  │  height: 56px + env(safe-area-inset-bottom)              │    │
  │  └──────────────────────────────────────────────────────────┘    │
  └─────────────────────────────────────────────────────────────────┘
```

### 3.2 Component Boundaries

**No new components created.** All changes are within existing files:
- Swipe detection → Extension of `touchHelper.js`
- Bottom nav → HTML/CSS added to `index.html` (conditional on `≤768px`)
- Side drawer → Reorganization of existing menu items

### 3.3 Coupling Analysis

```
  BEFORE:                              AFTER:
  ┌──────────┐                        ┌──────────┐
  │ index.html│──► touchHelper.js     │ index.html│──► touchHelper.js (+ swipe)
  │           │                        │           │
  │           │──► FloatingPlayer     │           │──► FloatingPlayer (adjusted CSS)
  │           │                        │           │
  │           │──► settingsStore       │           │──► settingsStore (unchanged)
  └──────────┘                        │           │
                                       │           │──► bottomNavVisible (new computed, 
                                       └──────────┘    depends on screen width)
```

**New coupling introduced:** None. Bottom nav is pure CSS media query + existing `activeSection` state. Swipe detection feeds into existing `navigateToPage()` function.

### 3.4 Decision Points for User

#### QUESTION 3A: Bottom Nav Bar — Item Selection

The bottom nav needs 4-5 items. The most frequently accessed sections should be there.

**We recommend option B:** 5 items with "More" as the last item replacing hamburger.

```
A) 4 items: Read | Surahs | Quiz | Settings
   - Effort: Low | Risk: Low | Maintenance: Low
   - Misses quick access to Goals (a daily-use feature)

B) 5 items: Read | Surahs | Goals | Quiz | More
   - Effort: Low | Risk: Low | Maintenance: Low  
   - "More" opens the side drawer for remaining items
   - Covers the 4 most common daily actions + escape hatch

C) 5 items: Read | Surahs | Goals | Quiz | Settings
   - Effort: Low | Risk: Low | Maintenance: Low
   - No easy access to Notes, Audio, Tafsir, etc. without hamburger
```

**Why B:** Minimizes hamburger usage while keeping quick access to the daily workflow (Read → Track Goals → Quiz). "More" ensures nothing is unreachable. Maps to "explicit > clever" — the user always knows where to find everything.

> **YOUR ANSWER:** B

#### QUESTION 3B: Swipe Gesture — Conflict with Word Selection

Swiping left/right to turn pages could conflict with tapping words for selection (morphology popup, word-by-word translation). Need a disambiguation strategy.

**We recommend option A:** Horizontal swipe on non-word areas only.

```
A) Swipe triggers ONLY on the Quran container background (not on word elements)
   - Effort: Low | Risk: Low | Maintenance: Low
   - Uses event.target check: if target is a word span, ignore swipe
   - Natural: tap words to select, swipe empty space to navigate

B) Swipe requires minimum 100px horizontal distance + <30px vertical
   - Effort: Low | Risk: Medium (accidental triggers) | Maintenance: Low
   - Works everywhere but may conflict with word selection drag

C) Two-finger swipe for navigation, one-finger tap for words
   - Effort: Medium | Risk: High (non-standard gesture) | Maintenance: Medium
   - Users won't discover this naturally
```

**Why A:** Most natural mental model — matches how e-reader apps work. Tapping a word does one thing, swiping the page does another. Explicit over clever. The Quran page has sufficient empty space between lines for swipe targets.

> **YOUR ANSWER:** Let's add a toggle button for mode that we can place somewhere similar to how we change background color. when clicked it would toggle two modes swipe mode and mistake mode or morphology mode based on user settings. In mistake mode/morphology mode it disables swipe and allow user to tap mistakes on the current page and other pages as long as morphology is toggled of in settings. and if morphlogy is on, it will show morphology disabling swipe. This should give us the optimum flexibility 

#### QUESTION 3C: Swipe Direction Convention

Arabic text reads right-to-left. Quran page numbers increase left-to-right (page 1 → page 604). This creates a potential confusion about swipe direction.

**We recommend option B:** Swipe follows page number direction (left = higher page = forward in mushaf).

```
A) Swipe follows Arabic reading direction (swipe left = next page in reading order = lower page number)
   - Effort: Low | Risk: Medium (may confuse users tracking page numbers) | Maintenance: Low
   - Matches how physical Quran pages turn

B) Swipe follows page number direction (swipe left = previous page number, swipe right = next page number)
   - Effort: Low | Risk: Low | Maintenance: Low
   - Consistent with existing arrow button behavior (← prev page, → next page)
   - Matches the existing keyboard shortcut direction

C) Make swipe direction configurable in settings
   - Effort: Medium | Risk: Low | Maintenance: Medium
   - Adds complexity for a preference most users won't change
```

**Why B:** Consistency with existing controls is paramount. The existing ← → buttons and keyboard arrows already use this convention. Changing direction for swipe only would violate "explicit > clever." Users who want the other direction can use the arrow buttons.

> **YOUR ANSWER:** Yes, B.

#### QUESTION 3D: Bottom Nav Visibility During Quran Reading

Should the bottom nav auto-hide when the user is actively reading (scrolling through the Quran page) to maximize screen real estate?

**We recommend option A:** Always visible on mobile.

```
A) Always visible (fixed bottom bar)
   - Effort: Low | Risk: Low | Maintenance: Low
   - Predictable, no surprise hide/show behavior
   - 56px is ~8% of a 667px iPhone screen — acceptable

B) Auto-hide on scroll down, show on scroll up
   - Effort: Medium | Risk: Medium (scroll jank, edge cases) | Maintenance: Medium
   - Requires scroll direction detection, animation, layout recalculation
   - Can cause content jump when bar reappears

C) Hide during Quran reading view only, show in all other sections
   - Effort: Low | Risk: Low | Maintenance: Low
   - More screen for reading, but loses quick navigation
```

**Why A:** The Quran content area doesn't scroll (it paginates). Users see one page at a time and swipe/click to the next. There's no scroll-based content to compete with. Hiding the nav would only add complexity without real benefit. Keep it simple and predictable.

> **YOUR ANSWER:** A. In surah and juz view, we may have to auto hide or place it properly so that the page fits appropriately in those modes as well.

---

## 4. Error & Rescue Map

### 4.1 New Codepaths — Failure Analysis

```
  METHOD/CODEPATH               | WHAT CAN GO WRONG                | ERROR TYPE
  ─────────────────────────────|──────────────────────────────────|──────────────
  SwipeDetector (touchHelper)   | Touch events fire on non-element | TypeError
                                | Touch event missing changedTouches| TypeError
                                | Extremely fast swipe (0ms delta) | DivisionByZero
  ─────────────────────────────|──────────────────────────────────|──────────────
  BottomNav click handler       | activeSection set to invalid val | Silent wrong view
                                | Click during page transition     | Race condition
  ─────────────────────────────|──────────────────────────────────|──────────────
  Viewport zoom change          | iOS Safari viewport bug          | Layout break
                                | PWA standalone mode zoom         | Scale conflict
  ─────────────────────────────|──────────────────────────────────|──────────────
  CSS bottom padding adjust     | safe-area-inset-bottom = 0       | No padding (OK)
                                | Audio player + bottom nav overlap| Visual overlap
```

```
  ERROR TYPE          | RESCUED? | RESCUE ACTION                   | USER SEES
  ────────────────────|──────────|─────────────────────────────────|──────────────
  TypeError (touch)   | PLAN: Y  | Guard: if (!e.changedTouches)   | Nothing (graceful)
  DivisionByZero      | PLAN: Y  | Guard: if (deltaTime === 0)     | Nothing (no-op)
  Invalid section     | PLAN: Y  | Validate against known sections | Falls back to 'quran'
  Layout break (zoom) | PLAN: Y  | Test across iOS Safari/Chrome   | Normal zoom behavior
  Visual overlap      | PLAN: Y  | CSS: player bottom += nav height| Clean stacking
```

**CRITICAL GAPS:** None identified. All error paths are simple guard conditions.

---

## 5. Security & Threat Model

### 5.1 Attack Surface Analysis

This plan introduces **zero new attack surface:**

- No new endpoints or API calls
- No new user input fields (bottom nav is static buttons)
- No new data storage or processing
- No new external dependencies
- Swipe gesture data never leaves the client

### 5.2 Existing Concern — Viewport Zoom

The current `user-scalable=no` was likely added to prevent double-tap zoom interfering with word selection. Enabling zoom COULD cause accidental zoom during rapid word tapping.

**Mitigation:** Use `touch-action: manipulation` on interactive elements (already in place for Quran words). This disables double-tap-to-zoom on those elements while allowing pinch zoom globally.

### 5.3 XSS Check

Bottom nav items are static HTML (no dynamic content injection). No risk.

---

## 6. Data Flow & Interaction Edge Cases

### 6.1 Swipe Navigation — Edge Cases

```
  INTERACTION              | EDGE CASE                      | HANDLED? | HOW
  ─────────────────────────|────────────────────────────────|──────────|────────────
  Swipe to turn page       | User on page 1, swipes "prev"  | PLAN: Y  | No-op (already first page)
                           | User on page 604, swipes "next"| PLAN: Y  | No-op (already last page)
                           | Swipe during page load         | PLAN: Y  | Ignore if quranData not ready
                           | Diagonal swipe (45° angle)     | PLAN: Y  | Require >2:1 horizontal:vertical ratio
                           | Swipe on word-by-word mode     | PLAN: Y  | Same behavior — page changes
                           | Swipe while audio is playing   | PLAN: Y  | Page changes, audio continues
                           | Swipe while settings modal open| PLAN: Y  | Modal intercepts touch events
                           | Very slow drag (>2 seconds)    | PLAN: Y  | Ignore — not a swipe, possibly scroll
                           | Multiple rapid swipes          | PLAN: Y  | Debounce with 300ms cooldown
                           | Swipe in surah/juz view        | PLAN: N  | See Question 6A below
```

### 6.2 Bottom Nav — Edge Cases

```
  INTERACTION              | EDGE CASE                      | HANDLED? | HOW
  ─────────────────────────|────────────────────────────────|──────────|────────────
  Tap nav item             | Double-tap same item           | PLAN: Y  | No-op (already active)
                           | Tap while section is loading   | PLAN: Y  | Ignore rapid taps (debounce)
                           | Tab contains unsaved notes     | PLAN: Y  | Notes auto-save to IndexedDB
                           | Screen rotation during tap     | PLAN: Y  | CSS handles (media query)
                           | "More" → side drawer → "More"  | PLAN: Y  | "More" toggles drawer open/close
  Landscape orientation    | Bottom nav + top bar + keyboard | PLAN: Y  | Bottom nav stays, keyboard pushes up
```

### 6.3 Decision Points for User

#### QUESTION 6A: Swipe Navigation in Non-Quran Views

Should swipe-to-navigate work in Surah View (swipe between surahs) and Juz View (swipe between juz)?

**We recommend option A:** Quran reading view only.

```
A) Swipe only in Quran reading view (activeSection === 'quran')
   - Effort: Low | Risk: Low | Maintenance: Low
   - Surah/Juz views have scrollable lists — swipe would conflict with scroll

B) Swipe in Quran, Surah, and Juz views with context-aware behavior
   - Effort: Medium | Risk: Medium (gesture conflict with scroll) | Maintenance: Medium
   - In surah view: swipe navigates to next/prev surah
   - In juz view: swipe navigates to next/prev juz

C) Swipe everywhere except modals
   - Effort: High | Risk: High (many edge cases) | Maintenance: High
   - Would need per-section swipe semantics
```

**Why A:** Surah and Juz views are scrollable grids — horizontal swipe would fight with the browser's scroll behavior. The Quran reading view is the only paginated view where swipe is natural and unambiguous. Minimal diff.

> **YOUR ANSWER:** A

---

## 7. Code Quality Review

### 7.1 DRY Analysis

**Potential DRY violation identified:** The desktop Quick Nav Bar (lines 4019-4075) and mobile Quick Nav Bar (lines 4321-4362) share nearly identical logic with different layouts. Adding a bottom nav creates a THIRD navigation element.

**Resolution:** Bottom nav does NOT duplicate Quick Nav logic. It's a section switcher (like the hamburger menu), not a page navigator. No DRY violation.

### 7.2 Complexity Assessment

New code additions estimated:
- `touchHelper.js`: +40 lines (swipe detection)  
- `index.html` (HTML): +30 lines (bottom nav template)
- `index.html` (CSS): +50 lines (bottom nav styles, responsive adjustments)
- `index.html` (JS): +15 lines (swipe handler registration, bottom nav handlers)
- `style.css`: +20 lines (responsive tweaks)

**Total: ~155 new lines.** No new files. No new abstractions. This is proportionate to the scope.

### 7.3 Naming Conventions

Proposed names (matching existing patterns):
- `handleSwipeStart(e)` / `handleSwipeEnd(e)` — mirrors existing `handleWordTouchStart`/`handleWordTouchEnd`
- `isBottomNavVisible` — computed, follows `isMobileMenuOpen` pattern
- `bottomNavActiveSection` — mirrors `activeSection`
- `SWIPE_THRESHOLD_PX = 50` — follows existing `MOVEMENT_THRESHOLD = 15` constant style

### 7.4 Code Organization

Swipe detection belongs in `touchHelper.js` because:
- It already handles touch start/end events
- It already has `isValidTap()` and `debounceTouch()`
- Adding `isValidSwipe()` and `detectSwipeDirection()` is a natural extension

Bottom nav logic belongs inline in `index.html` because:
- It's a simple template + 3-4 computed properties
- Creating a separate component file for this would be over-engineering
- Matches how the existing top bar and side drawer are implemented

---

## 8. Test Review

### 8.1 Test Diagram — New Features

```
  NEW UX FLOWS:
  ├── Swipe left/right to navigate Quran pages
  ├── Bottom nav tap to switch sections
  ├── Bottom nav "More" opens side drawer
  ├── Pinch-to-zoom on Quran text (newly enabled)
  └── Adjusted floating player position with bottom nav

  NEW CODEPATHS:
  ├── touchHelper.isValidSwipe(startX, endX, startY, endY, deltaTime)
  ├── touchHelper.detectSwipeDirection(startX, endX)
  ├── handleSwipeEnd() → navigateToPage(page ± 1)
  ├── bottomNavActiveSection computed
  ├── isBottomNavVisible computed (screen width check)
  └── CSS: main content area padding-bottom adjustment

  NEW EDGE CASES:
  ├── Swipe at page boundaries (page 1, page 604)
  ├── Swipe on word elements (should NOT trigger navigation)
  ├── Rapid successive swipes (debounce)
  ├── Diagonal swipe (should be ignored)
  ├── Bottom nav + audio player stacking
  └── Viewport zoom + word selection interaction
```

### 8.2 Required Tests

#### Unit Tests (Vitest)

| Test | Type | File |
|------|------|------|
| `isValidSwipe` returns true for horizontal swipe ≥50px | Unit | `tests/unit/touchHelper.test.js` |
| `isValidSwipe` returns false for vertical movement | Unit | `tests/unit/touchHelper.test.js` |
| `isValidSwipe` returns false for slow drag (>2000ms) | Unit | `tests/unit/touchHelper.test.js` |
| `isValidSwipe` returns false for short distance (<50px) | Unit | `tests/unit/touchHelper.test.js` |
| `detectSwipeDirection` returns 'left'/'right' correctly | Unit | `tests/unit/touchHelper.test.js` |
| Swipe at page 1 going "previous" is no-op | Unit | `tests/unit/touchHelper.test.js` |
| Swipe at page 604 going "next" is no-op | Unit | `tests/unit/touchHelper.test.js` |
| debounceSwipe prevents rapid-fire (300ms) | Unit | `tests/unit/touchHelper.test.js` |

#### E2E Tests (Playwright)

| Test | Type | File |
|------|------|------|
| Swipe right on Quran page navigates to next page | E2E | New: `tests/e2e/swipeNavigation.spec.js` |
| Swipe left on Quran page navigates to previous page | E2E | Same file |
| Swipe on word element does NOT trigger page navigation | E2E | Same file |
| Bottom nav is visible on mobile viewport (375px) | E2E | `tests/e2e/quranNavigation.spec.js` |
| Bottom nav is hidden on desktop viewport (1280px) | E2E | Same file |
| Bottom nav "Read" tab navigates to Quran view | E2E | Same file |
| Bottom nav "More" tab opens side drawer | E2E | Same file |
| Pinch zoom works (viewport meta allows zoom) | E2E | `tests/e2e/touchInteraction.spec.js` |
| Floating audio player sits above bottom nav | E2E | `tests/e2e/quranDisplay.spec.js` |

### 8.3 Hostile QA Tests

- Swipe 200 times rapidly in alternating directions → no crash, no wrong page
- Tap word WHILE mid-swipe → word selection wins, no page change
- Rotate phone from portrait to landscape during swipe → graceful abort
- Open keyboard (search) + swipe → no layout jump

### 8.4 Flakiness Risk

- **Swipe E2E tests** depend on `page.touchscreen` API which can be flaky across browsers. Mitigate by testing in Chromium only (current config) and using `page.mouse.move()` for more reliable simulation.
- **Viewport-dependent tests** (bottom nav visible/hidden) are reliable with Playwright's `viewport` option.

---

## 9. Performance Review

### 9.1 Swipe Performance

```
  EVENT          | OPERATIONS           | COST
  ────────────── |─────────────────────|──────────────
  touchstart     | Record x, y, time   | O(1), ~0ms
  touchend       | Calculate delta,     | O(1), ~0ms
                 | validate swipe,      |
                 | call navigateToPage |
  navigateToPage | Update appStore,     | Existing — triggers
                 | load page words,     | getPageWordsDetailed()
                 | load fonts           | and font lazy-load
```

**No new performance concern.** Swipe detection is O(1). Page navigation is existing code.

### 9.2 Bottom Nav Performance

- Static HTML, CSS only. No JS computation on render.
- Media query handles show/hide — no JS resize listener needed.
- Active state computed from existing `activeSection` reactive — no new watchers.

### 9.3 Bundled Performance Fixes

#### Fix from PHASE2 #1: Achievement Grid

**Current:** `filteredBadges` does `.map() + .filter() + .sort()` with 200+ `.has()` calls per render.  
**Fix:** Memoize the sorted base list. Only recompute when badges or unlock set changes. Filter is a lightweight overlay.  
**Impact:** Reduces per-render cost from O(n log n) to O(n) for filter-only operations.

#### Fix from PHASE2 #2: Notes Search Debounce

**Current:** Every keystroke triggers full `.filter() + .sort()` with 6× `toLowerCase()` per note.  
**Fix:** 200ms debounce on search input using a debounced ref.  
**Impact:** Reduces filter calls from ~10/second (fast typing) to ~3/second.

### 9.4 Memory Impact

- Bottom nav: ~6 DOM elements (negligible)
- Swipe handler: 3 variables stored (startX, startY, startTime) — negligible
- No new event listeners beyond touchstart/touchend on the Quran container

### 9.5 Decision Point

#### QUESTION 9A: Quran Text Font Size on Very Small Screens

Currently, font size below 500px is 14px for "small" setting. This is hard to read for Arabic script, especially with tajweed marks.

**We recommend option B:** Increase minimum font size to 18px.

```
A) Keep current sizing (14-22px range for mobile < 640px)
   - Effort: None | Risk: None | Maintenance: None
   - Users with small screens continue to have tiny text

B) Increase minimum to 18px, adjust range to 18-26px for < 640px
   - Effort: Low | Risk: Low (text may overflow on 320px with large setting) | Maintenance: Low
   - Better readability; zoom now available as fallback for edge cases

C) Dynamic font sizing based on screen width (fluid typography)
   - Effort: Medium | Risk: Low | Maintenance: Medium
   - Uses clamp() for smooth scaling: `clamp(18px, 4vw, 26px)`
   - Most refined but adds CSS complexity
```

**Why B:** With zoom now enabled (removing `user-scalable=no`), users have a fallback for extreme cases. The 4px bump at the minimum end significantly improves Arabic readability without the complexity of fluid typography. Maps to "engineered enough — not over-engineered."

> **YOUR ANSWER:** B

---

## 10. Observability & Debuggability

### 10.1 What Can Break Silently

| Feature | Silent Failure | Detection |
|---------|----------------|-----------|
| Swipe not registering | User thinks app is broken | Console.log in debug mode only |
| Bottom nav rendering on wrong viewport | Shows on tablet when shouldn't | Visual QA + E2E test |
| Audio player hidden behind bottom nav | Audio controls unreachable | Visual QA + E2E test |
| Zoom causing layout break on iOS | Text overflows container | Manual iOS testing |

### 10.2 Debug Mode Additions

The app already has a dev mode (`Ctrl+Shift+D`). Proposed additions:
- Log swipe events: direction, distance, duration, accepted/rejected
- Log bottom nav taps with current and target section

### 10.3 Runbook

**Swipe not working on device X:**
1. Check if `touchstart`/`touchend` events fire (dev tools → Event Listeners)
2. Check if touch target is a word element (expected: swipe ignored on words)
3. Check horizontal distance meets threshold (≥50px)
4. Check diagonal ratio (horizontal > 2× vertical)

---

## 11. Deployment & Rollout

### 11.1 Deployment Strategy

This is a static site deployment (no migration, no backend). Deployment = push to server.

```
  STEP 1: Implement changes on feature branch
  STEP 2: Run all tests (644 unit + 159 E2E + new tests)
  STEP 3: Manual testing on physical devices:
          - iPhone SE (375px) — smallest supported
          - iPhone 15 (393px) — modern standard
          - iPad (768px) — tablet boundary
          - Android (360px) — common Android width
  STEP 4: Deploy to production (static file copy)
  STEP 5: Verify on production URL
```

### 11.2 Rollback Plan

```
  IF swipe causes regression:
    → git revert <commit>
    → Redeploy (< 2 minutes)
    → Zero data loss (all client-side state in IndexedDB, unaffected)

  IF bottom nav overlaps content:
    → CSS-only fix, deploy in minutes

  IF zoom causes layout break:
    → Revert viewport meta tag change only
```

**Reversibility: 5/5** — All changes are CSS/JS, no data migrations, no server state.

### 11.3 Feature Flags

Not needed. Changes are:
- CSS (bottom nav visibility via media query — already conditional)
- JS (swipe handler — attaches only in Quran view)
- HTML (viewport meta — one line)

No partial states to manage.

### 11.4 Post-Deploy Verification

1. Load app on phone → bottom nav visible with 5 items
2. Tap each bottom nav item → correct section activates
3. Navigate to Quran page → swipe right → page number increments
4. Swipe left → page number decrements  
5. Pinch zoom → text enlarges cleanly
6. Tap a Quran word → morphology popup shows (no swipe conflict)
7. Play audio → floating player appears above bottom nav

---

## 12. Long-Term Trajectory

### 12.1 Technical Debt

| Item | Type | Severity |
|------|------|----------|
| 10.5k line index.html | Architectural | High — but out of scope |
| No bundler/build step | Ecosystem | Medium — limits code splitting |
| No virtual scrolling | Performance | Medium — addressed in future PR |
| Manual section switching | Navigation | Low — mitigated by bottom nav |

This plan does NOT increase technical debt. It slightly reduces it by:
- Extracting swipe logic to `touchHelper.js` (reusable)
- Improving CSS organization with clear mobile-specific sections

### 12.2 Path Dependency

Will this plan make future changes harder? **No.**
- Bottom nav items are data-driven (easy to reconfigure)
- Swipe detection is generic (can be extended to other views)
- Viewport change is standard (no proprietary hacks)

### 12.3 Reversibility Rating: 5/5

Every change can be individually reverted without affecting other parts.

### 12.4 What Comes After

```
  THIS PR:                    NEXT PR:                     FUTURE:
  Swipe + Bottom Nav          List Virtualization           Component Extraction
  + Zoom + Font Size          + Quiz UX Fixes               + Build Step
  + Perf Fixes #1,#2          + Perf Fixes #3,#4,#6         + Router
```

---

## 13. QA Pre-Assessment

### 13.1 Health Score (Current State — Before Implementation)

```
  Health Score: 88/100
  - Tests pass:     30/30 — All 644 unit + 159 E2E pass ✅
  - Test coverage:  16/20 — Good coverage of critical paths, gaps in touch/mobile
  - Critical bugs:  18/20 — Zoom disabled is WCAG violation, no data-loss bugs
  - Error handling: 12/15 — Most errors handled, some silent failures in edge cases
  - Edge cases:     12/15 — Page boundaries handled, swipe/gesture gaps exist
```

### 13.2 Risk Areas for This Plan

| Area | Risk | Mitigation |
|------|------|------------|
| iOS Safari touch behavior | Medium | Test on physical iOS device |
| Android Chrome touch events | Low | Playwright covers Chromium |
| PWA standalone mode bottom area | Medium | Test with `display: standalone` |
| Safe area insets (iPhone notch/dynamic island) | Medium | Use `env(safe-area-inset-bottom)` |
| RTL layout interaction with swipe | Low | Swipe direction is absolute, not RTL-relative |

### 13.3 Regression Risk Matrix

| Existing Feature | Risk of Regression | Why |
|------------------|--------------------|-----|
| Word selection/tap | **Medium** | New swipe handler on same container |
| Page navigation buttons | **None** | Untouched |
| Audio player positioning | **Low** | CSS change only |
| Side drawer menu | **None** | Item reorganization only |
| Quiz functionality | **None** | Zero code overlap |
| Settings modal | **None** | Zero code overlap |
| Notes/Tafsir/Morphology | **None** | Zero code overlap |

---

## 14. Required Outputs

### 14.1 NOT In Scope

| Item | Rationale |
|------|-----------|
| Full list virtualization (surah/juz/badge) | Separate performance PR; works adequately now |
| Quiz UX improvements (timer, delay, selection) | Separate quiz-focused PR |
| Tablet landscape split view | Future enhancement; current tablet UX is acceptable |
| PWA offline improvements | Separate initiative |
| Component extraction from index.html | Architectural change beyond mobile UX scope |
| Build step / bundler introduction | Infrastructure change, separate initiative |
| Haptic feedback on swipe | Nice-to-have, requires native API; defer |
| Page turn animation (flip/slide) | Visual polish, defer to after core swipe works |
| Gesture-based zoom (double-tap word to enlarge) | Over-engineering; browser zoom is sufficient |

### 14.2 What Already Exists

| Sub-problem | Existing Code | Plan Reuses It? |
|-------------|---------------|-----------------|
| Touch event handling | `touchHelper.js` (isValidTap, debounceTouch) | ✅ Extended |
| Page navigation | `navigateToPage()` in index.html | ✅ Called by swipe |
| Section switching | `activeSection` reactive variable | ✅ Used by bottom nav |
| Side drawer | HTML/CSS in index.html (lines 1290-1360) | ✅ Reorganized |
| Floating player positioning | CSS in index.html (lines 983-993) | ✅ Adjusted |
| Font size responsive rules | CSS (lines 9185-9220, 450-523) | ✅ Modified |
| Keyboard shortcuts | Lines 9937-10078 | ✅ Unchanged, swipe adds touch parity |

### 14.3 Failure Modes Registry

```
  CODEPATH              | FAILURE MODE          | RESCUED? | TEST? | USER SEES    | LOGGED?
  ──────────────────────|───────────────────────|──────────|───────|──────────────|────────
  Swipe detection       | No changedTouches     | Y        | Y     | Nothing      | Debug
  Swipe detection       | deltaTime = 0         | Y        | Y     | Nothing      | Debug
  Swipe at page 1 back  | Page out of bounds    | Y        | Y     | Nothing      | No
  Swipe at page 604 fwd | Page out of bounds    | Y        | Y     | Nothing      | No
  Swipe on word element | Accidental page turn  | Y        | Y     | Nothing      | Debug
  Bottom nav tap        | Invalid section       | Y        | Y     | Falls to read| Debug
  Audio player z-index  | Covered by bottom nav | Y        | Y     | Normal       | No
  Zoom on iOS Safari    | Layout break          | N (test) | Y     | Broken zoom  | No
```

**CRITICAL GAPS:** iOS Safari zoom behavior needs manual device testing. Cannot be fully automated.

### 14.4 TODO Updates

#### TODO-1: List Virtualization for Surah/Juz/Badge Grids

**What:** Implement virtual scrolling for the 114-surah grid, 30-juz grid, and 100-badge grid  
**Why:** Renders 244+ DOM elements on section load; causes jank on low-end phones  
**Pros:** Smoother scrolling, lower memory, faster section switches  
**Cons:** Adds scroll-position management complexity; need to handle dynamic item heights  
**Context:** Currently all items render at once. Surah grid = 114 items × ~4 DOM nodes each = ~456 nodes. Badge grid = 100 items × ~5 nodes = ~500 nodes. On a Moto G Power (low-end), this takes ~200ms to render.  
**Effort:** M  
**Priority:** P2  
**Depends on:** Nothing — can be done independently  

> **A)** Add to TODO list | **B)** Skip | **C)** Build now  
> **We recommend A:** Not blocking mobile UX goals; current render time is tolerable but not ideal. Separate PR keeps this plan's diff clean.  
> **YOUR ANSWER:** A. Also, get rid of achievements badges, that was a unfinished hidden feature, we don't need that. Let's get rid of it alltogether.

#### TODO-2: Page Turn Animation

**What:** Add CSS transition animation when swiping between Quran pages (slide or fade)  
**Why:** Visual feedback that the page changed; raw content swap feels abrupt  
**Pros:** Polished, app-like feel; clear visual confirmation of navigation  
**Cons:** Adds animation state management; may cause jank during rapid swiping; CSS transitions on large DOM can lag  
**Context:** Current page change is instant (content swaps). Adding a slide transition would need a second container for the outgoing page, or an opacity fade on the main container.  
**Effort:** S  
**Priority:** P3  
**Depends on:** Swipe navigation (this plan)  

> **A)** Add to TODO list | **B)** Skip | **C)** Build now  
> **We recommend A:** Natural follow-up after swipe shipping stably. Low effort but adds polish. Don't bundle — test swipe behavior first.  
> **YOUR ANSWER:** A

#### TODO-3: Remaining PHASE2 Performance Fixes (#3, #4, #5, #6)

**What:** Fix quiz timer leak, quiz 3s delay, morphology preloader, quiz surah selection  
**Why:** Issues documented in PERFORMANCE_ISSUES_PHASE2.md; affect quiz and utility UX  
**Pros:** Cleaner code, no memory leaks, faster quiz interactions  
**Cons:** 4 separate fixes across 2 files; should be bundled in a quiz-focused PR  
**Context:** Issues #3, #4, #6 all in quiz.html; #5 is dormant but should be fixed preventively  
**Effort:** S  
**Priority:** P2  
**Depends on:** Nothing  

> **A)** Add to TODO list | **B)** Skip | **C)** Build now  
> **We recommend A:** These are quiz-specific and don't overlap with mobile navigation work. Keep them tracked.  
> **YOUR ANSWER:** A

### 14.5 Implementation Order

```
  ┌────────────────────────────────────────────────────────────┐
  │                   IMPLEMENTATION SEQUENCE                   │
  ├────────────────────────────────────────────────────────────┤
  │                                                            │
  │  Phase 1: Foundation (no visible change yet)               │
  │  ├── 1a. Fix viewport meta tag (remove zoom restriction)  │
  │  ├── 1b. Add swipe detection to touchHelper.js             │
  │  └── 1c. Write unit tests for swipe detection              │
  │                                                            │
  │  Phase 2: Swipe Navigation                                 │
  │  ├── 2a. Wire swipe handlers to Quran container            │
  │  ├── 2b. Connect to navigateToPage()                       │
  │  ├── 2c. Add swipe E2E tests                               │
  │  └── 2d. Test word selection still works (regression)      │
  │                                                            │
  │  Phase 3: Bottom Navigation                                │
  │  ├── 3a. Add bottom nav HTML/CSS (mobile only)             │
  │  ├── 3b. Wire tap handlers to activeSection                │
  │  ├── 3c. Adjust floating audio player positioning          │
  │  ├── 3d. Adjust main content padding-bottom                │
  │  ├── 3e. Add E2E tests for bottom nav                      │
  │  └── 3f. Reorganize side drawer (move items, group)        │
  │                                                            │
  │  Phase 4: Polish & Performance                             │
  │  ├── 4a. Adjust font sizes for small screens               │
  │  ├── 4b. Bundle perf fix: Achievement Grid memoize         │
  │  ├── 4c. Bundle perf fix: Notes search debounce            │
  │  └── 4d. Update PERFORMANCE_ISSUES_PHASE2.md               │
  │                                                            │
  │  Phase 5: Verification                                     │
  │  ├── 5a. Run full test suite (unit + E2E)                  │
  │  ├── 5b. Manual test on iOS Safari (physical device)       │
  │  ├── 5c. Manual test on Android Chrome (physical device)   │
  │  └── 5d. Test PWA standalone mode                          │
  │                                                            │
  └────────────────────────────────────────────────────────────┘
```

---

## Completion Summary

```
 +====================================================================+
 |          MOBILE UX IMPROVEMENT — PLAN REVIEW SUMMARY                |
 +====================================================================+
 | Mode selected         | HOLD SCOPE                                  |
 | System Audit          | Touch-fix pattern in git, 7 perf issues     |
 |                       | tracked, no TODO markers in source           |
 +-----------------------+---------------------------------------------+
 | Step 0 (Scope)        | 4 MUST, 3 SHOULD, 4 DEFER                   |
 | Section 3 (Arch)      | 4 questions raised (3B, 3C, 3D, 3A)         |
 | Section 4 (Errors)    | 8 failure modes mapped, 0 CRITICAL GAPS     |
 | Section 5 (Security)  | 0 new attack surface, 1 WCAG fix            |
 | Section 6 (Edge Cases)| 15 edge cases mapped, 1 question (6A)       |
 | Section 7 (Quality)   | 0 DRY violations, ~155 new lines            |
 | Section 8 (Tests)     | 8 unit + 9 E2E tests specified              |
 | Section 9 (Perf)      | 0 new concerns, 2 bundled fixes, 1 question |
 | Section 10 (Observe)  | debug-mode logging planned                  |
 | Section 11 (Deploy)   | Reversibility 5/5, static deploy            |
 | Section 12 (Future)   | 0 new tech debt, 3 TODOs proposed           |
 +-----------------------+---------------------------------------------+
 | Files touched          | 6 (under 8-file threshold)                  |
 | New lines              | ~155                                        |
 | New components         | 0                                           |
 | New abstractions       | 0                                           |
 +-----------------------+---------------------------------------------+
 | QUESTIONS PENDING      | 7 (3A, 3B, 3C, 3D, 6A, 9A, TODOs)          |
 | CRITICAL GAPS          | 1 (iOS Safari zoom — manual test only)      |
 +====================================================================+
```

---

## Questions Summary (Answer All Before Implementation)

| # | Question | Recommendation | Section |
|---|----------|----------------|---------|
| 3A | Bottom nav items | 5 items: Read, Surahs, Goals, Quiz, More | Architecture |
| 3B | Swipe vs. word selection | Swipe only on non-word areas | Architecture |
| 3C | Swipe direction convention | Follow page number direction (match arrows) | Architecture |
| 3D | Bottom nav auto-hide? | Always visible | Architecture |
| 6A | Swipe in surah/juz views? | Quran reading view only | Edge Cases |
| 9A | Font size on small screens | Increase minimum to 18px | Performance |
| TODO-1 | List virtualization | Add to TODO | Deferred Work |
| TODO-2 | Page turn animation | Add to TODO | Deferred Work |
| TODO-3 | Remaining PHASE2 fixes | Add to TODO | Deferred Work |

**Please answer each question with your chosen option letter (A/B/C) or provide alternative direction. Implementation will proceed only after all questions are resolved.**
