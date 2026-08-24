import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
  serializePlan,
  deserializePlan,
  loadPlan,
  savePlan,
  serializeDayLog,
  deserializeDayLog,
  loadDayLog,
  saveDayLog,
  loadProgress,
  loadMistakes,
  saveProgress,
  saveMistakes,
  loadPartialProgress,
  savePartialProgress,
  _resetUserDataDb,
  type PlanConfig,
  type DayLog,
  type DayRecord,
  type StoredPartialProgress,
} from '@/core/storage/userData'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetUserDataDb()
})

const samplePlan = (): PlanConfig => ({
  scope: { kind: 'juz', juz: [1, 2, 30] },
  newFront: { layout: 'qpc', nextPage: 22 },
  pace: { newPagesPerDay: 1, revisionPagesPerDay: 5, weakPagesPerDay: 2, daysPerWeek: 6, offDays: [5] },
  habits: ['recite-ayahs'],
  startDate: '2026-07-01',
  createdAt: '2026-07-01',
  revisionCursor: { lastPage: 11, lastAdvanceDate: '2026-07-14' },
})

const record = (date: string, completed: boolean): DayRecord => ({
  date,
  completed,
  newMemorization: completed ? [22] : [],
  revision: [10, 11],
  weak: [],
  habits: ['recite-ayahs'],
})

describe('plan storage', () => {
  it('serialize/deserialize round-trips a plan', () => {
    const plan = samplePlan()
    const back = deserializePlan(serializePlan(plan))
    expect(back).toEqual(plan)
  })

  it('deserializePlan returns null when absent and fills pace defaults for partial data', () => {
    expect(deserializePlan(null)).toBeNull()
    expect(deserializePlan(undefined)).toBeNull()

    // A partial legacy-ish record: missing pace fields + newFront hydrate sanely.
    const back = deserializePlan({
      scope: { kind: 'all-memorized' },
      pace: { revisionPagesPerDay: 20 },
      startDate: '2026-06-01',
    } as never)
    expect(back).not.toBeNull()
    expect(back!.scope).toEqual({ kind: 'all-memorized' })
    expect(back!.newFront).toBeNull()
    expect(back!.pace).toEqual({
      newPagesPerDay: 1,
      revisionPagesPerDay: 20,
      weakPagesPerDay: 2,
      daysPerWeek: 7,
      offDays: [],
    })
    expect(back!.habits).toEqual([])
  })

  it('persists a plan to IndexedDB and reloads it; clears on null', async () => {
    const plan = samplePlan()
    await savePlan(plan)
    expect(await loadPlan()).toEqual(plan)

    await savePlan(null)
    expect(await loadPlan()).toBeNull()
  })

  it('defaults to null when no plan has been stored', async () => {
    expect(await loadPlan()).toBeNull()
  })
})

describe('day log storage', () => {
  it('serialize/deserialize round-trips the day log', () => {
    const log: DayLog = new Map([
      ['2026-07-14', record('2026-07-14', true)],
      ['2026-07-15', record('2026-07-15', false)],
    ])
    const back = deserializeDayLog(serializeDayLog(log))
    expect(back).toEqual(log)
  })

  it('persists the day log to IndexedDB and reloads; empty when absent', async () => {
    expect((await loadDayLog()).size).toBe(0)

    const log: DayLog = new Map([['2026-07-15', record('2026-07-15', true)]])
    await saveDayLog(log)
    const back = await loadDayLog()
    expect(back.get('2026-07-15')).toEqual(record('2026-07-15', true))
  })
})

describe('partial progress storage', () => {
  const sample = (): StoredPartialProgress => ({
    page: 202,
    marks: [
      { surah: 2, ayah: 5 },
      { surah: 2, ayah: 7, wordStart: 1, wordEnd: 3 },
    ],
  })

  it('defaults to null when nothing has been stored', async () => {
    expect(await loadPartialProgress()).toBeNull()
  })

  it('persists partial progress to IndexedDB and reloads it; clears on null', async () => {
    const p = sample()
    await savePartialProgress(p)
    expect(await loadPartialProgress()).toEqual(p)

    await savePartialProgress(null)
    expect(await loadPartialProgress()).toBeNull()
  })

  it('does not mutate the caller when saving reactive-proxy-shaped input', async () => {
    const marks = sample().marks
    await savePartialProgress({ page: 202, marks })
    const back = await loadPartialProgress()
    expect(back).toEqual({ page: 202, marks })
    // storage returns its own copy, not the same array reference
    expect(back!.marks).not.toBe(marks)
  })
})

describe('key isolation', () => {
  it('plan + dayLog writes do not disturb progress / mistakes', async () => {
    await saveProgress({
      memorized: new Set([50]),
      strength: new Map([[50, 3]]),
      hasanah: 9000,
      reviewData: new Map(),
    })
    await saveMistakes(new Map([[7, new Set([1, 2])]]))

    await savePlan(samplePlan())
    await saveDayLog(new Map([['2026-07-15', record('2026-07-15', true)]]))

    const progress = await loadProgress()
    const mistakes = await loadMistakes()
    expect(progress.memorized.has(50)).toBe(true)
    expect(progress.hasanah).toBe(9000)
    expect(mistakes.get(7)).toEqual(new Set([1, 2]))
    // and the new keys are intact
    expect(await loadPlan()).not.toBeNull()
    expect((await loadDayLog()).size).toBe(1)
  })
})
