import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { setActivePinia, createPinia } from 'pinia'
import { useProgressStore } from '@/stores/progress'
import {
  serializeProgress,
  deserializeProgress,
  loadProgress,
  saveProgress,
  _resetUserDataDb,
  type Progress,
} from '@/core/storage/userData'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetUserDataDb()
  setActivePinia(createPinia())
})

describe('progress store', () => {
  it('toggles memorized pages within the 604 range', () => {
    const p = useProgressStore()
    expect(p.toggleMemorized(10)).toBe(true)
    expect(p.isMemorized(10)).toBe(true)
    expect(p.memorizedCount).toBe(1)
    expect(p.toggleMemorized(10)).toBe(false)
    expect(p.isMemorized(10)).toBe(false)
    // out of range ignored
    p.setMemorized(0, true)
    p.setMemorized(605, true)
    expect(p.memorizedCount).toBe(0)
  })

  it('bumps strength with a floor at 0', () => {
    const p = useProgressStore()
    expect(p.bumpStrength(5, +1)).toBe(1)
    expect(p.bumpStrength(5, +1)).toBe(2)
    expect(p.bumpStrength(5, -1)).toBe(1)
    expect(p.bumpStrength(5, -5)).toBe(0) // floored
    expect(p.strengthOf(5)).toBe(0)
    expect(p.strength.has(5)).toBe(false) // dropped at 0
  })

  it('hasanah only ever increases', () => {
    const p = useProgressStore()
    p.awardHasanah(1390)
    p.awardHasanah(1600)
    expect(p.hasanah).toBe(2990)
    p.awardHasanah(-500) // ignored
    expect(p.hasanah).toBe(2990)
  })

  it('recordPerfectRevision raises strength + awards that page hasanah', () => {
    const p = useProgressStore()
    expect(p.recordPerfectRevision(1)).toBe(1) // page 1 weight = 1390
    expect(p.hasanah).toBe(1390)
    expect(p.recordPerfectRevision(1)).toBe(2)
    expect(p.hasanah).toBe(2780)
    expect(p.strengthOf(1)).toBe(2)
  })

  it('penalizeMistake lowers strength (floor 0) but never hasanah', () => {
    const p = useProgressStore()
    p.recordPerfectRevision(1) // strength 1, hasanah 1390
    p.recordPerfectRevision(1) // strength 2, hasanah 2780
    expect(p.penalizeMistake(1)).toBe(1)
    expect(p.hasanah).toBe(2780) // unchanged
    p.penalizeMistake(1)
    p.penalizeMistake(1) // already 0 → stays 0
    expect(p.strengthOf(1)).toBe(0)
    expect(p.hasanah).toBe(2780)
  })

  it('markReviewed records a dated, counted review (and a clean revision marks one)', () => {
    const p = useProgressStore()
    p.markReviewed(10, '2026-07-10')
    p.markReviewed(10, '2026-07-15')
    expect(p.reviewData.get(10)).toEqual({ lastReviewDate: '2026-07-15', reviewCount: 2 })

    // recordPerfectRevision also bumps review data for that page.
    p.recordPerfectRevision(20)
    expect(p.reviewData.get(20)?.reviewCount).toBe(1)

    // out of range ignored
    p.markReviewed(0, '2026-07-15')
    p.markReviewed(605, '2026-07-15')
    expect(p.reviewData.has(0)).toBe(false)
    expect(p.reviewData.has(605)).toBe(false)
  })
})

describe('progress persistence', () => {
  it('serialize/deserialize round-trips (with legacy keys)', () => {
    const p: Progress = {
      memorized: new Set([3, 1, 2]),
      strength: new Map([
        [3, 4],
        [9, 0], // zero dropped on serialize
      ]),
      hasanah: 12345,
      reviewData: new Map([[3, { lastReviewDate: '2026-07-15', reviewCount: 2 }]]),
    }
    const stored = serializeProgress(p)
    expect(stored).toEqual({
      memorized: [1, 2, 3],
      perfectRevisions: { '3': 4 },
      hasanah: 12345,
      reviewData: { '3': { lastReviewDate: '2026-07-15', reviewCount: 2 } },
    })
    const back = deserializeProgress(stored)
    expect(back.memorized).toEqual(new Set([1, 2, 3]))
    expect(back.strength).toEqual(new Map([[3, 4]]))
    expect(back.hasanah).toBe(12345)
    expect(back.reviewData).toEqual(new Map([[3, { lastReviewDate: '2026-07-15', reviewCount: 2 }]]))
  })

  it('persists to IndexedDB and reloads', async () => {
    const p = useProgressStore()
    p.setMemorized(50, true)
    p.bumpStrength(50, +3)
    p.awardHasanah(9000)
    p.markReviewed(50, '2026-07-14')
    await saveProgress(p.snapshot())

    setActivePinia(createPinia())
    const p2 = useProgressStore()
    p2.setAll(await loadProgress())
    expect(p2.isMemorized(50)).toBe(true)
    expect(p2.strengthOf(50)).toBe(3)
    expect(p2.hasanah).toBe(9000)
    expect(p2.reviewData.get(50)).toEqual({ lastReviewDate: '2026-07-14', reviewCount: 1 })
  })

  it('defaults hasanah to 0 and review data to empty when the record is absent', async () => {
    const loaded = await loadProgress()
    expect(loaded.hasanah).toBe(0)
    expect(loaded.reviewData.size).toBe(0)
  })
})
