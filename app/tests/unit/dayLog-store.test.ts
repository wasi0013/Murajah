import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDayLogStore } from '@/stores/dayLog'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('dayLog store — newMemorizationTouched', () => {
  it('isTouched is false for a page never touched', () => {
    const d = useDayLogStore()
    expect(d.isTouched('2026-07-15', 202)).toBe(false)
  })

  it('setTouched marks a page touched for a date; isTouched reflects it', () => {
    const d = useDayLogStore()
    const changed = d.setTouched('2026-07-15', 202, true)
    expect(changed).toBe(true)
    expect(d.isTouched('2026-07-15', 202)).toBe(true)
  })

  it('setTouched is idempotent — a second call with the same value reports no change', () => {
    const d = useDayLogStore()
    d.setTouched('2026-07-15', 202, true)
    expect(d.setTouched('2026-07-15', 202, true)).toBe(false)
  })

  it('setTouched(false) clears it', () => {
    const d = useDayLogStore()
    d.setTouched('2026-07-15', 202, true)
    d.setTouched('2026-07-15', 202, false)
    expect(d.isTouched('2026-07-15', 202)).toBe(false)
  })

  it('does not mark the page fully done — isPageDone stays false', () => {
    const d = useDayLogStore()
    d.setTouched('2026-07-15', 202, true)
    expect(d.isPageDone('2026-07-15', 'newMemorization', 202)).toBe(false)
  })

  it('snapshot() carries newMemorizationTouched', () => {
    const d = useDayLogStore()
    d.setTouched('2026-07-15', 202, true)
    const snap = d.snapshot()
    expect(snap.get('2026-07-15')?.newMemorizationTouched).toEqual([202])
  })
})
