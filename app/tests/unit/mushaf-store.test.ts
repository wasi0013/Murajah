import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useMushafStore } from '@/stores/mushaf'

describe('mushaf store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('defaults to page 1, single mode, 604 pages', () => {
    const s = useMushafStore()
    expect(s.page).toBe(1)
    expect(s.pageCount).toBe(604)
    expect(s.spread).toBe(false)
    expect(s.visible).toEqual([1])
  })

  it('goToPage clamps to range', () => {
    const s = useMushafStore()
    s.goToPage(50)
    expect(s.page).toBe(50)
    s.goToPage(9999)
    expect(s.page).toBe(604)
    s.goToPage(0)
    expect(s.page).toBe(1)
  })

  it('single mode: next/prev step one page and expose one visible page', () => {
    const s = useMushafStore()
    s.goToPage(50)
    s.next()
    expect(s.page).toBe(51)
    expect(s.visible).toEqual([51])
    s.prev()
    expect(s.page).toBe(50)
  })

  it('spread mode: next/prev step a whole spread; visible is the RTL pair', () => {
    const s = useMushafStore()
    s.setSpread(true)
    s.goToPage(50) // spread (49,50)
    expect(s.visible).toEqual([49, 50])
    s.next()
    expect(s.page).toBe(51) // spread (51,52)
    expect(s.visible).toEqual([51, 52])
    s.prev()
    expect(s.page).toBe(49)
  })

  it('canPrev/canNext reflect the edges', () => {
    const s = useMushafStore()
    s.goToPage(1)
    expect(s.canPrev).toBe(false)
    expect(s.canNext).toBe(true)
    s.goToPage(604)
    expect(s.canNext).toBe(false)
    expect(s.canPrev).toBe(true)
  })

  it('configure updates the page count and re-clamps', () => {
    const s = useMushafStore()
    s.goToPage(604)
    s.configure(300)
    expect(s.pageCount).toBe(300)
    expect(s.page).toBe(300) // clamped down
  })

  it('snapshot/restore round-trips the page', () => {
    const s = useMushafStore()
    s.goToPage(123)
    const snap = s.snapshot()
    expect(snap).toEqual({ page: 123 })
    s.goToPage(1)
    s.restore(snap)
    expect(s.page).toBe(123)
  })
})
