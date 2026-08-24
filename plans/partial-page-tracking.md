# Partial-Page Memorization Tracking

## Problem Statement

How might we let a child who memorizes less than a page a day mark, see, and get credit for real daily progress, expressed the way memorization actually happens (verse by verse), without ever showing anyone a raw fraction like 0.25.

## Recommended Direction

Mark progress directly on the rendered mushaf page by tapping verses and words. Show progress everywhere else (the daily task, streaks, the journal, reward points) in lines. Verses are the truth; lines are the one unit humans read back.

This reuses machinery that already exists for a different feature, not a new invention grafted on:

- `ReadingSurface.vue` already stamps every rendered word, including the small circled ayah-number glyph at the end of each verse, with `data-loc`, `data-verse`, and a `word-states` class hook. Verified: the glyph is a normal addressable word, so "tap the verse number" is not a new hit target to invent.
- `previewRoute.ts` already defines the exact data shape this needs: `PageHighlightSpec` (`{surah, ayah, wordStart?, wordEnd?}`), plus `togglePageWordHighlight` / `expandPageSpec`, which already implement tap-to-toggle-a-word with correct un-mark behavior. Today it drives an ephemeral, URL-encoded share feature; the same shape and toggle logic apply directly to a persistent, store-backed "memorized" state, just swapping the source of truth from the URL to user data.
- `pageVerses.ts` states a verified precondition: every one of the 6236 verses sits wholly on a single page in both layouts. That makes "this page's marks now cover every word on the page" an always-well-defined test, so the page-complete flip into the existing `memorizedPages` set never has an edge case to handle.
- `journalStorage.ts` (Phase 12) already solved "one dated, capped, de-duplicated event log, read by a calendar/day-sheet UI" for strength-band changes and bulk-memorize actions. The same log, one new event type, is the natural home for "memorized verses X-Y of page 202" rather than a new field.
- Checked live: QPC layout has 602/604 pages at exactly 15 lines (only pages 1-2, the decorative Fatiha opening, have 8). Verse count per page swings from 3-4 up to 40 (page 585). That confirms lines as the one stable display/target unit, and rules out verses or a fixed preset (1/4, 1/2, 3/4) as the target unit, since neither means the same thing on every page.

## Decisions Made

- Daily target stays "1 page" in framing, unchanged. No new `linesPerDay` setting.
- Any forward progress on the plan's front page completes that day's streak, whether or not a full page finished. No minimum threshold to hit.
- Marking is restricted to the current plan front page (`NewFront.nextPage`) only. A kid cannot mark ahead or behind it.
- No kid-vs-parent distinction on marks. One shared mark state per page.
- Progress is narrated in the Journal: "Memorized verses X-Y of page 202."

## Data Model

**Cumulative, per page (live state, "what's marked so far on the front page"):**

```
partialProgress: Map<page, PageHighlightSpec[]>
```

Same shape `/preview` already uses. Only the current front page ever has an entry (marking is restricted to it). Once fully covered, the page graduates into `memorizedPages` and the entry is cleared; `NewFront.nextPage` then advances as it does today.

**Day-scoped marker (drives streak/task completion only, not the narrative):**

```
DayRecord.newMemorizationTouched?: number[]
```

A minimal sibling to the existing `newMemorization: number[]` (which still records pages *fully* finished that day, unchanged). There is no `memorizeDaily` task object in the live system — `dailyGoalsManager.js`'s task-init glue is superseded by the adaptive Today queue (`streaks.ts`'s own comment says so). The real integration point is `useToday.ts`'s `completedTasks` computed: it currently counts a `newMemorization` page as satisfied only via `dayLog.isDone('newMemorization', page)`, which only becomes true through the existing full-completion path (`complete()`). `completedTasks` needs a second check alongside `isDone`, something like `touched.includes(page)`, so a partial mark on the front page satisfies that slot without setting the same `isDone` flag `complete()` itself is gated on (see the risk below). This keeps `dayLog.setPageDone`'s existing contract intact — it still only ever means "this page is actually finished."

`streaks.ts`'s `hasWork(r: DayRecord)` sums `newMemorization.length + revision.length + weak.length + habits.length` to decide whether a day was worked at all, and `useJournalMonth` shares this so the history calendar and the Journal calendar agree. `newMemorizationTouched` must be added to that sum too, or a day where a kid only marked partial verses (no full page, no revision, no weak pages) renders as `'none'` (never opened the app) on both calendars — exactly the false-negative `hasWork`'s own doc comment says the model exists to avoid. It does not duplicate the actual marks; `partialProgress` is the only place those live.

**Journal (the narrative, read by the calendar/day-sheet UI, not by task logic):**

A new `JournalEvent` type, `'verses-memorized'`:

```
{ id: `verses-memorized:${page}:${date}`, type: 'verses-memorized', page, fromAyah, toAyah, createdAt }
```

`fromAyah`/`toAyah` are the lowest/highest ayah touched by *today's* delta on that page (an honest approximation when a day's marks aren't contiguous, acceptable for a narrative entry since `partialProgress` remains the precise ledger). `applyJournalEvent` already dedupes by `(page, type)` within a date and replaces in place, so calling `appendJournalEvent(today, event)` again later the same day naturally updates "verses 5-6" to "verses 5-8" instead of accumulating duplicate entries. No new mechanism needed there. The Journal UI formats the sentence via `t()`, matching how `band-up`/`band-down` events are already rendered, so it stays translated (ar/bn/en) rather than a hardcoded English string in storage.

**Page-complete flip:** when a page's cumulative marks cover every word on it, it moves into `memorizedPages` exactly as a whole page does today. Nothing downstream changes: `reviewRange` rotation, `weaknessScorer`, `PageDotsGrid`, and hasanah-on-completion all keep working unmodified, because from their point of view a page either is or is not memorized, same as now.

## Interaction Model

- **Tap a verse's end glyph** toggles that whole verse: unmarked to a whole-ayah spec (`{surah, ayah}`), marked back to nothing. This is the "tap the verse number" gesture, and it needs no snapping logic since a whole-ayah spec is already what the reused shape represents.
- **Tap one word, then a second word anywhere on the page** marks the full reading-order span between them, split into one word-range spec per ayah spanned (`surah.ayah:wordStart-wordEnd`, the same token `/preview` already parses and serializes). Deliberately **not** snapped to whole verses: on a page with a handful of long verses (early Baqarah), a kid partway through one verse still needs the fill to move day over day. Storing exactly what was tapped, rather than rounding to enclosing verses, is what keeps that true.
- Tapping an already-marked word or glyph clears it. Symmetric with `togglePageWordHighlight`'s existing behavior.
- Marks are a set, not a cursor, so bottom-up, middle-out, or scattered memorization all just work, with no special-casing for order.
- Marking only ever targets the plan's current front page; the marking view opens on that page and doesn't offer navigation to any other unmemorized page.
- Reopening the front page on any later day shows everything marked so far, pre-highlighted. Nothing to remember or retype.

## Derived Display (computed, never stored, never typed)

- **Lines filled**: a line counts as filled only when every word on it is covered by a mark. Exact, never fractional, and reads the same way on a 3-verse page as on page 585's 40. This feeds the 15-strip fill visual on the Today task.
- **Hasanah trickle** (deferred, see MVP Scope): `getPageHasanah(page)` prorated by the fraction of that page's *words* currently marked (word-precise, not line-rounded), so a small addition mid-line still ticks the reward. Not in the MVP — the full-page hasanah award still fires once, on page completion, exactly as `recordReview` already does today.

## MVP Scope

**In:** cumulative per-page marks on the front page only, verse-glyph tap (whole-ayah toggle), the persistent word-state renderer built on `ReadingSurface` + `word-states` (a new, store-backed sibling to `/preview`'s URL-driven one, not a modification of it), `DayRecord.newMemorizationTouched`, the "any progress completes the day" streak rule, the `verses-memorized` journal event, the line-fill visual on the Today task, page-complete auto-flip into `memorizedPages`.

**Out for now, add after validating the assumptions below:** the two-tap word-range gesture (ship verse-glyph-tap-only first), hasanah proration (ship flat/on-completion reward first, add the trickle once the marking flow is proven).

## Key Assumptions to Validate

- [ ] A line-precision fill (not a verse count, not a raw percent) actually reads as motivating to a small child and their parent, and doesn't confuse. Pilot with 3-5 families before rolling out to all 100+.
- [ ] The two-tap range-select gesture earns its complexity over "just tap each verse-glyph." Watch whether pilot users ever use range-select, or only ever tap verse by verse, before building it.
- [ ] Parents and kids are comfortable marking directly on the real mushaf page (the current `/preview`-style rendering) rather than a simplified widget. Watch for confusion or drop-off specifically on the marking screen in week one.

## Not Doing (and Why)

- **Audio-inferred progress** (estimating how far a kid recited from a recording, no manual marking at all) - a real idea, but a distinct, much larger project (speech alignment) that shouldn't block a data-model change that's ready to build now.
- **Partial tracking on the revision/review lane** - `reviewRange` only ever operates on pages already in `memorizedPages`; a page isn't eligible for revision until it's fully marked, so "revising 60% of a page" is a different, unanswered question this feature doesn't need to solve.
- **Multi-color/multi-state marks** (e.g. "shaky" vs "solid" per verse) - `/preview`'s six-color system exists for sharing, not for this. Reusing its color concept here would conflate two unrelated features, and there's no evidence yet that binary marked/unmarked isn't enough.
- **Marking ahead of or behind the plan front page** - decided against; the front page is the only markable page, keeping `NewFront.nextPage` a single pointer with no new "in-progress set" concept.
- **Distinguishing who made a mark** - decided against; one shared mark state per page, no kid/parent attribution.
- **A `linesPerDay` setting** - decided against; the daily target stays "1 page" in framing, and completion no longer depends on a numeric threshold at all.

## Open Questions

- Same-day, non-contiguous marks (e.g. verse 3 then verse 9, skipping the middle) get narrated as "verses 3-9" in the journal, an honest approximation, not a precise ledger. Worth a second look once real usage shows how often that happens.
- Whether the word-range gesture (if it ships) needs its own light onboarding hint (e.g. "tap two words to mark everything between"), since it's a less obvious affordance than tapping a verse glyph.
