import { describe, it, expect } from 'vitest'
import { parseLegacyExport } from '@/core/storage/legacyExport'
import { progressFromLegacy } from '@/core/memorization/progressMigration'
import { getPageHasanah } from '@/core/memorization/pageHasanah.js'
import { serializeProgress } from '@/core/storage/userData'

const legacy = {
  version: '2.0.0',
  exported: '2020-01-01T00:00:00.000Z',
  memorized: [1, 2, 3],
  perfectRevisions: { '1': 2, '3': 1 },
  mistakes: { '3': [1, 4, 7] },
  settings: {},
  recordings: [],
  dailyGoals: { todayGoal: null, goalHistory: [], streak: 0, longestStreak: 0, selectedTasks: [] },
  notes: [],
}

describe('progressFromLegacy', () => {
  it('carries memorized + strength and seeds hasanah from prior revisions', () => {
    const p = progressFromLegacy(parseLegacyExport(legacy))
    expect(p.memorized).toEqual(new Set([1, 2, 3]))
    expect(p.strength).toEqual(new Map([[1, 2], [3, 1]]))
    // hasanah seed = Σ pageHasanah × strength
    const expected = getPageHasanah(1) * 2 + getPageHasanah(3) * 1
    expect(p.hasanah).toBe(expected)
    expect(expected).toBeGreaterThan(0)
  })

  it('serializes back to the legacy keys (round-trippable)', () => {
    const p = progressFromLegacy(parseLegacyExport(legacy))
    const stored = serializeProgress(p)
    expect(stored.memorized).toEqual([1, 2, 3])
    expect(stored.perfectRevisions).toEqual({ '1': 2, '3': 1 }) // = legacy perfectRevisions
  })
})
