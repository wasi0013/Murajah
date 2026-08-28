import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import type { ReviewSchedule, Progress } from '@/core/storage/userData'
import { normalizeSchedule } from '@/core/storage/userData'
import { getPageHasanah } from '@/core/memorization/pageHasanah.js'
import {
  calculateNextReview,
  ratingToPerformance,
  PASSING_THRESHOLD,
  type ReviewRating,
} from '@/core/memorization/reviewScheduler'
import {
  bandForStrength,
  bandByRank,
  MEMORIZED_FLOOR_STRENGTH,
  type StrengthRank,
} from '@/core/memorization/strengthBands'
import { useJournalStore } from '@/stores/journal'
import type { JournalEvent } from '@/core/storage/journalStorage'

/** Canonical Madani mushaf page count — memorization is tracked in this scheme. */
export const TOTAL_PAGES = 604

/**
 * Strength credited when a page is marked memorized directly (bulk range-mark
 * or the single-page toggle), skipping the page-by-page review loop that
 * normally builds strength one clean revision at a time (previously this left
 * strength at 0). Da'if's (Weak's) own floor — see `strengthBands.ts`'s
 * `MEMORIZED_FLOOR_STRENGTH` (the single source of truth this re-exports) —
 * so a freshly-marked page isn't indistinguishable from an untouched one.
 */
export const BULK_MARK_STRENGTH = MEMORIZED_FLOOR_STRENGTH

/** Local calendar date as `YYYY-MM-DD` (matches the weakness scorer's parsing). */
export function todayISODate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Memorization progress in the **canonical 604-page (Madani/QPC) scheme** — one
 * keyspace regardless of the reading layout (Indopak is just a view). Holds the
 * memorized set, per-page **memorization strength** (persisted under the legacy
 * `perfectRevisions` key: +1 per clean recitation, −1 per mistake, floor 0), and
 * the cumulative **hasanah** reward counter (monotonic — reading + revisions add;
 * mistakes never subtract). The reward *engine* (thresholds, coupling) lives in
 * Phase 4.1 composables; this store is the state + primitive mutations.
 */
export const useProgressStore = defineStore('progress', () => {
  const journal = useJournalStore()

  const memorized = reactive(new Set<number>())
  const strength = reactive(new Map<number, number>())
  const hasanah = ref(0)
  const readingSeconds = ref(0)
  const listeningSeconds = ref(0)
  const reviewData = reactive(new Map<number, ReviewSchedule>())

  const memorizedCount = computed(() => memorized.size)
  const isMemorized = (page: number) => memorized.has(page)
  const strengthOf = (page: number) => strength.get(page) ?? 0

  function inRange(page: number): boolean {
    return Number.isInteger(page) && page >= 1 && page <= TOTAL_PAGES
  }

  function setMemorized(page: number, on: boolean): void {
    if (!inRange(page)) return
    if (on) memorized.add(page)
    else memorized.delete(page)
  }
  /**
   * Toggle a single page's memorized flag. Marking on credits
   * {@link BULK_MARK_STRENGTH} (the same Da'if-floor starting state {@link
   * bulkMarkMemorized} uses) — but only when the page has no strength yet, so
   * a page with real review history is never clobbered, and a page a prior
   * bug (or a legacy import) left at strength 0 gets backfilled here too.
   * Without this, a freshly-marked page reads `memorized: true` with
   * `strength: 0`, and `effectiveRank`'s decay floor only papers over that at
   * *display* time — the moment the very first revision lands, raw strength
   * goes 0 → 1 and the *displayed* band would regress from Da'if to Jadid, a
   * visible downgrade for doing a revision. Crediting the floor here instead
   * keeps every later revision strictly additive. Unmarking never touches
   * strength/hasanah, matching {@link bulkMarkMemorized}.
   *
   * No hasanah for this credit — unlike `bulkMarkMemorized`'s deliberate bulk
   * registration, this is a switch flip in the per-page sheet: mis-tap the
   * wrong page, toggle it back off, and (`awardHasanah` being monotonic —
   * unmarking never refunds) a reward for a page never intended stays stuck
   * forever. The strength/anchor credit is still needed either way — it's
   * only the reward half that's unsafe here.
   */
  function toggleMemorized(page: number): boolean {
    const next = !memorized.has(page)
    setMemorized(page, next)
    if (next) creditFreshMemorization(page, { reward: false })
    return next
  }

  /**
   * Give a page its Da'if-floor starting state — {@link BULK_MARK_STRENGTH}
   * strength and a decay-clock anchor, plus proportional hasanah when
   * `reward` is true (the default) — but only while it has *no evidence at
   * all* yet: zero strength AND no review history (`reviewCount` unset/0).
   * Shared by {@link toggleMemorized} and {@link bulkMarkMemorized} so both
   * "I already know this page" entry points land a memorized page in the
   * same starting band instead of at raw strength 0 (which used to render
   * "Not Memorized" despite `memorized: true` — the bug this exists to
   * prevent). Returns whether it actually credited anything.
   *
   * The review-history exclusion matters as much here as it does in
   * `backfillReviewDates` (`core/storage/userData.ts`), for the same reason:
   * `weaknessScorer.ts` derives its revision-quality factor from
   * `perfectRevisionCount / totalReviewCount`, not `perfectRevisionCount`
   * alone. A page reviewed 5 times and never once passed (strength 0,
   * `reviewCount: 5` — genuine evidence of a struggling page) would jump to
   * a *better-than-perfect*-looking ratio (`40 / 5`, clamped to 1.0 = "all
   * perfect") the moment this bumps strength to 40, potentially dropping a
   * page that needs reinforcement out of that lane. A page with no review
   * history has no such ratio to distort — crediting it is safe.
   */
  function creditFreshMemorization(page: number, { reward = true }: { reward?: boolean } = {}): boolean {
    if (strengthOf(page) !== 0) return false
    if ((reviewData.get(page)?.reviewCount ?? 0) > 0) return false
    bumpStrength(page, BULK_MARK_STRENGTH)
    if (reward) awardHasanah(getPageHasanah(page) * BULK_MARK_STRENGTH)
    touchReviewDate(page)
    return true
  }

  /**
   * Adjust a page's memorization strength; clamped to ≥ 0. Returns the new value.
   *
   * Deliberately does **not** stamp `reviewData[page].lastReviewDate` — unlike
   * `penalizeMistake`/`setStrengthBand`/`bulkMarkMemorized`, which call
   * {@link touchReviewDate} explicitly. `recordReview` calls this *after*
   * already writing `reviewData` with its own caller-supplied *logical* date
   * (the Today engine's clock, not necessarily wall-clock now); an
   * unconditional stamp here would silently clobber that. Any future direct
   * caller of `bumpStrength` that wants the decay clock reset must call
   * `touchReviewDate` itself.
   */
  function bumpStrength(page: number, delta: number): number {
    if (!inRange(page)) return 0
    const next = Math.max(0, strengthOf(page) + delta)
    if (next === 0) strength.delete(page)
    else strength.set(page, next)
    return next
  }

  /**
   * Log a journal event (Phase 12.2) when a page's *displayed band* — not its
   * raw strength — actually crosses a `strengthBands.ts` boundary. Called from
   * the three mutation points that can move a page across a band
   * (`recordReview`, `penalizeMistake`, `setStrengthBand`) — deliberately
   * **not** from inside `bumpStrength` itself, since `bulkMarkMemorized` also
   * calls `bumpStrength` and needs its own single coalesced event (12.2.2), not
   * one `bumpStrength` call's worth of band-change noise per page.
   *
   * A no-op when the band didn't actually change (e.g. a strength bump that
   * stays within the same band). Fire-and-forget, matching `journal.addEvent`
   * itself — none of `recordReview`/`penalizeMistake`/`setStrengthBand` await
   * anything else in this store, so this can't become the one exception that
   * turns them async.
   */
  function recordBandChange(page: number, fromRank: StrengthRank, toRank: StrengthRank): void {
    if (fromRank === toRank) return
    const createdAt = new Date().toISOString()
    const event: JournalEvent = {
      id: `${toRank > fromRank ? 'band-up' : 'band-down'}:${page}:${createdAt}`,
      type: toRank > fromRank ? 'band-up' : 'band-down',
      page,
      fromRank,
      toRank,
      createdAt,
    }
    journal.addEvent(todayISODate(), event)
  }

  /**
   * Stamp `lastReviewDate` without counting a review (unlike `markReviewed`).
   * Exposed publicly (not just an internal helper) as the write path for the
   * Progress-tab sheet's manual "last revised" date editor and its "Revised
   * today" button — so it validates its input rather than trusting every
   * caller: rejects a malformed date and clamps a future date to today (the
   * calendar picker's `max` already prevents this client-side, but the store
   * shouldn't rely on the UI alone to keep the decay clock honest).
   */
  function touchReviewDate(page: number, date: string = todayISODate()): void {
    if (!inRange(page)) return
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return
    const safeDate = date > todayISODate() ? todayISODate() : date
    const prev = reviewData.get(page)
    reviewData.set(
      page,
      normalizeSchedule({ ...prev, lastReviewDate: safeDate, reviewCount: prev?.reviewCount ?? 0 }),
    )
  }

  /** Add to the cumulative hasanah total (positive only — hasanah never drops). */
  function awardHasanah(amount: number): void {
    if (amount > 0) hasanah.value += amount
  }

  /** Accumulate active reading time (positive integer seconds only). */
  function addReadingSeconds(n: number): void {
    if (n > 0) readingSeconds.value += Math.floor(n)
  }

  /** Accumulate active listening time (positive integer seconds only). */
  function addListeningSeconds(n: number): void {
    if (n > 0) listeningSeconds.value += Math.floor(n)
  }

  /**
   * Note that a page was reviewed today (reading reward earned or a clean
   * revision): sets `lastReviewDate` to today and increments `reviewCount`. Feeds
   * weakness scoring (recency + low-review penalty) — see Phase 4.8.
   */
  function markReviewed(page: number, date: string = todayISODate()): void {
    if (!inRange(page)) return
    const prev = reviewData.get(page)
    // Bump recency but preserve any SM-2 schedule — reading a page must not reset
    // its spaced-repetition state (that's driven by scheduled recalls, Phase 5.1).
    reviewData.set(
      page,
      normalizeSchedule({ ...prev, lastReviewDate: date, reviewCount: (prev?.reviewCount ?? 0) + 1 }),
    )
  }

  /**
   * Complete a scheduled revision of a page in **one** write: advance its SM-2
   * schedule (interval / ease / nextReviewDate / consecutiveCorrect via
   * {@link calculateNextReview}), bump recency (`lastReviewDate`, `reviewCount`),
   * and — for a **passing** review — award that page's hasanah and raise strength
   * (the memorization reward). A failing (`needs_work`) review resets the interval
   * and streak but leaves hasanah and strength untouched (mistakes are penalised
   * separately via `penalizeMistake`). Returns the page's strength afterwards.
   *
   * This is the completion loop: reward, schedule, and weakness scoring all update
   * from this single action — no separate plan accounting.
   *
   * `today` is the **logical** day the review belongs to — pass the Today engine's
   * clock so the schedule lands on the day the user is practising, not wall-clock now.
   */
  function recordReview(page: number, rating: ReviewRating = 'perfect', today: Date = new Date()): number {
    if (!inRange(page)) return 0
    const prev = reviewData.get(page)
    const performance = ratingToPerformance(rating)
    const step = calculateNextReview(prev, performance, { today })
    reviewData.set(
      page,
      normalizeSchedule({ ...prev, ...step, reviewCount: (prev?.reviewCount ?? 0) + 1 }),
    )
    if (performance >= PASSING_THRESHOLD) {
      awardHasanah(getPageHasanah(page))
      const fromRank = bandForStrength(strengthOf(page)).rank
      const next = bumpStrength(page, +1)
      recordBandChange(page, fromRank, bandForStrength(next).rank)
      return next
    }
    return strengthOf(page)
  }

  /**
   * A clean recitation from memory — the common case. Thin alias over
   * {@link recordReview} with a `'perfect'` rating (kept for call-site clarity).
   * Returns the new strength.
   */
  function recordPerfectRevision(page: number): number {
    return recordReview(page, 'perfect')
  }

  /**
   * A mistake on a page: strength −1 (floor 0); hasanah untouched, never
   * restored.
   *
   * Deliberately does **not** call {@link touchReviewDate}. `weaknessScorer`
   * reads `reviewData.lastReviewDate` for its recency factor (weight 0.30,
   * `min(days/30, 1)`) — stamping "today" on a mistake would zero that term
   * and could push a page *below* `WEAK_THRESHOLD`, dropping it out of the
   * weak-reinforcement lane exactly when the user signalled they got it
   * wrong. It also isn't a "revision" by the user's own definition of what
   * resets the memorization-level decay clock (recorded revisions, formal or
   * informal) — a mistake is neither.
   */
  function penalizeMistake(page: number): number {
    const fromRank = bandForStrength(strengthOf(page)).rank
    const next = bumpStrength(page, -1)
    recordBandChange(page, fromRank, bandForStrength(next).rank)
    return next
  }

  /**
   * Mark (or unmark) a whole page range as memorized in one action — the
   * Progress screen's bulk range-mark. Marking on credits each page via
   * {@link creditFreshMemorization} (only a page with no strength yet, so
   * re-running this over pages that already have real review history never
   * overwrites it, and re-running it over a page a prior bug left at 0
   * backfills it). Unmarking never touches strength/hasanah, matching the
   * single-page toggle.
   *
   * Logs **one** coalesced `'bulk-memorized'` journal event for the whole call
   * (Phase 12.2.2), not one per page — a single tap over a large range (up to
   * all 604 pages) must never turn into hundreds of per-page events; that's
   * the concrete "event storm" `recordBandChange` is deliberately not wired
   * into `bumpStrength` to avoid (see that function's doc comment).
   */
  function bulkMarkMemorized(pages: number[], on: boolean): void {
    let creditedCount = 0
    for (const page of pages) {
      setMemorized(page, on)
      if (on && creditFreshMemorization(page)) creditedCount++
    }
    if (creditedCount > 0) {
      const createdAt = new Date().toISOString()
      const event: JournalEvent = { id: `bulk-memorized:${createdAt}`, type: 'bulk-memorized', count: creditedCount, createdAt }
      journal.addEvent(todayISODate(), event)
    }
  }

  /**
   * Set a page's memorization level directly from the Progress-tab dropdown
   * (see strengthBands.ts) — the human-readable alternative to the raw
   * stepper. Writes the band's *lower bound* as the raw strength (a
   * deliberate minimum-commitment choice, not a midpoint or max — see the
   * strengthBands.ts doc comment), no-oping when the page is already in the
   * target band (so re-picking the currently-displayed band never clobbers a
   * legitimately higher raw value, e.g. 150 → 98). Does **not** touch the
   * `memorized` boolean — that stays the separate Toggle's job.
   *
   * Deliberately does **not** stamp `lastReviewDate` itself. A fat-fingered
   * level pick is easy (one dropdown tap) and easy to flip back — unlike a
   * revision, which is a deliberate act — so resetting the decay clock on
   * every pick would let an accidental change-then-revert silently mark a
   * stale page as freshly revised. The caller (the sheet UI) is responsible
   * for stamping only after the picked level has actually stuck — see
   * `ProgressView.vue`'s cooldown-debounced stamp.
   */
  function setStrengthBand(page: number, rank: StrengthRank): number {
    if (!inRange(page)) return 0
    const fromRank = bandForStrength(strengthOf(page)).rank
    if (fromRank !== rank) {
      const minStrength = bandByRank(rank).minStrength
      if (minStrength <= 0) strength.delete(page)
      else strength.set(page, minStrength)
      recordBandChange(page, fromRank, rank)
    }
    return strengthOf(page)
  }

  /** Replace all progress (migration / hydrate). */
  function setAll(p: Progress): void {
    memorized.clear()
    for (const page of p.memorized) if (inRange(page)) memorized.add(page)
    strength.clear()
    for (const [page, n] of p.strength) if (inRange(page) && n > 0) strength.set(page, n)
    reviewData.clear()
    for (const [page, r] of p.reviewData) if (inRange(page)) reviewData.set(page, r)
    hasanah.value = Math.max(0, p.hasanah)
    readingSeconds.value = Math.max(0, Math.floor(p.readingSeconds ?? 0))
    listeningSeconds.value = Math.max(0, Math.floor(p.listeningSeconds ?? 0))
  }

  /** A plain (non-reactive) copy for persistence. */
  function snapshot(): Progress {
    return {
      memorized: new Set(memorized),
      strength: new Map(strength),
      hasanah: hasanah.value,
      readingSeconds: readingSeconds.value,
      listeningSeconds: listeningSeconds.value,
      reviewData: new Map(reviewData),
    }
  }

  return {
    memorized,
    strength,
    hasanah,
    readingSeconds,
    listeningSeconds,
    reviewData,
    memorizedCount,
    isMemorized,
    strengthOf,
    setMemorized,
    toggleMemorized,
    bumpStrength,
    setStrengthBand,
    touchReviewDate,
    awardHasanah,
    addReadingSeconds,
    addListeningSeconds,
    markReviewed,
    recordReview,
    recordPerfectRevision,
    penalizeMistake,
    bulkMarkMemorized,
    setAll,
    snapshot,
  }
})
