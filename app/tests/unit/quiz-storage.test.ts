import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
  serializeQuizAccuracy,
  deserializeQuizAccuracy,
  loadQuizAccuracy,
  saveQuizAccuracy,
  _resetUserDataDb,
} from '@/core/storage/userData'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetUserDataDb()
})

describe('quiz accuracy serialization', () => {
  it('round-trips a page → outcomes map', () => {
    const map = new Map<number, number[]>([
      [1, [1, 0, 1]],
      [582, [0, 0, 1, 1]],
    ])
    expect(deserializeQuizAccuracy(serializeQuizAccuracy(map))).toEqual(map)
  })

  it('deserializes missing data as an empty map', () => {
    expect(deserializeQuizAccuracy(undefined).size).toBe(0)
  })
})

describe('quiz accuracy persistence', () => {
  it('saves and loads through IndexedDB', async () => {
    const map = new Map<number, number[]>([[7, [1, 1, 0]]])
    await saveQuizAccuracy(map)
    expect(await loadQuizAccuracy()).toEqual(map)
  })

  it('returns an empty map when nothing is stored', async () => {
    expect((await loadQuizAccuracy()).size).toBe(0)
  })
})
