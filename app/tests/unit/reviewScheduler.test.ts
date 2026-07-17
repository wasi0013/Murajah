import { describe, it, expect } from 'vitest'
import {
  calculateNextReview,
  mapToPerformance,
  ratingToPerformance,
  PERFORMANCE,
  PASSING_THRESHOLD,
  MIN_EASE_FACTOR,
  DEFAULT_EASE_FACTOR,
  MAX_INTERVAL,
} from '@/core/memorization/reviewScheduler'

const TODAY = new Date('2026-04-10T00:00:00')
const TODAY_STR = '2026-04-10'
const opts = { today: TODAY }

describe('reviewScheduler — calculateNextReview (SM-2 step)', () => {
  it('resets interval + streak on a failing recall (perf < 3)', () => {
    const r = calculateNextReview(
      { interval: 7, easeFactor: 2.5, consecutiveCorrect: 3 },
      PERFORMANCE.MINOR_MISTAKES,
      opts,
    )
    expect(r.interval).toBe(1)
    expect(r.consecutiveCorrect).toBe(0)
  })

  it('grows interval 1 → 3 → ×ease across consecutive passes', () => {
    const first = calculateNextReview(
      { interval: 1, easeFactor: 2.5, consecutiveCorrect: 0 },
      PERFORMANCE.CORRECT,
      opts,
    )
    expect(first.interval).toBe(1)
    expect(first.consecutiveCorrect).toBe(1)

    const second = calculateNextReview(
      { interval: 1, easeFactor: 2.5, consecutiveCorrect: 1 },
      PERFORMANCE.CORRECT,
      opts,
    )
    expect(second.interval).toBe(3)
    expect(second.consecutiveCorrect).toBe(2)

    // 3 * 2.5 = 7.5 → rounds to 8
    const third = calculateNextReview(
      { interval: 3, easeFactor: 2.5, consecutiveCorrect: 2 },
      PERFORMANCE.CORRECT,
      opts,
    )
    expect(third.interval).toBe(8)
    expect(third.consecutiveCorrect).toBe(3)
  })

  it('caps the interval at MAX_INTERVAL (and honours a custom cap)', () => {
    const capped = calculateNextReview(
      { interval: 20, easeFactor: 2.5, consecutiveCorrect: 5 },
      PERFORMANCE.PERFECT,
      opts,
    )
    expect(capped.interval).toBeLessThanOrEqual(MAX_INTERVAL)

    const beginnerCap = calculateNextReview(
      { interval: 10, easeFactor: 2.5, consecutiveCorrect: 5 },
      PERFORMANCE.PERFECT,
      { ...opts, maxInterval: 14 },
    )
    expect(beginnerCap.interval).toBeLessThanOrEqual(14)
  })

  it('never lets ease factor fall below MIN_EASE_FACTOR', () => {
    let data: ReturnType<typeof calculateNextReview> = {
      interval: 1,
      easeFactor: 1.3,
      consecutiveCorrect: 0,
      nextReviewDate: TODAY_STR,
      lastReviewDate: TODAY_STR,
    }
    for (let i = 0; i < 10; i++) {
      data = calculateNextReview(data, PERFORMANCE.TOTAL_FAILURE, opts)
    }
    expect(data.easeFactor).toBeGreaterThanOrEqual(MIN_EASE_FACTOR)
  })

  it('raises ease on a perfect recall, lowers it on a barely-passing one', () => {
    const perfect = calculateNextReview(
      { interval: 3, easeFactor: 2.5, consecutiveCorrect: 2 },
      PERFORMANCE.PERFECT,
      opts,
    )
    expect(perfect.easeFactor).toBeGreaterThan(2.5)

    const hesitant = calculateNextReview(
      { interval: 3, easeFactor: 2.5, consecutiveCorrect: 2 },
      PERFORMANCE.HESITATION,
      opts,
    )
    expect(hesitant.easeFactor).toBeLessThan(2.5)
  })

  it('sets nextReviewDate = today + interval and lastReviewDate = today', () => {
    const r = calculateNextReview(
      { interval: 1, easeFactor: 2.5, consecutiveCorrect: 1 },
      PERFORMANCE.CORRECT,
      opts,
    )
    expect(r.interval).toBe(3)
    expect(r.nextReviewDate).toBe('2026-04-13')
    expect(r.lastReviewDate).toBe(TODAY_STR)
  })

  it('tolerates a null/partial schedule and clamps performance to 0–5', () => {
    const fromNull = calculateNextReview(null, PERFORMANCE.CORRECT, opts)
    expect(fromNull.interval).toBe(1)
    expect(fromNull.easeFactor).toBeGreaterThanOrEqual(MIN_EASE_FACTOR)

    const tooLow = calculateNextReview(
      { interval: 3, easeFactor: 2.5, consecutiveCorrect: 2 },
      -5,
      opts,
    )
    expect(tooLow.interval).toBe(1) // clamped to 0 → treated as a fail
  })
})

describe('reviewScheduler — mapToPerformance', () => {
  it('scales with perfect-revision count', () => {
    expect(mapToPerformance({ perfectRevisionCount: 3 })).toBe(5)
    expect(mapToPerformance({ perfectRevisionCount: 2 })).toBe(4)
    expect(mapToPerformance({ perfectRevisionCount: 1 })).toBe(3)
    expect(mapToPerformance({ perfectRevisionCount: 0 })).toBe(2)
  })

  it('subtracts for mistakes and adjusts for quiz accuracy', () => {
    expect(mapToPerformance({ perfectRevisionCount: 3, mistakeCount: 5 })).toBe(3)
    expect(mapToPerformance({ perfectRevisionCount: 3, mistakeCount: 1 })).toBe(4)
    expect(mapToPerformance({ perfectRevisionCount: 1, quizAccuracy: 0.95 })).toBe(4)
    expect(mapToPerformance({ perfectRevisionCount: 1, quizAccuracy: 0.3 })).toBe(2)
  })

  it('lets a user rating override, and clamps to 0–5', () => {
    expect(mapToPerformance({ perfectRevisionCount: 0, userRating: 'perfect' })).toBe(4)
    expect(mapToPerformance({ perfectRevisionCount: 3, userRating: 'needs_work' })).toBe(2)
    const worst = mapToPerformance({ perfectRevisionCount: 0, mistakeCount: 5, quizAccuracy: 0.2 })
    expect(worst).toBeGreaterThanOrEqual(0)
    expect(worst).toBeLessThanOrEqual(5)
    expect(mapToPerformance()).toBeGreaterThanOrEqual(0)
  })
})

describe('reviewScheduler — ratingToPerformance', () => {
  it('maps the completion-loop vocabulary onto the SM-2 scale', () => {
    expect(ratingToPerformance('perfect')).toBe(PERFORMANCE.PERFECT)
    expect(ratingToPerformance('good')).toBe(PERFORMANCE.CORRECT)
    expect(ratingToPerformance('good')).toBeGreaterThanOrEqual(PASSING_THRESHOLD)
    expect(ratingToPerformance('needs_work')).toBeLessThan(PASSING_THRESHOLD)
  })

  it('exposes the expected constants', () => {
    expect(PASSING_THRESHOLD).toBe(3)
    expect(MIN_EASE_FACTOR).toBe(1.3)
    expect(DEFAULT_EASE_FACTOR).toBe(2.5)
    expect(MAX_INTERVAL).toBe(21)
  })
})
