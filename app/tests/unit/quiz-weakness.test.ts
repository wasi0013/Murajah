import { describe, it, expect } from 'vitest'
import { calculateAllWeaknesses } from '@/core/memorization/weaknessScorer'

// Phase 6.3 — the reserved hook, wired. The store hands `accuracyByPage` (a
// Map<page, 0..1>) to the daily-task generator, which forwards it here. This proves
// the Map plumbing works and moves the score in the right direction; the full
// fail-a-quiz → reinforcement-lane loop is an e2e that needs the quiz UI (6.5/6.6).

const TODAY = new Date('2026-07-15')

describe('quiz accuracy feeds weakness scoring', () => {
  it('a page with low quiz accuracy scores weaker than one with none', () => {
    const noQuiz = calculateAllWeaknesses({ pages: [1], today: TODAY }).get(1)!
    const failing = calculateAllWeaknesses({
      pages: [1],
      quizScores: new Map([[1, 0]]), // a Map, exactly as the store exposes it
      today: TODAY,
    }).get(1)!
    expect(failing).toBeGreaterThan(noQuiz)
  })

  it('a page being aced in quizzes scores stronger than one with none', () => {
    const noQuiz = calculateAllWeaknesses({ pages: [1], today: TODAY }).get(1)!
    const acing = calculateAllWeaknesses({
      pages: [1],
      quizScores: new Map([[1, 1]]),
      today: TODAY,
    }).get(1)!
    expect(acing).toBeLessThan(noQuiz)
  })

  it('leaves a page with no quiz data at the neutral baseline', () => {
    // Two pages, only one quizzed — the un-quizzed page must be unaffected by the
    // other's quiz history (no cross-contamination through the Map).
    const scores = calculateAllWeaknesses({
      pages: [1, 2],
      quizScores: new Map([[1, 0]]),
      today: TODAY,
    })
    const baseline = calculateAllWeaknesses({ pages: [2], today: TODAY }).get(2)!
    expect(scores.get(2)).toBe(baseline)
  })
})
