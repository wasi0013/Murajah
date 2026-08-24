import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePartialProgressStore } from '@/stores/partialProgress'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('partialProgress store', () => {
  it('starts empty', () => {
    const s = usePartialProgressStore()
    expect(s.page).toBeNull()
    expect(s.marks).toEqual([])
    expect(s.hasProgress).toBe(false)
  })

  it('toggling an ayah marks the target page and adds a whole-ayah spec', () => {
    const s = usePartialProgressStore()
    s.toggleAyah(202, 2, 5)
    expect(s.page).toBe(202)
    expect(s.marks).toEqual([{ surah: 2, ayah: 5 }])
    expect(s.hasProgress).toBe(true)
  })

  it('toggling the same ayah again removes it', () => {
    const s = usePartialProgressStore()
    s.toggleAyah(202, 2, 5)
    s.toggleAyah(202, 2, 5)
    expect(s.marks).toEqual([])
  })

  it('switching to a different page drops prior marks rather than merging', () => {
    const s = usePartialProgressStore()
    s.toggleAyah(202, 2, 5)
    s.toggleAyah(203, 2, 40)
    expect(s.page).toBe(203)
    expect(s.marks).toEqual([{ surah: 2, ayah: 40 }])
  })

  it('clear() resets to empty', () => {
    const s = usePartialProgressStore()
    s.toggleAyah(202, 2, 5)
    s.clear()
    expect(s.page).toBeNull()
    expect(s.marks).toEqual([])
  })

  it('setAll hydrates state; snapshot round-trips a plain (proxy-free) copy', () => {
    const s = usePartialProgressStore()
    s.setAll({ page: 202, marks: [{ surah: 2, ayah: 5 }] })
    expect(s.page).toBe(202)
    expect(s.marks).toEqual([{ surah: 2, ayah: 5 }])

    const snap = s.snapshot()
    expect(snap).toEqual({ page: 202, marks: [{ surah: 2, ayah: 5 }] })
  })

  it('setAll(null) clears state', () => {
    const s = usePartialProgressStore()
    s.setAll({ page: 202, marks: [{ surah: 2, ayah: 5 }] })
    s.setAll(null)
    expect(s.page).toBeNull()
    expect(s.marks).toEqual([])
  })

  it('snapshot() is null when nothing is in progress', () => {
    const s = usePartialProgressStore()
    expect(s.snapshot()).toBeNull()
  })
})
