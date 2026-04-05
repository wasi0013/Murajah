# Next Iteration Plan — Bugs, Performance & Code Quality

> Generated from QA full-mode sweep and pre-landing review of the audioPlayMode fix.
> **All items require manual approval before implementation.**

---

## Pre-Landing Review: audioPlayMode Fix (current diff)

**Files changed:** 4 | **Lines:** +266 / -6 | **Assessment: LOOKS GOOD WITH NITS 🟡**

### Critical Issues

None found ✅

### Informational Issues

🟡 **INFO #1: Double persistence on radio change**
- **File:** [source/index.html](../source/index.html) — `updateSettings()` (L8286) + watcher (L9879)
- **Problem:** When user clicks a radio button, `@change` calls `updateSettings()` which calls `persistAudioPlayMode()` + `saveDataBackground()`. The watcher on `settingsStore.audioPlayMode` also fires and calls the same two functions again. Redundant but idempotent.
- **Suggestion:** Remove `persistAudioPlayMode()` from `updateSettings()` and let the watcher handle all audioPlayMode persistence exclusively. Or vice versa — remove the redundancy from one side.

🟡 **INFO #2: Same redundancy in `switchFont()`**
- **File:** [source/index.html](../source/index.html) — `switchFont()` (L7420)
- **Problem:** `switchFont()` sets `settingsStore.audioPlayMode = 'verse'` and then explicitly calls `persistAudioPlayMode('verse')`. The watcher already handles this.
- **Suggestion:** Remove the explicit `persistAudioPlayMode('verse')` call — the watcher covers it.

### Verdict

Ship it. The dual-channel persistence (localStorage + IndexedDB) is correct and solves the reported bug. The minor redundancy is defensive, not harmful.

---

## QA Health Score: **62 / 100**

| Category | Score | Notes |
|----------|-------|-------|
| Core functionality (memorization, quiz) | 85 | Stable, well-tested |
| Audio subsystem | 45 | Multiple bugs, memory leaks, fetch bug |
| Data loading / caching | 55 | Race conditions, no cleanup, growing state |
| Stores (notes, i18n, settings) | 60 | Optimistic UI without rollback |
| Utilities (calculations, daily goals) | 70 | Input validation gaps |
| Test coverage | 75 | 687 unit + 169 E2E passing |

---

## Category 1: Audio Subsystem — CRITICAL

### Bug A1: `fetch mode: 'no-cors'` makes response.ok always false
- **File:** `source/resources/js/utils/audioLoader.js` — Line 58
- **Severity:** 🔴 Critical
- **Problem:** `fetch(url, { mode: 'no-cors' })` returns an opaque response where `response.ok` is always `false`. The code checks `response.ok` and falls through to fallback, meaning the primary audio URL is never used successfully. Audio only works because the fallback URL happens to work.
- **Fix:** Remove `mode: 'no-cors'` or switch to `mode: 'cors'`. If CORS headers aren't available from the audio CDN, use `new Audio(url)` directly instead of fetch.

### Bug A2: SURAH_PAGE_RANGES boundary collision
- **File:** `source/resources/js/utils/audioLoader.js` — Lines 95–112
- **Severity:** 🟡 Medium
- **Problem:** Page ranges for surahs use inclusive boundaries. If two surahs share a page boundary (e.g., surah ends on page N and next starts on page N), the `find()` at line 108 returns the first matching surah, which may be wrong.
- **Fix:** Adjust to use half-open ranges `[start, end)` or add verse-level disambiguation.

### Bug A3: Silent reciter fallback mask real errors
- **File:** `source/resources/js/utils/audioLoader.js` — Line 153
- **Severity:** 🟡 Medium
- **Problem:** When a reciter's audio fails to load, the code silently falls back to a default reciter without notifying the user. User thinks they're hearing their selected reciter but they're not.
- **Fix:** Show a toast notification when falling back: "Audio for [reciter] unavailable, using default."

### Bug A4: Seek when duration = 0 causes NaN
- **File:** `source/resources/js/components/QuranAudioPlayerComponent.js`
- **Severity:** 🟡 Medium
- **Problem:** Seeking when `audio.duration` is 0 or NaN (before metadata loads) produces NaN seek position. Can freeze the player.
- **Fix:** Guard seek with `if (isFinite(audio.duration) && audio.duration > 0)`.

### Bug A5: Mode switching during playback
- **File:** `source/resources/js/components/QuranAudioPlayerComponent.js`
- **Severity:** 🟡 Medium
- **Problem:** Switching between verse/page mode while audio is playing doesn't stop or reset playback. Can cause the player to be in an inconsistent state where it tracks verses but plays page audio (or vice versa).
- **Fix:** Stop playback and reset state when `audioPlayMode` prop changes.

### Memory Leak A6: Event listeners not cleaned up on unmount
- **File:** `source/resources/js/components/QuranAudioPlayerComponent.js`
- **Severity:** 🔴 High
- **Problem:** `addEventListener` calls in `onMounted` have no corresponding `removeEventListener` in `onUnmounted`. On frequent mount/unmount cycles (page navigation), listeners accumulate.
- **Fix:** Store listener references and remove them in `onUnmounted`. Or use `{ once: true }` where appropriate.

### Memory Leak A7: Blob URLs never revoked in FloatingAudioPlayer
- **File:** `source/resources/js/components/FloatingAudioPlayerComponent.js`
- **Severity:** 🟡 Medium
- **Problem:** `URL.createObjectURL(blob)` is called for each recording but `URL.revokeObjectURL()` is never called when recordings are replaced or component unmounts. Each blob URL holds a reference to the audio data in memory.
- **Fix:** Track created URLs and revoke them in `onUnmounted` and when replacing recordings.

### Memory Leak A8: Preloaded Audio objects never released
- **File:** `source/resources/js/utils/audioLoader.js`
- **Severity:** 🟡 Medium
- **Problem:** Audio objects created for preloading are never explicitly released. References accumulate in closures.
- **Fix:** Set `audio.src = ''` and remove event listeners after preload completes or fails.

### Performance A9: O(n) page-verse lookup on every call
- **File:** `source/resources/js/utils/audioLoader.js`
- **Severity:** 🟡 Medium
- **Problem:** `getPageVerses()` uses `.filter()` across all verses on every call instead of using an indexed lookup. Called during audio playback, this adds latency per verse transition.
- **Fix:** Build a `Map<page, verse[]>` lookup once at init time.

### Performance A10: No memoization in QuranAudioPlayer
- **File:** `source/resources/js/components/QuranAudioPlayerComponent.js`
- **Severity:** 🟡 Low
- **Problem:** Computed properties that derive page-level data (verse lists for current page, etc.) recalculate on every render.
- **Fix:** Use `computed()` with proper dependency tracking or memoize with a key.

### Bug A11: Empty MIME type fallback in audioRecorder
- **File:** `source/resources/js/utils/audioRecorder.js`
- **Severity:** 🟡 Medium
- **Problem:** If no supported MIME type is detected, the code falls back to an empty string which creates a MediaRecorder with unreliable output format. Playback may fail on some browsers.
- **Fix:** Throw an explicit error if no MIME type is supported instead of silently proceeding.

### Memory Leak A12: Audio chunk accumulation
- **File:** `source/resources/js/utils/audioRecorder.js`
- **Severity:** 🟡 Low
- **Problem:** Recording chunks are pushed to an array during recording but the array is never cleared between recordings. If a user records multiple times without page reload, memory grows.
- **Fix:** Clear the chunks array in `startRecording()`.

---

## Category 2: Data Loading & Caching

### Bug D1: `scheduleResourceRefresh` timeout never cleaned up
- **File:** `source/resources/js/utils/unifiedDataLoader.js` — Lines 273–290
- **Severity:** 🟡 Medium
- **Problem:** `setTimeout` in `scheduleResourceRefresh` is never cancelled. If `loadAllQuranData` is called 100 times (e.g., rapid layout switching), 100 pending timeouts accumulate. Each timeout's callback may update stale cache references.
- **Fix:** Store the timeout ID and clear it before scheduling a new one. Use a `Map<key, timeoutId>` for tracking.

### Bug D2: Race condition in concurrent layout loads
- **File:** `source/resources/js/utils/unifiedDataLoader.js` — Line 296
- **Severity:** 🟡 Medium
- **Problem:** `resourceRefreshState` key is based on `resourceConfig.key + cacheId`. If multiple concurrent layout loads share the same key, the second request skips scheduling while the first timeout is still pending.
- **Fix:** Use a generation counter / abort signal pattern to invalidate stale requests.

### Memory Leak D3: `resourceRefreshState` grows indefinitely
- **File:** `source/resources/js/utils/unifiedDataLoader.js` — Line 273
- **Severity:** 🟡 Low
- **Problem:** Each unique layout/resource pair adds a key to `resourceRefreshState` that's never deleted (line 290 just sets to `false`). If app runs for hours/days, this object grows.
- **Fix:** Use `WeakMap` or periodically trim old entries.

### Memory Leak D4: `requestIdleCallback` without cancellation
- **File:** `source/resources/js/utils/unifiedDataLoader.js` — Lines 330–340
- **Severity:** 🟡 Low
- **Problem:** `loadTafsirLazy` scheduled via `requestIdleCallback` or `setTimeout(5000)` has no cleanup mechanism. If the user navigates away, the callback still fires and tries to update the store.
- **Fix:** Track the callback ID and cancel it in a cleanup function.

### Performance D5: `getWordByIdLookup` rebuilds on every reference change
- **File:** `source/resources/js/utils/unifiedDataLoader.js` — Lines 115–125
- **Severity:** 🟡 Medium
- **Problem:** Rebuilds entire word lookup map (77k+ words) whenever `wordsData` reference changes. ~100–200ms on each rebuild.
- **Fix:** Use a stable reference check (deep equality or version counter) to avoid unnecessary rebuilds.

### Performance D6: `getPageLineIndex` O(n) scan
- **File:** `source/resources/js/utils/unifiedDataLoader.js` — Lines 140–160
- **Severity:** 🟡 Medium
- **Problem:** Iterates through all ~9000 pages every time `layoutData` reference changes. O(n) scan ~50–100ms on low-end devices.
- **Fix:** Build index once and cache it. Invalidate only on layout change.

### Performance D7: `getPageText` rebuilds wordById on every call
- **File:** `source/resources/js/utils/dataLoader.js` — Lines 99–120
- **Severity:** 🟡 Medium
- **Problem:** Builds `wordById` map on every call. For a 10-page render, this is 10 × O(77k) = O(770k) operations.
- **Fix:** Cache the `wordById` map and invalidate on data load only.

### Performance D8: Same wordById rebuild in `getPageWordsDetailed`
- **File:** `source/resources/js/utils/dataLoader.js` — Lines 219–245
- **Severity:** 🟡 Medium
- **Problem:** Identical issue to D7. Both functions should share a cached lookup.
- **Fix:** Extract shared `getOrBuildWordById()` utility with caching.

---

## Category 3: Stores (Notes, i18n, Settings)

### Bug S1: Optimistic UI delete without rollback in notesStore
- **File:** `source/resources/js/stores/notesStore.js` — Lines 177–183
- **Severity:** 🟡 Medium
- **Problem:** `deleteNote` removes from `notesStore.notes` array BEFORE calling `murajahDB.deleteNote`. If DB call fails, the note is gone from UI but still in DB. Next reload shows it again — confusing.
- **Fix:** Delete from DB first, then remove from UI on success. Or add rollback on failure.

### Bug S2: Optimistic UI save without rollback in notesStore
- **File:** `source/resources/js/stores/notesStore.js` — Lines 154–166
- **Severity:** 🟡 Medium
- **Problem:** `saveNote` updates in-memory array before `murajahDB.saveNote` completes. If DB call fails, in-memory state is corrupted.
- **Fix:** Same pattern — DB first, then UI. Or rollback on error.

### Bug S3: `setLocale` race condition in i18nStore
- **File:** `source/resources/js/stores/i18nStore.js` — Line 66
- **Severity:** 🟡 Low
- **Problem:** If `setLocale('ar')` is called twice rapidly, the second call might use stale messages since `currentLocale` is set synchronously after the async `fetchLocale`.
- **Fix:** Add a generation counter / in-flight check. If locale changed while fetching, discard result.

### Bug S4: Failed locale fetch leaves app in broken state
- **File:** `source/resources/js/stores/i18nStore.js` — Line 62
- **Severity:** 🟡 Medium
- **Problem:** If `fetchLocale` fails, `currentLocale` is already updated to the new locale but messages are empty/stale. App shows broken translations.
- **Fix:** Only update `currentLocale` after successful fetch. Keep previous locale on failure.

### Memory Leak S5: Blob URL leak in notes download
- **File:** `source/resources/js/stores/notesStore.js` — Lines 254–260
- **Severity:** 🟡 Low
- **Problem:** `URL.createObjectURL(blob)` may leak if an exception occurs between creation and `revokeObjectURL`. No `try-finally` wrapper.
- **Fix:** Wrap in `try-finally` to ensure revocation.

### Performance S6: Notes filter runs 6× toLowerCase per note per keystroke
- **File:** `source/resources/js/stores/notesStore.js` — Lines 126–139
- **Severity:** 🟡 Medium
- **Problem:** `filterNotes` calls `.toLowerCase()` on 6 fields per note on every keystroke. For 1000 notes, 6000 string operations per keystroke with no debounce.
- **Fix:** Add 200ms debounce on filter input. Pre-compute lowercased search fields when notes are loaded.

---

## Category 4: Daily Goals & Calculations

### Bug U1: Streak calculation edge case
- **File:** `source/resources/js/utils/dailyGoalsManager.js` — Lines 286–290
- **Severity:** 🟡 Low
- **Problem:** If yesterday is incomplete but today is complete, `calculateStreak` returns 0 instead of 1. First complete day should be streak = 1.
- **Fix:** Adjust logic to count today's completion as streak = 1 even if yesterday is incomplete.

### Bug U2: `calculatePageScore` doesn't validate page bounds
- **File:** `source/resources/js/utils/calculations.js` — Lines 237–243
- **Severity:** 🟡 Low
- **Problem:** Accepts `pageNum: 999` without validation. Invalid page numbers silently produce wrong results.
- **Fix:** Add bounds check (1–604 for QPC, 1–610 for Indopak) with early return for out-of-range.

### Performance U3: `generateMistakeBubbles` iterates 604 pages every call
- **File:** `source/resources/js/utils/calculations.js` — Lines 189–207
- **Severity:** 🟡 Medium
- **Problem:** Creates 604 objects on every call. If called during scroll/render, significant GC pressure.
- **Fix:** Memoize result and invalidate only when mistake data changes.

### Performance U4: `generateMemorizedGrid` same 604-page iteration
- **File:** `source/resources/js/utils/calculations.js` — Lines 214–229
- **Severity:** 🟡 Medium
- **Problem:** Same issue as U3. Called frequently during UI interactions.
- **Fix:** Memoize with memorization state as cache key.

---

## Priority Matrix

### P0 — Fix Immediately (next session)
| ID | Issue | Impact |
|----|-------|--------|
| A1 | `fetch mode: 'no-cors'` always fails | Audio primary URL never works, relying entirely on fallback |
| A6 | Event listener leak in QuranAudioPlayer | Memory grows on every page navigation |

### P1 — Fix Soon (within 1–2 sessions)
| ID | Issue | Impact |
|----|-------|--------|
| A3 | Silent reciter fallback | UX confusion — user hears wrong reciter |
| A4 | Seek when duration = 0 | Player can freeze |
| A5 | Mode switch during playback | Inconsistent player state |
| A7 | Blob URL leak in FloatingAudioPlayer | Memory grows per recording |
| S1 | Optimistic delete without rollback | UI/DB desync on failure |
| S2 | Optimistic save without rollback | UI/DB desync on failure |
| D1 | Timeout accumulation in resource refresh | Stale cache updates after rapid switching |

### P2 — Fix When Convenient
| ID | Issue | Impact |
|----|-------|--------|
| A2 | Page range boundary collision | Wrong surah detection at boundaries |
| A8 | Preloaded Audio objects not released | Gradual memory growth |
| A11 | Empty MIME type fallback | Recording may fail on some browsers |
| A12 | Chunk accumulation between recordings | Memory growth on repeated recordings |
| D2 | Race condition in concurrent loads | Stale data after rapid layout switches |
| D3 | resourceRefreshState grows indefinitely | Minor memory growth over long sessions |
| D4 | requestIdleCallback without cancellation | Stale callback after navigation |
| S3 | setLocale race condition | Stale messages on rapid locale switch |
| S4 | Failed locale fetch breaks UI | Broken translations on network error |
| S5 | Blob URL leak in notes download | Minor memory leak |
| U1 | Streak calculation edge case | Incorrect streak display |
| U2 | Page score validation | Wrong score for invalid pages |

### P3 — Performance Optimization Sprint
| ID | Issue | Impact |
|----|-------|--------|
| D5 | getWordByIdLookup rebuilds 77k map | 100–200ms per rebuild |
| D6 | getPageLineIndex O(n) scan | 50–100ms on low-end devices |
| D7 | getPageText rebuilds wordById per call | O(770k) ops for 10-page render |
| D8 | getPageWordsDetailed same rebuild | Duplicate of D7 |
| A9 | O(n) page-verse lookup | Latency per verse transition |
| S6 | Notes filter 6× toLowerCase per keystroke | Janky search with many notes |
| U3 | generateMistakeBubbles 604-page iter | GC pressure during scroll |
| U4 | generateMemorizedGrid 604-page iter | GC pressure during UI updates |

---

## Recommended Approach

1. **P0 first** — Fix A1 (no-cors fetch) and A6 (event listener leak). These are active bugs affecting all users.
2. **P1 batch** — Group the audio UX bugs (A3–A5, A7) into one PR and the store bugs (S1, S2, D1) into another.
3. **P2 as encountered** — Fix these when touching the relevant files for other work.
4. **P3 as a dedicated sprint** — The performance issues (D5–D8, A9, S6, U3, U4) are all variants of "build index once, cache, invalidate on change." They can be addressed together with a shared caching utility.

---

## Test Coverage Gaps Identified

- No E2E test for audio playback (verse-by-verse or page-by-page actually playing audio)
- No unit test for `audioLoader.js` at all
- No unit test for `getPageVerses()` / `SURAH_PAGE_RANGES` boundary logic
- No test for notes download/export flow
- No test for i18n locale switching failure handling
- No test for daily goals streak edge cases (today complete, yesterday not)
- No test for `generateMistakeBubbles` / `generateMemorizedGrid` with boundary inputs

---

*Total issues: 25 bugs/leaks + 8 performance issues = 33 items*
*Estimated effort: P0 (1 session), P1 (2 sessions), P2 (as-needed), P3 (1 dedicated sprint)*
