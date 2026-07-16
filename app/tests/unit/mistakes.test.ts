import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { setActivePinia, createPinia } from 'pinia'
import { useMistakesStore } from '@/stores/mistakes'
import { useMistakes } from '@/composables/useMistakes'
import { useReaderStore } from '@/stores/reader'
import {
  serializeMistakes,
  deserializeMistakes,
  loadMistakes,
  saveMistakes,
  _resetUserDataDb,
} from '@/core/storage/userData'
import { calculateAllWeaknesses } from '@/core/memorization/weaknessScorer'
import { parseLegacyExport as parseExport } from '@/core/storage/legacyExport'
import type { DataClient } from '@/core/data'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetUserDataDb()
  setActivePinia(createPinia())
})

describe('mistakes store', () => {
  it('toggles marks and exposes a global id set', () => {
    const m = useMistakesStore()
    expect(m.toggle(5, 42)).toBe(true)
    expect(m.toggle(5, 43)).toBe(true)
    expect(m.mistakeIds.has(42)).toBe(true)
    expect(m.mistakeIds.has(43)).toBe(true)

    expect(m.toggle(5, 42)).toBe(false) // unmark
    expect(m.mistakeIds.has(42)).toBe(false)
    expect(m.byPage.get(5)?.has(43)).toBe(true)
  })

  it('drops a page entry when its last mark is removed', () => {
    const m = useMistakesStore()
    m.toggle(7, 1)
    m.toggle(7, 1)
    expect(m.byPage.has(7)).toBe(false)
  })
})

describe('userData mistakes persistence', () => {
  it('serialize/deserialize round-trips the legacy shape', () => {
    const map = new Map([
      [3, new Set([1, 4, 7])],
      [9, new Set([2])],
    ])
    const stored = serializeMistakes(map)
    expect(stored).toEqual({ '3': [1, 4, 7], '9': [2] })
    expect(deserializeMistakes(stored)).toEqual(map)
  })

  it('persists to IndexedDB and reloads', async () => {
    await saveMistakes(new Map([[2, new Set([10, 11])]]))
    const reloaded = await loadMistakes()
    expect(reloaded.get(2)).toEqual(new Set([10, 11]))
  })
})

function mockData(qpcNav: Record<string, number>) {
  return {
    init: vi.fn(async () => ({})),
    getNavIndex: vi.fn(async () => ({ ayahToPage: qpcNav, surahToPage: {}, juzToPage: {} })),
  } as unknown as DataClient
}

describe('useMistakes marking', () => {
  it('keys by the current page in QPC layout', async () => {
    const reader = useReaderStore()
    reader.goToPage(50)
    const { store, markWord } = useMistakes(reader, mockData({}))
    await markWord('2:200:3', 1234)
    expect(store.byPage.get(50)?.has(1234)).toBe(true)
  })

  it('keys by the QPC page (from nav) when marking in Indopak', async () => {
    const reader = useReaderStore()
    reader.setLayout('indopak')
    reader.goToPage(52)
    // Nav says ayah 2:255 lives on QPC page 42.
    const { store, markWord } = useMistakes(reader, mockData({ '2:255': 42 }))
    await markWord('2:255:1', 5436)
    expect(store.byPage.get(42)?.has(5436)).toBe(true) // QPC page, not Indopak 52
  })
})

describe('legacy migration (3.8.2)', () => {
  it('a legacy export’s mistakes load and read unchanged by weaknessScorer', () => {
    const legacy = {
      version: '2.0.0',
      exported: '2020-01-01T00:00:00.000Z',
      memorized: [3],
      perfectRevisions: { '3': 2 },
      mistakes: { '3': [1, 4, 7] },
      settings: {},
      recordings: [],
      dailyGoals: { todayGoal: null, goalHistory: [], streak: 0, longestStreak: 0, selectedTasks: [] },
      notes: [],
    }
    const data = parseExport(legacy)
    const store = useMistakesStore()
    store.setAll(data.mistakes)

    // The three marked words show up (global membership).
    expect(store.mistakeIds.has(4)).toBe(true)
    // weaknessScorer reads the same Map<page, Set> directly.
    const scores = calculateAllWeaknesses({ pages: [3], mistakesMap: store.snapshot() })
    expect(scores.get(3)).toBeGreaterThan(0)
    // mistakeCount for page 3 is its set size (3 words).
    expect(store.snapshot().get(3)?.size).toBe(3)
  })
})
