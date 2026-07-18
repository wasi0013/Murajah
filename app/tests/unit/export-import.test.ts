import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildExport,
  readImport,
  InvalidBackupError,
  EXPORT_APP,
  EXPORT_VERSION,
  type ExportSnapshot,
} from '@/core/storage/exportImport'
import type { LegacyExport } from '@/core/storage/legacyExport'

const legacyFixture = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/legacy-export.json'), 'utf8'),
) as LegacyExport

// A full native snapshot — every store populated, so a round-trip exercises them all.
const fullSnapshot: ExportSnapshot = {
  progress: {
    memorized: [1, 2, 3, 50, 604],
    perfectRevisions: { '1': 5, '604': 12 },
    hasanah: 4200,
    reviewData: {
      '1': {
        lastReviewDate: '2026-07-01',
        reviewCount: 3,
        interval: 6,
        easeFactor: 2.5,
        nextReviewDate: '2026-07-07',
        consecutiveCorrect: 2,
      },
    },
  },
  mistakes: { '3': [1, 4, 7], '50': [2] },
  plan: {
    scope: { kind: 'juz', juz: [30] },
    newFront: { layout: 'qpc', nextPage: 51 },
    pace: {
      newPagesPerDay: 1,
      revisionPagesPerDay: 5,
      weakPagesPerDay: 2,
      daysPerWeek: 6,
      offDays: [5],
    },
    habits: ['recite'],
    startDate: '2026-06-01',
    createdAt: '2026-06-01T00:00:00.000Z',
  },
  dayLog: {
    '2026-07-01': {
      date: '2026-07-01',
      completed: true,
      newMemorization: [51],
      revision: [1, 2],
      weak: [],
      habits: ['recite'],
    },
  },
  quiz: { '1': [1, 0, 1], '2': [1, 1] },
  audio: { grain: 'verse', verseReciterId: 'alafasy', speed: 1.25, autoScroll: true },
  reader: { layout: 'indopak', tajweed: false, textSizeStep: 4, page: 50 },
  theme: 'dark',
}

/** Simulate the file trip so nothing relies on shared object identity. */
const roundTrip = (env: unknown) => JSON.parse(JSON.stringify(env))

describe('native backup export/import', () => {
  it('wraps a snapshot in the versioned envelope', () => {
    const env = buildExport(fullSnapshot, '2026-07-18T00:00:00.000Z')
    expect(env.app).toBe(EXPORT_APP)
    expect(env.version).toBe(EXPORT_VERSION)
    expect(env.exported).toBe('2026-07-18T00:00:00.000Z')
    expect(env.data).toEqual(fullSnapshot)
  })

  it('omits keys that carry nothing, but keeps an explicit null plan (a hafiz)', () => {
    const env = buildExport({ progress: fullSnapshot.progress, plan: null })
    expect(Object.keys(env.data).sort()).toEqual(['plan', 'progress'])
    expect(env.data.plan).toBeNull()
  })

  it('round-trips a full profile losslessly through JSON', () => {
    const env = buildExport(fullSnapshot)
    const back = readImport(roundTrip(env))
    expect(back).toEqual(fullSnapshot)
  })

  it('is idempotent across a double round-trip', () => {
    const once = buildExport(readImport(roundTrip(buildExport(fullSnapshot))))
    const twice = buildExport(readImport(roundTrip(once)))
    expect(twice.data).toEqual(once.data)
  })

  it('drops keys of the wrong kind rather than corrupting a store', () => {
    const env = {
      app: EXPORT_APP,
      version: EXPORT_VERSION,
      exported: '2026-07-18T00:00:00.000Z',
      // progress must be an object; an array is rejected. theme must be a known name.
      data: { progress: [1, 2, 3], mistakes: { '3': [1] }, theme: 'neon' },
    }
    const snap = readImport(env)
    expect(snap.progress).toBeUndefined()
    expect(snap.theme).toBeUndefined()
    expect(snap.mistakes).toEqual({ '3': [1] })
  })
})

describe('legacy v2.0.0 backup import', () => {
  it('adapts the portable memorization data into the native snapshot', () => {
    const snap = readImport(roundTrip(legacyFixture))
    expect(snap.progress?.memorized).toEqual([1, 2, 3, 50, 604])
    expect(snap.progress?.perfectRevisions).toEqual({ '1': 5, '2': 3, '604': 12 })
    expect(snap.progress?.hasanah).toBe(0)
    expect(snap.mistakes).toEqual({ '3': [1, 4, 7], '50': [2] })
  })

  it('carries over cleanly-typed reader prefs only', () => {
    const snap = readImport(roundTrip(legacyFixture))
    expect(snap.reader).toEqual({ layout: 'qpc', tajweed: true })
    // The legacy goal/plan model doesn't map to the new shapes, so it's left out.
    expect(snap.plan).toBeUndefined()
    expect(snap.dayLog).toBeUndefined()
  })
})

describe('invalid input', () => {
  it('rejects non-objects', () => {
    expect(() => readImport(null)).toThrow(InvalidBackupError)
    expect(() => readImport('nope')).toThrow(InvalidBackupError)
    expect(() => readImport(42)).toThrow(InvalidBackupError)
  })

  it('rejects an unrecognized format', () => {
    expect(() => readImport({ hello: 'world' })).toThrow(/Unrecognized/)
  })

  it('rejects a native envelope with no data block', () => {
    expect(() => readImport({ app: EXPORT_APP, version: 1 })).toThrow(InvalidBackupError)
  })
})
