import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useQuizStore, QUIZ_WINDOW } from '@/stores/quiz'

beforeEach(() => setActivePinia(createPinia()))

describe('useQuizStore — rolling window', () => {
  it('reports null accuracy for a never-quizzed page', () => {
    expect(useQuizStore().accuracy(5)).toBeNull()
  })

  it('averages recent outcomes', () => {
    const q = useQuizStore()
    q.record(5, true)
    q.record(5, false)
    q.record(5, true)
    expect(q.accuracy(5)).toBeCloseTo(2 / 3)
  })

  it('caps at QUIZ_WINDOW, evicting oldest (the cap)', () => {
    const q = useQuizStore()
    for (let i = 0; i < QUIZ_WINDOW; i++) q.record(5, false) // window full of wrong
    expect(q.accuracy(5)).toBe(0)
    expect(q.results.get(5)!.length).toBe(QUIZ_WINDOW)

    for (let i = 0; i < QUIZ_WINDOW; i++) q.record(5, true) // push the wrong ones out
    expect(q.accuracy(5)).toBe(1)
    expect(q.results.get(5)!.length).toBe(QUIZ_WINDOW)
  })

  it('lets a once-strong page recover a weak signal (the decay)', () => {
    const q = useQuizStore()
    for (let i = 0; i < QUIZ_WINDOW; i++) q.record(5, true) // aced it
    expect(q.accuracy(5)).toBe(1)

    // Now failing it repeatedly drags accuracy down within the window, rather than a
    // lifetime ratio keeping it looking mastered forever.
    for (let i = 0; i < QUIZ_WINDOW / 2; i++) q.record(5, false)
    expect(q.accuracy(5)).toBeLessThan(0.6)
  })

  it('accuracyByPage exposes only quizzed pages, as 0–1', () => {
    const q = useQuizStore()
    q.record(1, true)
    q.record(2, false)
    const map = q.accuracyByPage
    expect(map.get(1)).toBe(1)
    expect(map.get(2)).toBe(0)
    expect(map.has(3)).toBe(false)
  })

  it('snapshot is a plain, detached copy; setAll clamps to the window', () => {
    const q = useQuizStore()
    q.record(1, true)
    const snap = q.snapshot()
    snap.get(1)!.push(0) // mutating the copy must not touch the store
    expect(q.results.get(1)!.length).toBe(1)

    q.setAll(new Map([[9, Array.from({ length: QUIZ_WINDOW + 5 }, () => 1)]]))
    expect(q.results.get(9)!.length).toBe(QUIZ_WINDOW)
  })
})
