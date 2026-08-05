import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { setActivePinia, createPinia } from 'pinia'
import { useReaderStore } from '@/stores/reader'
import { getPref, setPref, _resetPrefsDb } from '@/core/storage/prefs'
import { useReaderPersistence } from '@/composables/useReaderPersistence'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetPrefsDb()
  setActivePinia(createPinia())
})

describe('reader store snapshot/restore', () => {
  it('snapshot captures every persistable field', () => {
    const r = useReaderStore()
    r.goToPage(120)
    r.setLayout('indopak')
    r.toggleWbw()
    r.setTextSizeStep(4)
    r.toggleMode() // default is mark-mistake, so this flips to read
    expect(r.snapshot()).toEqual({
      page: 120,
      layout: 'indopak',
      tajweed: true,
      wbw: true,
      wbwLang: 'en',
      tafsir: false,
      tafsirLang: 'en',
      textSizeStep: 4,
      mode: 'read',
    })
  })

  it('restore applies layout before clamping the page', () => {
    const r = useReaderStore()
    // page 610 is valid only under Indopak; restore must set layout first.
    r.restore({ layout: 'indopak', page: 610 })
    expect(r.layout).toBe('indopak')
    expect(r.page).toBe(610)
  })

  it('restore ignores missing fields and clamps bad values', () => {
    const r = useReaderStore()
    r.setTextSizeStep(3)
    r.restore({ tajweed: false, page: 99999, textSizeStep: 999 })
    expect(r.tajweed).toBe(false)
    expect(r.page).toBe(604) // clamped to QPC
    expect(r.textSizeStep).toBe(5) // clamped to scale max
    expect(r.mode).toBe('mark-mistake') // untouched (default)
  })
})

describe('prefs KV', () => {
  it('round-trips values through IndexedDB', async () => {
    expect(await getPref('reader')).toBeUndefined()
    await setPref('reader', { page: 7 })
    expect(await getPref<{ page: number }>('reader')).toEqual({ page: 7 })
  })
})

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('useReaderPersistence', () => {
  it('debounce-persists changes and rehydrates into a fresh store', async () => {
    const r = useReaderStore()
    const { dispose } = useReaderPersistence(r)

    r.goToPage(200)
    r.setLayout('indopak', 205)
    r.toggleTajweed()
    // Debounced: nothing written synchronously.
    expect(await getPref('reader')).toBeUndefined()

    await wait(400) // let the 300ms debounce fire + write settle
    dispose()

    // Fresh store + persistence: hydrate restores the saved slice.
    setActivePinia(createPinia())
    const r2 = useReaderStore()
    const p2 = useReaderPersistence(r2)
    await p2.hydrate()
    expect(r2.layout).toBe('indopak')
    expect(r2.page).toBe(205)
    expect(r2.tajweed).toBe(false)
    p2.dispose()
  })
})
