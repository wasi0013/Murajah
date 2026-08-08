import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { setActivePinia, createPinia } from 'pinia'
import { useMistakesStore } from '@/stores/mistakes'
import { useMistakeColorsStore } from '@/stores/mistakeColors'
import { useMistakes } from '@/composables/useMistakes'
import { useMistakesPersistence } from '@/composables/useMistakesPersistence'
import { useReaderStore } from '@/stores/reader'
import { useProgressStore } from '@/stores/progress'
import {
  serializeMistakes,
  deserializeMistakes,
  loadMistakes,
  saveMistakes,
  serializeMistakeColors,
  deserializeMistakeColors,
  loadMistakeColors,
  saveMistakeColors,
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
    await markWord('2:200:3', 1234, 'red')
    expect(store.byPage.get(50)?.has(1234)).toBe(true)
  })

  it('keys by the QPC page (from nav) when marking in Indopak', async () => {
    const reader = useReaderStore()
    reader.setLayout('indopak')
    reader.goToPage(52)
    // Nav says ayah 2:255 lives on QPC page 42.
    const { store, markWord } = useMistakes(reader, mockData({ '2:255': 42 }))
    await markWord('2:255:1', 5436, 'red')
    expect(store.byPage.get(42)?.has(5436)).toBe(true) // QPC page, not Indopak 52
  })

  it('marking a mistake drops that page’s strength; un-marking does not restore it', async () => {
    const reader = useReaderStore()
    reader.goToPage(50)
    const progress = useProgressStore()
    progress.bumpStrength(50, 5) // strong page
    const { markWord } = useMistakes(reader, mockData({}))

    await markWord('2:200:3', 1234, 'red') // mark → strength -1
    expect(progress.strengthOf(50)).toBe(4)
    await markWord('2:200:3', 1234, 'red') // un-mark → NO restore
    expect(progress.strengthOf(50)).toBe(4)
  })
})

describe('useMistakes color layer (mistakeColors.ts)', () => {
  it('paints a newly-marked word with the given color, and clears it on un-mark', async () => {
    const reader = useReaderStore()
    reader.goToPage(50)
    const colors = useMistakeColorsStore()
    const { markWord } = useMistakes(reader, mockData({}))

    await markWord('2:200:3', 1234, 'amber')
    expect(colors.byWord.get(1234)).toBe('amber')

    await markWord('2:200:3', 1234, 'teal') // already marked — un-marks, ignoring 'teal'
    expect(colors.byWord.has(1234)).toBe(false)
  })

  it('mistakes.ts membership stays binary regardless of color — weaknessScorer is unaffected', async () => {
    const reader = useReaderStore()
    reader.goToPage(50)
    const { store, markWord } = useMistakes(reader, mockData({}))

    await markWord('2:200:1', 1, 'green') // "correct" is still a mark, not a positive signal
    await markWord('2:200:2', 2, 'red')
    expect(store.snapshot().get(50)?.size).toBe(2) // plain count — color never enters scoring
  })
})

describe('userData mistake-color persistence', () => {
  it('serialize/deserialize round-trips word id → color', () => {
    const map = new Map<number, 'red' | 'amber'>([
      [1, 'red'],
      [2, 'amber'],
    ])
    const stored = serializeMistakeColors(map)
    expect(stored).toEqual({ '1': 'red', '2': 'amber' })
    expect(deserializeMistakeColors(stored)).toEqual(map)
  })

  it('persists to IndexedDB and reloads', async () => {
    await saveMistakeColors(new Map([[10, 'blue']]))
    const reloaded = await loadMistakeColors()
    expect(reloaded.get(10)).toBe('blue')
  })

  it('useMistakesPersistence hydrates and saves colors alongside marks', async () => {
    await saveMistakes(new Map([[4, new Set([99])]]))
    await saveMistakeColors(new Map([[99, 'purple']]))

    const store = useMistakesStore()
    const colors = useMistakeColorsStore()
    const { hydrate } = useMistakesPersistence(store, colors)
    await hydrate()

    expect(store.mistakeIds.has(99)).toBe(true)
    expect(colors.byWord.get(99)).toBe('purple')
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
