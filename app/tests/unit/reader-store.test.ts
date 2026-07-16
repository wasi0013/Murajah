import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useReaderStore, READING_SIZES } from '@/stores/reader'
import { remapPage, ayahAtPageTop } from '@/core/navigation/remapPage'
import type { NavIndex } from '@/core/data/types'

describe('reader store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('defaults to QPC page 1 with tajweed on, read mode', () => {
    const r = useReaderStore()
    expect(r.page).toBe(1)
    expect(r.layout).toBe('qpc')
    expect(r.tajweed).toBe(true)
    expect(r.mode).toBe('read')
    expect(r.pageCount).toBe(604)
  })

  it('clamps paging at both ends of the active layout', () => {
    const r = useReaderStore()
    r.prevPage()
    expect(r.page).toBe(1) // can't go below 1
    r.goToPage(604)
    r.nextPage()
    expect(r.page).toBe(604) // can't exceed QPC count
    r.goToPage(9999)
    expect(r.page).toBe(604)
    r.goToPage(-5)
    expect(r.page).toBe(1)
  })

  it('configure() injects real page counts and re-clamps', () => {
    const r = useReaderStore()
    r.goToPage(604)
    r.setLayout('indopak')
    expect(r.pageCount).toBe(610)
    r.goToPage(610)
    expect(r.page).toBe(610)
    // A lower reported count re-clamps the current page.
    r.configure({ indopak: 600 })
    expect(r.page).toBe(600)
  })

  it('setLayout applies a caller-remapped page (same ayah preserved)', () => {
    const r = useReaderStore()
    r.goToPage(50)
    // Caller computed that QPC p50's ayah lives on Indopak p52.
    r.setLayout('indopak', 52)
    expect(r.layout).toBe('indopak')
    expect(r.page).toBe(52)
    // Remapped page is still clamped to the target layout.
    r.setLayout('qpc', 99999)
    expect(r.page).toBe(604)
  })

  it('text size steps clamp to the scale', () => {
    const r = useReaderStore()
    r.setTextSizeStep(-3)
    expect(r.textSizeStep).toBe(0)
    expect(r.readingSize).toBe(READING_SIZES[0])
    r.setTextSizeStep(999)
    expect(r.textSizeStep).toBe(READING_SIZES.length - 1)
  })

  it('tajweedActive only true on QPC with tajweed on', () => {
    const r = useReaderStore()
    expect(r.tajweedActive).toBe(true)
    r.toggleTajweed()
    expect(r.tajweedActive).toBe(false)
    r.toggleTajweed()
    r.setLayout('indopak')
    expect(r.tajweed).toBe(true) // toggle state kept…
    expect(r.tajweedActive).toBe(false) // …but never active on Indopak
  })

  it('toggles and mode switching are independent', () => {
    const r = useReaderStore()
    r.toggleWbw()
    r.toggleTafsir()
    expect(r.wbw).toBe(true)
    expect(r.tafsir).toBe(true)
    expect(r.tajweed).toBe(true) // untouched
    r.toggleMode()
    expect(r.mode).toBe('mark-mistake')
    r.setMode('read')
    expect(r.mode).toBe('read')
  })
})

// remapPage against the real generated nav indexes (present after a build).
const PUBLIC = resolve(process.cwd(), 'public')
const navPath = (l: string) => resolve(PUBLIC, `data/nav/${l}.json`)
let qpcNav: NavIndex | undefined
let indoNav: NavIndex | undefined
try {
  qpcNav = JSON.parse(readFileSync(navPath('qpc'), 'utf8'))
  indoNav = JSON.parse(readFileSync(navPath('indopak'), 'utf8'))
} catch {
  /* fixtures not built — integration block skips */
}

describe.skipIf(!qpcNav)('remapPage (real nav fixtures)', () => {
  it('finds the ayah being read at the top of a page', () => {
    expect(ayahAtPageTop(qpcNav!, 1)).toBe('1:1')
    expect(ayahAtPageTop(qpcNav!, 42)).toBeTruthy() // Ayat al-Kursi page
  })

  it('keeps the same ayah when switching layouts', () => {
    // Ayat al-Kursi (2:255) is QPC page 42; remap round-trips to the Indopak
    // page that also contains 2:255, and back.
    const ayahPageQpc = qpcNav!.ayahToPage['2:255']
    const indoTarget = remapPage(qpcNav!, indoNav!, ayahPageQpc)
    expect(ayahAtPageTop(indoNav!, indoTarget)).toBeTruthy()
    // The remapped Indopak page must actually contain 2:255's start-or-before.
    expect(indoTarget).toBe(indoNav!.ayahToPage['2:255'])
  })

  it('page 1 maps to page 1 in both directions', () => {
    expect(remapPage(qpcNav!, indoNav!, 1)).toBe(1)
    expect(remapPage(indoNav!, qpcNav!, 1)).toBe(1)
  })
})
