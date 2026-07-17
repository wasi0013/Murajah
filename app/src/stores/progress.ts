import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import type { PageReview, Progress } from '@/core/storage/userData'
import { getPageHasanah } from '@/core/memorization/pageHasanah.js'

/** Canonical Madani mushaf page count — memorization is tracked in this scheme. */
export const TOTAL_PAGES = 604

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
  const reviewData = reactive(new Map<number, PageReview>())

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

  /** Adjust a page's memorization strength; clamped to ≥ 0. Returns the new value. */
  function bumpStrength(page: number, delta: number): number {
    if (!inRange(page)) return 0
    const next = Math.max(0, strengthOf(page) + delta)
    if (next === 0) strength.delete(page)
    else strength.set(page, next)
    return next
  }

  /** Add to the cumulative hasanah total (positive only — hasanah never drops). */
  function awardHasanah(amount: number): void {
    if (amount > 0) hasanah.value += amount
  }

  /**
   * Note that a page was reviewed today (reading reward earned or a clean
   * revision): sets `lastReviewDate` to today and increments `reviewCount`. Feeds
   * weakness scoring (recency + low-review penalty) — see Phase 4.8.
   */
  function markReviewed(page: number, date: string = todayISODate()): void {
    if (!inRange(page)) return
    const prev = reviewData.get(page)
    reviewData.set(page, { lastReviewDate: date, reviewCount: (prev?.reviewCount ?? 0) + 1 })
  }

  /**
   * Record a clean recitation from memory: strength +1 **and** hasanah += that
   * page's weight (the memorization reward), and mark the page reviewed today.
   * Returns the new strength.
   */
  function recordPerfectRevision(page: number): number {
    if (!inRange(page)) return 0
    awardHasanah(getPageHasanah(page))
    markReviewed(page)
    return bumpStrength(page, +1)
  }

  /** A mistake on a page: strength −1 (floor 0); hasanah untouched, never restored. */
  function penalizeMistake(page: number): number {
    return bumpStrength(page, -1)
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
  }

  /** A plain (non-reactive) copy for persistence. */
  function snapshot(): Progress {
    return {
      memorized: new Set(memorized),
      strength: new Map(strength),
      hasanah: hasanah.value,
      reviewData: new Map(reviewData),
    }
  }

  return {
    memorized,
    strength,
    hasanah,
    reviewData,
    memorizedCount,
    isMemorized,
    strengthOf,
    setMemorized,
    toggleMemorized,
    bumpStrength,
    awardHasanah,
    markReviewed,
    recordPerfectRevision,
    penalizeMistake,
    setAll,
    snapshot,
  }
})
