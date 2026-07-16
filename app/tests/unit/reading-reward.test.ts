import { describe, it, expect } from 'vitest'
import {
  initReadingReward,
  tickReadingReward,
  type ReadingRewardState,
} from '@/core/memorization/readingReward'

/** Run a sequence of active-second deltas, summing awarded units. */
function run(deltas: number[]): { units: number; state: ReadingRewardState } {
  let state = initReadingReward()
  let units = 0
  for (const d of deltas) {
    const r = tickReadingReward(state, d)
    state = r.state
    units += r.units
  }
  return { units, state }
}

describe('reading reward accrual', () => {
  it('awards nothing before 90s', () => {
    expect(run([30, 30, 29]).units).toBe(0) // 89s
  })

  it('awards ×1 at 90s', () => {
    const { units, state } = run([60, 30]) // 90s
    expect(units).toBe(1)
    expect(state.grantedAt90).toBe(true)
    expect(state.grantedAt250).toBe(false)
  })

  it('awards ×2 total by 250s (×1 at 90, +1 at 250)', () => {
    expect(run([90, 100, 60]).units).toBe(2) // 250s
  })

  it('never double-grants a threshold within a session', () => {
    // Sit well past 250s in many ticks — still only 2 units total.
    expect(run([100, 100, 100, 100, 100]).units).toBe(2)
  })

  it('grants both at once if a single tick jumps past both thresholds', () => {
    const r = tickReadingReward(initReadingReward(), 300)
    expect(r.units).toBe(2)
  })

  it('ignores idle (only fed active time) and negative deltas', () => {
    // Simulate: 80s active, then a big idle gap is simply not fed, then 10s → 90s.
    expect(run([80, -50, 10]).units).toBe(1)
  })

  it('a fresh session (re-init) can re-earn', () => {
    const first = run([250])
    expect(first.units).toBe(2)
    const second = run([250]) // new session
    expect(second.units).toBe(2)
  })
})
