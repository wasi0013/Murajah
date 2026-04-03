# Performance Issues — Phase 2

Confirmed issues found during deep analysis. These are secondary to the critical fixes
shipped in Phase 1 (touch scroll freeze, page line index, verse text index) but should
be addressed to further improve performance on low-end mobile devices.

---

## 1. ~~Achievement Grid — Unneeded Re-computation~~ (RESOLVED — Achievement system removed)

---

## 2. Notes Search — No Debounce on Keystroke

**File:** `components/NotesComponent.js` (lines ~148–167)

`filteredNotes` computed runs `.filter()` + `.sort()` with 6× `toLowerCase()` per note
on every keystroke. No debouncing on the `searchQuery` watcher.

**Fix:** Add 200ms debounce on the search input. Use a debounced ref that drives the
computed property.

---

## 3. Quiz Lightning Round — Timer Memory Leak

**File:** `../../quiz.html` (~line 2695)

`setInterval` for the lightning timer is never cleaned up if the user navigates away
mid-round. No `onBeforeUnmount` or `onUnmounted` hook clears the interval.

**Fix:** Add `onUnmounted(() => clearInterval(lightningTimerId.value))`.

---

## 4. Quiz Auto-Navigation — Hardcoded 3s Delay

**File:** `../../quiz.html` (lines ~2113, 2526, 2588)

After answering a question, a `setTimeout(() => generateNewQuestion(), 3000)` forces a
3-second pause. Users on fast devices cannot skip ahead.

**Fix:** Use animation-end detection or allow tap-to-skip.

---

## 5. Morphology Preloader — O(n²) Word Scan (Dormant)

**File:** `utils/morphologyLoader.js` (~line 137)

`preloadMorphologyForPage` uses `Object.values(wordsData).find(w => w.id === wid)` inside
a loop over all words on a page — O(600 × 77,000) per call. Currently **not called** in
production code, but if re-enabled it would freeze the UI for ~500ms per page navigation.

**Fix:** Accept a `wordById` lookup map (from `getWordByIdLookup()` in unifiedDataLoader)
instead of raw `wordsData`.

---

## 6. Quiz Surah Selection — O(n²) includes() Check

**File:** `../../quiz.html` (~line 1580)

`selectedSurahs.includes(number)` inside a `v-for` over 114 surahs is O(n) per item =
O(n²) on each toggle.

**Fix:** Use a `Set` for `selectedSurahs` and check with `.has()`.

---

## 7. Audio Player — Sorted Recordings Re-computed

**File:** `components/FloatingAudioPlayerComponent.js` (line ~193)

`sortedRecordings` computed spreads and re-sorts the entire recordings array
on every render.

**Fix:** Keep recordings pre-sorted on insert; avoid re-sort in computed.
