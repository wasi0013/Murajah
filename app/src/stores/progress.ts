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
import { bandForStrength, bandByRank, type StrengthRank } from '@/core/memorization/strengthBands'

/** Canonical Madani mushaf page count — memorization is tracked in this scheme. */
export const TOTAL_PAGES = 604

/**
 * Strength credited when a page is bulk-marked memorized directly, skipping
 * the page-by-page review loop that normally builds strength one clean
 * revision at a time (previously this left strength at 0). Approximates ~40
 * clean revisions' worth so a bulk-marked page isn't indistinguishable from
 * an untouched one — see {@link useProgressStore}'s `bulkMarkMemorized`.
 */
export const BULK_MARK_STRENGTH = 40

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
  function toggleMemorized(page: number): boolean {
    const next = !memorized.has(page)
    setMemorized(page, next)
    return next
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

  /** Stamp `lastReviewDate` without counting a review (unlike `markReviewed`). */
  function touchReviewDate(page: number, date: string = todayISODate()): void {
    if (!inRange(page)) return
    const prev = reviewData.get(page)
    reviewData.set(page, normalizeSchedule({ ...prev, lastReviewDate: date, reviewCount: prev?.reviewCount ?? 0 }))
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
      return bumpStrength(page, +1)
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
   * restored. Also stamps `lastReviewDate` — a plain reading mistake (outside
   * a scheduled `recordReview`, e.g. marking a word wrong while reading) is
   * the one strength-mutating path that previously never touched `reviewData`
   * at all, leaving the decay clock stale for pages only ever touched this way.
   */
  function penalizeMistake(page: number, date: string = todayISODate()): number {
    const next = bumpStrength(page, -1)
    touchReviewDate(page, date)
    return next
  }

  /**
   * Mark (or unmark) a whole page range as memorized in one action — the
   * Progress screen's bulk range-mark. Marking on credits {@link BULK_MARK_STRENGTH}
   * and its proportional hasanah (at the same per-revision rate {@link recordReview}
   * uses) to each page — but only a page with no strength yet, so re-running this
   * over pages that already have real review history never overwrites it, and
   * re-running it over a page the bug already left at 0 backfills it. Unmarking
   * never touches strength/hasanah, matching the single-page toggle.
   */
  function bulkMarkMemorized(pages: number[], on: boolean): void {
    for (const page of pages) {
      setMemorized(page, on)
      if (on && strengthOf(page) === 0) {
        bumpStrength(page, BULK_MARK_STRENGTH)
        awardHasanah(getPageHasanah(page) * BULK_MARK_STRENGTH)
        touchReviewDate(page)
      }
    }
  }

  /**
   * Set a page's memorization level directly from the Progress-tab dropdown
   * (see strengthBands.ts) — the human-readable alternative to the raw
   * stepper. Writes the band's *lower bound* as the raw strength (a
   * deliberate minimum-commitment choice, not a midpoint or max — see the
   * strengthBands.ts doc comment), no-oping the strength write when the page
   * is already in the target band (so re-picking the currently-displayed
   * band never clobbers a legitimately higher raw value, e.g. 150 → 98).
   * Always stamps `lastReviewDate`, even on that no-op branch: picking a
   * level is a deliberate "this is accurate as of today" confirmation, so
   * resetting the neglect clock is correct regardless of whether the raw
   * number moved. Does **not** touch the `memorized` boolean — that stays
   * the separate Toggle's job. Returns the resulting raw strength.
   */
  function setStrengthBand(page: number, rank: StrengthRank, date: string = todayISODate()): number {
    if (!inRange(page)) return 0
    if (bandForStrength(strengthOf(page)).rank !== rank) {
      const minStrength = bandByRank(rank).minStrength
      if (minStrength <= 0) strength.delete(page)
      else strength.set(page, minStrength)
    }
    touchReviewDate(page, date)
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
