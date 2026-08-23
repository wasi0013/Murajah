import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  backfillReviewDates,
  loadProgress,
  saveProgress,
  deserializeProgress,
  _resetUserDataDb,
  type Progress,
} from '@/core/storage/userData'
import { importUserData, readImport } from '@/core/storage/exportImport'
import type { LegacyExport } from '@/core/storage/legacyExport'

const legacyFixture = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/legacy-export.json'), 'utf8'),
) as LegacyExport

function emptyProgress(overrides: Partial<Progress> = {}): Progress {
  return {
    memorized: new Set(),
    strength: new Map(),
    hasanah: 0,
    reviewData: new Map(),
    ...overrides,
  }
}

describe('backfillReviewDates (pure)', () => {
  it('stamps today for a strength>0 page with no reviewData entry', () => {
    const p = emptyProgress({ strength: new Map([[5, 40]]) })
    const { progress, changedCount } = backfillReviewDates(p, '2026-08-23')
    expect(changedCount).toBe(1)
    expect(progress.reviewData.get(5)?.lastReviewDate).toBe('2026-08-23')
  })

  it('does not touch strength<=0 pages', () => {
    const p = emptyProgress({ strength: new Map([[5, 0]]) })
    const { progress, changedCount } = backfillReviewDates(p, '2026-08-23')
    expect(changedCount).toBe(0)
    expect(progress.reviewData.has(5)).toBe(false)
  })

  it('leaves an existing, already-stamped reviewData entry untouched', () => {
    const p = emptyProgress({
      strength: new Map([[5, 40]]),
      reviewData: new Map([
        [5, { lastReviewDate: '2020-01-01', reviewCount: 3, interval: 4, easeFactor: 2.5, nextReviewDate: '2020-01-05', consecutiveCorrect: 1 }],
      ]),
    })
    const { progress, changedCount } = backfillReviewDates(p, '2026-08-23')
    expect(changedCount).toBe(0)
    expect(progress.reviewData.get(5)?.lastReviewDate).toBe('2020-01-01')
  })

  it('is idempotent: running it twice on its own output is a no-op', () => {
    const p = emptyProgress({ strength: new Map([[5, 40], [9, 98]]) })
    const first = backfillReviewDates(p, '2026-08-23')
    expect(first.changedCount).toBe(2)
    const second = backfillReviewDates(first.progress, '2026-09-01')
    expect(second.changedCount).toBe(0)
    // The second (later) date must never overwrite the first stamp.
    expect(second.progress.reviewData.get(5)?.lastReviewDate).toBe('2026-08-23')
  })

  it('does not mutate the input progress object', () => {
    const p = emptyProgress({ strength: new Map([[5, 40]]) })
    backfillReviewDates(p, '2026-08-23')
    expect(p.reviewData.has(5)).toBe(false)
  })
})

describe('loadProgress() self-persists the backfill', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
    _resetUserDataDb()
  })

  it('stamps missing review dates on first load and the stamp survives a second load unchanged', async () => {
    // Save a StoredProgress blob directly (bypassing loadProgress), simulating
    // pre-migration on-disk data: strength but no reviewData at all.
    await saveProgress(
      deserializeProgress({ memorized: [1, 2], perfectRevisions: { '1': 40, '2': 90 }, hasanah: 0 }),
    )

    const first = await loadProgress()
    expect(first.reviewData.get(1)?.lastReviewDate).toBeTruthy()
    expect(first.reviewData.get(2)?.lastReviewDate).toBeTruthy()
    const stampedDate = first.reviewData.get(1)!.lastReviewDate

    // A second load must not re-stamp — proves the backfill actually wrote through.
    const second = await loadProgress()
    expect(second.reviewData.get(1)?.lastReviewDate).toBe(stampedDate)
  })
})

describe('importUserData backfills a legacy import', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
    _resetUserDataDb()
  })

  it('stamps review dates for every strength>0 page from a v2.0.0 backup with no reviewData field', async () => {
    const snap = readImport(legacyFixture)
    expect(snap.progress?.reviewData).toBeUndefined() // legacy carries none

    await importUserData(snap)

    const progress = await loadProgress()
    for (const [page, strength] of progress.strength) {
      if (strength > 0) expect(progress.reviewData.get(page)?.lastReviewDate).toBeTruthy()
    }
  })
})
