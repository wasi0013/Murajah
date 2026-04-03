# Navigation & Interaction Improvement Plan

## Pre-Review System Audit

### Current System State
- **Branch**: master (27 files changed, +1367/-5237 lines uncommitted)
- **Recent work**: Achievement system removed (11 files deleted), mobile UX Phase 1-4 complete (bottom nav, swipe, viewport fix, font size increase)
- **No stashes**, no TODO/FIXME markers in relevant code
- **Test status**: 655 unit tests passing, 158 E2E tests passing (1 flaky surahView test pre-existing)

### Existing Known Pain Points
- `PERFORMANCE_ISSUES_PHASE2.md` Issue #2: Notes search needs debounce (DONE in prior session)
- Quiz page mobile experience is inconsistent with main app
- Word interaction mode (mistake/morphology) conflicts with swipe gesture on mobile

### Files This Plan Touches
| File | Purpose |
|------|---------|
| `source/index.html` | Main SPA (~10,200 lines) — swipe, toggle button, top nav hide, drawer changes |
| `source/quiz.html` | Quiz page — bottom nav, drawer CSS fixes |
| `source/resources/js/utils/touchHelper.js` | Swipe handler (already modified) |
| `source/resources/data/i18n/en.json` | New i18n keys for toggle labels |
| `source/resources/data/i18n/ar.json` | Arabic translations |
| `source/resources/data/i18n/bn.json` | Bengali translations |
| `tests/unit/touchHelper.test.js` | Swipe/interaction tests |
| `tests/e2e/touchInteraction.spec.js` | E2E touch tests |

---

## Step 0: Premise & Scope

### 0A. Premise Challenge
**Problem**: Mobile Quran reading has gesture conflicts — swipe-to-navigate and tap-to-mark-mistake/morphology both operate on the same touch surface. The user needs a clear way to switch between "reading/navigation mode" and "review/annotation mode."

**User outcome**: Frictionless mobile navigation with clear, discoverable mode switching. Quiz page experience should match the main app.

**What if we did nothing?** Users on mobile can't easily swipe because word taps intercept touches. The quiz page feels disconnected from the main app. Real pain point, not hypothetical.

### 0B. Existing Code Leverage
| Sub-problem | Existing code | Reuse? |
|-------------|--------------|--------|
| Swipe detection | `createSwipeHandler()` in touchHelper.js | Yes — already works, shouldIgnore logic needs mode-awareness |
| Mistake highlighting | `highlightWord()`, `handleWordClick()` | Yes — existing, just needs gating |
| Morphology popup | `showMorphologyPopup()`, `settingsStore.showMorphology` | Yes — existing, just needs gating |
| Bottom nav | `.bottom-nav` CSS + HTML in index.html | Yes — copy pattern to quiz.html |
| Mobile menu drawer | `.mobile-menu` CSS + HTML | Yes — quiz already has one, needs CSS fixes |
| Refresh function | `refreshApp()` | Yes — just move the button |

### 0C. Mode Selection

**Recommended: HOLD SCOPE.** This is a focused UX polish pass — 6 tightly-scoped changes with clear boundaries. No new features, no new data flows, no new persistence. The goal is to make existing features work better together on mobile.

---

## Architecture

### State Machine: Word Interaction Mode

```
                    ┌─────────────────────────────────────────────┐
                    │          INTERACTION MODE STATE              │
                    │                                             │
                    │  interactionMode ref: 'swipe' | 'review'   │
                    │                                             │
                    │  ┌─────────┐  toggle btn  ┌──────────┐     │
                    │  │  SWIPE  │ ──────────▶  │  REVIEW  │     │
                    │  │(default)│ ◀──────────  │          │     │
                    │  └─────────┘  toggle btn  └──────────┘     │
                    │                                             │
                    │  SWIPE mode:                                │
                    │   - Swipe left/right = page navigation     │
                    │   - Word taps = ignored (no highlight)     │
                    │   - Word @touchstart/@touchend = ignored   │
                    │                                             │
                    │  REVIEW mode:                              │
                    │   - Swipe = disabled                       │
                    │   - Word taps = highlight mistake OR       │
                    │     show morphology (per settings)          │
                    │   - Settings checkboxes control behavior   │
                    │                                             │
                    └─────────────────────────────────────────────┘
```

### Component Dependency (files touched)

```
  index.html (template)
    ├── Toggle button HTML (next to color picker)
    ├── Conditional swipe/word handlers (gated by interactionMode)
    ├── Top nav hidden on mobile
    ├── Refresh button moved to drawer
    └── Settings checkbox labels updated

  index.html (script)
    ├── interactionMode ref('swipe')
    ├── quranSwipeHandlers (already exists, needs mode gate)
    ├── handleWordClick (already exists, needs mode gate)
    └── Settings watcher for checkbox labels

  quiz.html
    ├── Bottom nav HTML (copied from index.html pattern)
    ├── Drawer CSS fixes
    └── Top nav hidden on mobile

  touchHelper.js — NO CHANGES needed
  i18n/*.json — new keys for toggle labels
```

---

## Implementation Tasks (6 tasks)

### Task 1: Interaction Mode Toggle Button

**What**: Add a toggle button next to the color-picker button (top-left of Quran text section) that switches between swipe mode and review mode.

**Location**: `source/index.html`, inside `#quran-text-section`, adjacent to the existing color palette `div.absolute.top-2.left-2.z-10` (line ~4157).

**Implementation**:
1. Add `interactionMode` ref with default `'swipe'`
2. Add toggle button showing current mode icon:
   - Swipe mode: hand/swipe icon (`fa-hand-pointer` or `fa-arrows-left-right`)
   - Review mode: pencil/edit icon (`fa-pen` or `fa-highlighter`)
3. Button positioned next to color picker (same `absolute top-2 left-2` group, spaced horizontally)
4. Visual feedback: active state color change (blue when review, gray when swipe)
5. Add `interactionMode` to the return object

**Behavior**:
- Default: `'swipe'` — swipe gestures active, word taps do nothing
- Toggled: `'review'` — swipe disabled, word taps trigger mistake/morphology per settings
- Toggle is per-session (no persistence needed — resets to swipe on reload)

**Wire to swipe**: In `quranSwipeHandlers` initialization, add early return when `interactionMode.value === 'review'`
**Wire to word click**: In `handleWordClick()`, add early return when `interactionMode.value === 'swipe'`

#### Question 1A: Toggle Button Position

**We recommend A**: Place the toggle inside the same absolute-positioned group as the color picker, forming a small toolbar. This keeps the UI consistent and avoids visual clutter.

- **A)** Same group as color picker (horizontal row: `[color] [mode]` at top-left) — Minimal footprint, discoverable, consistent. Effort: S.
- **B)** Separate floating button at top-right — More visible but adds a second floating element. Effort: S.
- **C)** Inside the Prev/Next navigation bar above the Quran text — Not visible when scrolling down. Effort: S.

Answer: A

#### Question 1B: Toggle Icon Choice

**We recommend B**: Use a highlighter icon for review mode (matches "marking mistakes" mental model) and a swipe/hand icon for swipe mode.

- **A)** Swipe: `fa-arrows-left-right`, Review: `fa-pen` — Clear but "pen" implies editing text. Effort: trivial.
- **B)** Swipe: `fa-hand-pointer`, Review: `fa-highlighter` — "Highlighter" matches mistake-marking. Effort: trivial.
- **C)** Single icon that changes: `fa-toggle-on`/`fa-toggle-off` with label — More accessible but takes more space. Effort: S.

Answer: B

#### Question 1C: Mode Persistence

**We recommend A**: Session-only (no persistence). Review mode is a temporary inspection state, not a preference.

- **A)** Session-only — resets to swipe on page reload. Simplest, safest default. Effort: trivial.
- **B)** Persist to IndexedDB — remembers across sessions. Adds complexity, risk of user forgetting they're in review mode. Effort: S.

Answer: A
---

### Task 2: Settings Checkbox Label Updates

**What**: When mistake/morphology toggles in settings are changed, the checkbox labels should reflect the current state clearly. The user specifically asked for "appropriate label when toggled."

**Current state** (settings modal, line ~4848):
```html
<input v-model="settingsStore.showMorphology" @change="updateSettings" type="checkbox">
<label>Morphology <span>(Click to view)</span></label>
```

**Implementation**:
1. Update the morphology checkbox label into a radio to show context-appropriate text for the toggle:
   - When Morphology: "Word Morphology (tap any word in Review mode to see details)"
   - When Mistake: "Mistake Highlighter (tap any word in Review mode to mark it as mistake)"
2. Update translation of the radio label/texts to show appropriate text. 

#### Question 2A: Mistake Mode Settings Checkbox

**We recommend A**: Add a dedicated checkbox for mistake marking in settings, since the user mentioned "mistake/morphology toggles from settings as usual with a tick box."

Currently, mistake highlighting is ALWAYS active when morphology is OFF — there's no way to disable it. The user wants explicit control via settings checkboxes.

- **A)** Add `settingsStore.showMistakeMode` checkbox — explicit opt-in for mistake marking. When both mistake and morphology are OFF, word taps do nothing even in review mode. Effort: S.
- **B)** Keep current behavior — mistake mode is implicit (active when morphology is OFF). No new checkbox. Effort: trivial.
- **C)** Radio buttons instead of checkboxes — "None / Mistakes / Morphology" — mutually exclusive. Cleaner but different UX pattern. Effort: S.

Answer: C, Toggle mistake and morphology using radio

#### Question 2B: Priority Between Mistake and Morphology

**We recommend A**: When BOTH mistake and morphology are enabled, morphology takes precedence (shows popup instead of toggling mistake). This matches the current behavior.

- **A)** Morphology wins — shows popup when both enabled. Current behavior, least surprise. Effort: trivial.
- **B)** Mistake wins — marks mistake when both enabled. Changes existing behavior. Effort: trivial.
- **C)** Long-press for morphology, tap for mistake — both available simultaneously. More complex gesture handling. Effort: M.

Answer: Not applicable, we use the radio toggle in the settings. 

---

### Task 3: Swipe Performance Investigation & Fix

**What**: The user reports swipe is "hard on mobile" and wants it lag-free. Investigation reveals potential performance issues.

**Current flow on swipe → page change**:
```
  SWIPE DETECTED
    ├── nextPage() / previousPage() called
    │   ├── viewMode.value = 'core'
    │   ├── forceQuranMode check + potential DB write (showTafsir)
    │   ├── appStore.currentPage++ / --
    │   ├── updateURL() (pushState)
    │   ├── await nextTick() (wait for Vue DOM update)
    │   └── scrollIntoView({ behavior: 'smooth' }) (smooth animation)
    │
    └── WATCHERS FIRE:
        ├── watch(currentPage) → updateURL() + loadPageFont()
        │   └── loadPageFont: creates <style> tag, triggers woff2 fetch
        └── COMPUTED RE-EVALUATIONS:
            ├── currentPageMistakes (Array.from + sort)
            ├── currentPageWords (full page word data)
            └── fontSizeStyle (window.innerWidth check)
```

**Identified issues**:
1. **DB write in hot path**: `murajahDB.setSetting('showTafsir', false)` fires on EVERY swipe when `forceQuranMode` is true. This is an unnecessary IndexedDB write.
2. **Duplicate `updateURL()`**: Called both in `nextPage`/`previousPage` AND in the `watch(currentPage)` watcher. Double push-state.
3. **`scrollIntoView` with smooth**: The smooth scroll animation can feel laggy on older devices. On swipe, the user wants instant page change.
4. **Font loading**: New page font (woff2) loads on every page change. With `font-display: swap`, text shows immediately with fallback font, then re-renders when font loads. This can cause a visible "flash" on each swipe.

#### Question 3A: Scroll Behavior on Swipe

**We recommend A**: Use `'instant'` scroll on swipe (the user is swiping — they want the immediate result) but keep `'smooth'` for button-press navigation. This is the single biggest perceived-lag fix.

- **A)** `'instant'` for swipe, `'smooth'` for button — best UX, minimal effort. Effort: S.
- **B)** Always `'instant'` — consistent but abrupt for button clicks. Effort: trivial.
- **C)** Remove scroll entirely on swipe (user stays at current scroll position) — simpler but may leave user mid-page. Effort: trivial.

Answer: always Instant (B)

#### Question 3B: DB Write in Hot Path

**We recommend A**: Gate the tafsir DB write behind a check — only write if the value actually changes. This eliminates unnecessary IndexedDB writes on every swipe.

- **A)** Guard with `if (settingsStore.showTafsir)` before the DB write — only write when actually changing. Effort: trivial.
- **B)** Remove the forceQuranMode tafsir-closing logic entirely — simplest, but may leave tafsir panel open during swipe. Effort: trivial.
- **C)** Debounce the DB write — handles rapid swiping but adds complexity. Effort: S.

Answer: A

#### Question 3C: Duplicate updateURL

**We recommend A**: Remove `updateURL()` from inside `nextPage`/`previousPage` since the watcher already handles it.

- **A)** Remove from nextPage/previousPage — DRY, single source of truth. Effort: trivial.
- **B)** Remove from the watcher — keeps explicit call but watcher still fires. Effort: trivial.

Answer: A
---

### Task 4: Hide Top Nav on Mobile & Move Refresh to Drawer

**What**: Since we now have a permanent bottom nav bar on mobile, the top mobile nav (refresh button + hamburger menu button) is redundant. Hide it on mobile. Move the refresh button to the drawer menu.

**Current mobile header** (line ~3510):
```html
<div class="mobile-nav flex items-center gap-2">
  <button @click="refreshApp" ...>  <!-- Refresh -->
  <button @click="showMobileMenu = true" ...>  <!-- Menu hamburger -->
</div>
```

**Implementation**:
1. Hide the `.mobile-nav` div on mobile (it's already hidden on desktop via `@media (min-width: 768px)`)
   - Simple approach: add `display: none` to `.mobile-nav` — it becomes completely hidden since desktop-nav handles ≥768px and bottom-nav handles <768px
2. Move refresh button to the drawer menu, near settings. Add it as a menu item with the `fa-rotate-right` icon and appropriate label.

**Current drawer structure** (lines 3519-3640):
```
Mobile Menu Drawer:
  ├── Header (logo + close button)
  ├── Home Sections (Quran, Surah, Word-by-Word, Tafsir, Audio, Mistakes, Daily Goals, Analytics, Timeline, Notes)
  └── Other Links (Quiz, Discord, How It Works, Settings, Appearance)
```

#### Question 4A: Refresh Button Position in Drawer

**We recommend A**: Place refresh near Settings/Appearance at the bottom of the drawer, since it's an app-level action, not a navigation section.

- **A)** In "Other Links" section, above Settings — grouped with app-level actions. Effort: trivial.
- **B)** At the very top of the drawer, below the logo — prominent but mixes nav levels. Effort: trivial.
- **C)** As a secondary action in the drawer header (next to close button) — compact but easy to miss. Effort: trivial.

Answer: A

#### Question 4B: Top Header on Mobile

**We recommend A**: Hide the entire `.mobile-nav` since both its functions (refresh + menu) are now available elsewhere (drawer + bottom nav "More" tab). The header logo/brand area should remain.

- **A)** Hide `.mobile-nav` completely — bottom nav "More" opens the drawer, refresh is in drawer. Clean. Effort: trivial.
- **B)** Keep the hamburger but remove refresh — redundant with bottom nav "More" but gives two ways to open drawer. Effort: trivial.

Answer: A

---

### Task 5: Quiz Page Bottom Nav + Consistency

**What**: Add the same bottom navigation bar to quiz.html that exists in index.html, providing consistent mobile UX across the app. The quiz page should feel like part of the same app.

**Implementation**:
1. Copy the bottom nav CSS from index.html to quiz.html (`.bottom-nav`, `.bottom-nav-inner`, `.bottom-nav-item`, responsive media query)
2. Add bottom nav HTML with 5 tabs:
   - **Read** → `href="./index.html"` (navigates to main app)
   - **Surahs** → `href="./index.html#surah-section"` (navigates to main app surah view)
   - **Goals** → `href="./index.html#daily-goals-section"` (navigates to main app goals)
   - **Quiz** → active/current (highlighted)
   - **More** → opens quiz mobile menu drawer
3. Hide the quiz mobile-nav header buttons on mobile (same approach as index.html)
4. Add footer bottom padding on mobile (`pb-20 md:pb-6`)

#### Question 5A: Quiz Bottom Nav Tab Links

**We recommend A**: Link Read/Surahs/Goals to index.html (full page navigation). Since quiz.html is a separate page, there's no SPA navigation possible — but the visual consistency is what matters.

- **A)** Standard `<a href>` links to index.html — simple, works everywhere. Effort: S.
- **B)** Same approach but with `?returnTo=quiz` parameter so index.html can show a "Back to Quiz" element — more polished but adds complexity. Effort: M.

Answer: A
---

### Task 6: Quiz Drawer CSS Fixes

**What**: The user reported "major CSS issues related to z-index/background color" in the quiz drawer.

**Investigation findings**:

1. **Dark mode background bug** (line 555 of quiz.html): (X this is not a bug)
   ```css
   .dark .mobile-menu {
     background: #ffffff;  /* BUG: Should be dark, not white */
   }
   ```
   The dark mode menu background is set to white (`#ffffff`) — identical to light mode. This means in dark mode, the menu appears with white background, creating a jarring visual contrast.

2. **Dark mode text colors not adapted** (lines 604-618):
   ```css
   .dark .mobile-menu-item { color: #374151; }      /* Dark gray — hard to read on dark bg */
   .dark .mobile-menu-item:hover { background-color: #f3f4f6; }  /* Light gray hover — wrong for dark */
   .dark .mobile-menu-item i { color: #6b7280; }    /* Gray icons — low contrast on dark */
   .dark .mobile-menu-header { border-bottom-color: #e5e7eb; }   /* Light border on dark bg */
   .dark .mobile-menu-section { border-bottom-color: #f3f4f6; }  /* Light border on dark bg */
   ```
   All `.dark` variants use light-mode colors. The entire dark mode CSS for the quiz drawer is essentially non-functional — it's just a copy of light mode values.

3. **Header z-index vs menu z-index**: Header is `z-50` (Tailwind = 50), menu overlay is `z-index: 9998`, menu is `z-index: 9999`. The menu correctly stacks above the header. **No issue here.**

4. **Mobile tab bar vs desktop tabs**: The `.mobile-tab-bar` is `display: none` above 768px (correct). However, the desktop tab bar has no corresponding hide on mobile — both could theoretically show. Let me verify...
   - The desktop tab bar uses: `<div class="border-b border-gray-200"><nav class="-mb-px flex space-x-8">` — no responsive hide class. But wait — checking the actual structure, the mobile-tab-bar probably overlaps it. This should be checked.

**Implementation**:
(X) 1. Fix `.dark .mobile-menu` background: `background: #1f2937;` (dark gray, matches index.html)
(X) 2. Fix all `.dark .mobile-menu-*` color values to proper dark mode colors
(X) 3. Verify desktop/mobile tab bar mutual exclusivity

IMPORTANT NOTE: THE DARK MODE IS LIGHT MODE, it is there as a get around for Google's Forced dark mode in android web view. Keep this same as light mode.

#### Question 6A: Dark Mode Color Palette for Quiz Drawer (X)

**We recommend A**: Match index.html's dark mode colors exactly for visual consistency.

- **A)** Copy index.html dark mode colors — `background: #1f2937`, text `#d1d5db`, borders `#374151`. Consistent across app. Effort: S.
- **B)** Use a slightly different dark palette unique to quiz — technically valid but creates inconsistency. Effort: S.

Answer: We don't have dark mode for index and quiz.html, the darkmode css is their for getting around some forced dark mode issues from android web view. In dark mode, we still show the normal mode by placing those dark mode css.
Please, keep them consistent with light mode, we don't need dark mode but CSS needs to be there so that forced dark mode still shows light mode content properly. Otherwise, it looks like a mess. (THIS IS IMPORTANT)

---

## NOT in Scope

| Item | Rationale |
|------|-----------|
| Persistent interaction mode across sessions | Over-engineering — review mode is a temporary inspection state |
| Quiz tab navigation within bottom nav (SPA-style) | Quiz.html is a separate page; SPA navigation would require major refactor |
| Prefetching adjacent page fonts | Nice optimization but adds complexity; font-display: swap handles it |
| Haptic feedback on mode toggle | Platform-specific API, browser support inconsistent |
| Gesture tutorial/onboarding | Can be added later if users are confused |

## What Already Exists

| Feature | Existing Code | Reuse |
|---------|--------------|-------|
| Swipe detection | `createSwipeHandler()` in touchHelper.js | Yes — add mode gate |
| Word tap handling | `handleWordClick()`, `handleWordTouchEnd()` | Yes — add mode gate |
| Mistake highlighting | `highlightWord()` + `currentPageMistakes` | Yes — gated by mode |
| Morphology popup | `showMorphologyPopup()` + `settingsStore.showMorphology` | Yes — gated by mode |
| Bottom nav bar | CSS + HTML in index.html | Yes — copy to quiz.html |
| Mobile menu drawer | CSS + HTML in both files | Yes — fix quiz CSS |
| Refresh function | `refreshApp()` | Yes — just move button |
| Color picker button | `cycleQuranBackgroundColor()` | Yes — toggle button goes next to it |

## Error & Rescue Map

| Method/Codepath | What Can Go Wrong | Handled? | User Sees |
|----------------|-------------------|----------|-----------|
| interactionMode toggle | Invalid state | N/A — only two valid values, controlled by single toggle | — |
| Swipe with mode='review' | User swipes while in review mode | Y — early return, no action | Nothing (intended) |
| Word tap with mode='swipe' | User taps word while in swipe mode | Y — early return, no action | Nothing (intended) |
| refreshApp() from drawer | Same as current behavior | Y — existing error handling | Same as current |
| Quiz bottom nav links | 404 if index.html doesn't exist | N/A — same-origin relative link | Browser handles |

No new async operations, external calls, or data persistence. Risk is minimal.

## Failure Modes Registry

| Codepath | Failure Mode | Rescued? | Test? | User Sees? | Logged? |
|----------|-------------|----------|-------|------------|---------|
| Mode toggle | Double-tap race | Y (ref is atomic) | Unit | Correct state | N/A |
| Swipe in review mode | Accidental swipe | Y (early return) | Unit | No page change | N/A |
| Word tap in swipe mode | Accidental word tap | Y (early return) | Unit | No highlight | N/A |
| Quiz drawer dark mode | White bg on dark theme | Y (CSS fix) | E2E | Correct colors | N/A |

No CRITICAL GAPS.

## Test Plan

### New Tests Needed

**Unit tests** (touchHelper.test.js or new file):
1. `interactionMode` toggle: swipe → review → swipe
2. Word tap ignored in swipe mode
3. Swipe ignored in review mode
4. Mistake checkbox label updates when toggled

**E2E tests** (touchInteraction.spec.js):
1. Toggle button visible on Quran text section
2. Mode switch disables/enables swipe
3. Refresh button appears in drawer menu, not in mobile header
4. Quiz page has bottom nav with 5 tabs
5. Quiz drawer renders correctly in dark mode

## Implementation Order

```
  1. Task 3: Swipe performance fixes (scroll, DB write, updateURL dedup)
  2. Task 1: interactionMode ref + toggle button + wire to swipe/word handlers
  3. Task 2: Settings checkbox labels + optional mistake mode checkbox
  4. Task 4: Hide mobile-nav + move refresh to drawer
  5. Task 5: Quiz bottom nav
  6. Task 6: Quiz drawer CSS fixes
  7. Run all tests (unit + E2E)
```

---

## Questions Summary

| # | Question | Recommended | Options |
|---|----------|-------------|---------|
| 1A | Toggle button position | A (same group as color picker) | A/B/C |
| 1B | Toggle icon choice | B (hand-pointer + highlighter) | A/B/C |
| 1C | Mode persistence | A (session-only) | A/B |
| 2A | Mistake mode settings checkbox | A (add dedicated checkbox) | A/B/C |
| 2B | Priority: mistake vs morphology | A (morphology wins) | A/B/C |
| 3A | Scroll behavior on swipe | A (instant for swipe, smooth for button) | A/B/C |
| 3B | DB write in hot path | A (guard with check) | A/B/C |
| 3C | Duplicate updateURL | A (remove from nextPage/previousPage) | A/B |
| 4A | Refresh button in drawer | A (in "Other Links" above Settings) | A/B/C |
| 4B | Top header on mobile | A (hide .mobile-nav completely) | A/B |
| 5A | Quiz bottom nav tab links | A (standard href links) | A/B |
| 6A | Quiz dark mode colors | A (match index.html palette) | A/B |
