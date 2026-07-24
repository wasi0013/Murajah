import { describe, it, expect } from 'vitest'
import { estimateCompletion } from '@/core/memorization/completion'

describe('estimateCompletion', () => {
  const today = new Date('2026-07-18T09:00:00')

  it('projects a finish date from remaining pages and pace', () => {
    const e = estimateCompletion(100, 2, today)
    expect(e.daysRemaining).toBe(50)
    expect(e.completionDate).toBe('2026-09-06') // +50 days
    expect(e.complete).toBe(false)
  })

  it('rounds partial days up', () => {
    expect(estimateCompletion(5, 2, today).daysRemaining).toBe(3)
  })

  it('has no estimate when the pace is 0 (no fabricated date)', () => {
    const e = estimateCompletion(100, 0, today)
    expect(e.daysRemaining).toBeNull()
    expect(e.completionDate).toBeNull()
    expect(e.complete).toBe(false)
  })

  it('reports complete when nothing remains', () => {
    const e = estimateCompletion(0, 2, today)
    expect(e.complete).toBe(true)
    expect(e.daysRemaining).toBe(0)
    expect(e.completionDate).toBe('2026-07-18')
  })

  it('never divides by zero or returns Infinity', () => {
    const e = estimateCompletion(604, 0, today)
    expect(Number.isFinite(e.daysRemaining ?? 0)).toBe(true)
  })
})
