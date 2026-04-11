# Performance Issues — Phase 2

Confirmed issues found during deep analysis. These are secondary to the critical fixes
shipped in Phase 1 (touch scroll freeze, page line index, verse text index) but should
be addressed to further improve performance on low-end mobile devices.

**STATUS: 6 of 7 items RESOLVED. Remaining item #2 carried to NEXT_MILESTONE_PLAN.md.**

---

## 1. ~~Achievement Grid — Unneeded Re-computation~~ (RESOLVED — Achievement system removed)

---

## 2. ~~Notes Search — No Debounce on Keystroke~~ (CARRIED → NEXT_MILESTONE_PLAN.md S6)

**File:** `components/NotesComponent.js` (lines ~148–167)

`filteredNotes` computed runs `.filter()` + `.sort()` with 6× `toLowerCase()` per note
on every keystroke. No debouncing on the `searchQuery` watcher.

**Fix:** Add 200ms debounce on the search input. Use a debounced ref that drives the
computed property.

---

## 3. ~~Quiz Lightning Round — Timer Memory Leak~~ (RESOLVED)

Fixed: Added `onBeforeUnmount(cleanupLightningRound)` and `beforeunload` listener
in quiz.html to clear interval on navigation.

---

## 4. ~~Quiz Auto-Navigation — Hardcoded 3s Delay~~ (RESOLVED)

Fixed: Replaced raw `setTimeout` with `scheduleAutoNext`/`skipToNext` system.
All three quiz modes now show a "Next →" skip button during the 3s wait.

---

## 5. ~~Morphology Preloader — O(n²) Word Scan~~ (RESOLVED)

Fixed: `preloadMorphologyForPage` now builds a `Map()` from `Object.values(wordsData)`
for O(1) lookup instead of O(n) `.find()` in the inner loop.

---

## 6. ~~Quiz Surah Selection — O(n²) includes() Check~~ (RESOLVED)

Fixed: Added `selectedSurahsSet = computed(() => new Set(selectedSurahs.value))`
and replaced template `.includes()` calls with `.has()` for O(1) lookups.

---

## 7. ~~Audio Player — Sorted Recordings Re-computed~~ (RESOLVED)

Fixed: New recordings inserted via `unshift` (pre-sorted newest-first).
DB-loaded recordings sorted once after load. `sortedRecordings` computed
now returns `this.recordings` directly (no re-sort).
