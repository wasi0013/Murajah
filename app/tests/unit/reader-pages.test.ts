import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { windowPages } from '@/core/reader/pageWindow'
import { useReaderStore } from '@/stores/reader'
import { useReaderPages } from '@/composables/useReaderPages'
import type { DataClient } from '@/core/data'
import type { FontLoader } from '@/core/fonts'

describe('windowPages', () => {
  it('returns current ±1 clamped and de-duplicated', () => {
    expect(windowPages(50, 604)).toEqual([49, 50, 51])
    expect(windowPages(1, 604)).toEqual([1, 2]) // no page 0
    expect(windowPages(604, 604)).toEqual([603, 604]) // no page 605
    expect(windowPages(1, 1)).toEqual([1]) // single-page layout
  })
})

/** Minimal DataClient/FontLoader doubles that record calls. */
function makeDoubles() {
  const pageCalls: Array<[string, number]> = []
  const fontCalls: Array<{ layout: string; page: number; tajweed?: boolean }> = []
  const prefetched: number[] = []
  const trCalls: string[] = []

  const data = {
    init: vi.fn(async () => ({})),
    pageCount: (layout: string) => (layout === 'qpc' ? 604 : 610),
    getPage: vi.fn(async (layout: string, page: number) => {
      pageCalls.push([layout, page])
      // Two words of surah 1 so translations have something to map.
      return {
        page,
        layout: [],
        words: [
          { id: 1, surah: '1', ayah: '1', word: '1', location: '1:1:1', text: 'a' },
          { id: 2, surah: '1', ayah: '1', word: '2', location: '1:1:2', text: 'b' },
        ],
      }
    }),
    getTranslations: vi.fn(async (lang: string, surah: number) => {
      trCalls.push(`${lang}:${surah}`)
      return { '1:1:1': `${lang}-the`, '1:1:2': `${lang}-praise` }
    }),
    prefetchPage: vi.fn((_layout: string, page: number) => prefetched.push(page)),
  } as unknown as DataClient

  const fonts = {
    init: vi.fn(async () => ({})),
    ensure: vi.fn(async (req: { layout: string; page: number; tajweed?: boolean }) => {
      fontCalls.push(req)
      return req.layout === 'indopak' ? 'indopak' : req.tajweed ? `tj-p${req.page}` : `qpc-p${req.page}`
    }),
    prefetch: vi.fn(),
  } as unknown as FontLoader

  return { data, fonts, pageCalls, fontCalls, prefetched, trCalls }
}

const flush = async () => {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}

describe('useReaderPages', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('loads the window (current ±1) and configures store page counts', async () => {
    const { data, fonts, pageCalls } = makeDoubles()
    const reader = useReaderStore()
    reader.goToPage(50)
    const pages = useReaderPages(reader, { data, fonts })
    await flush()

    expect(reader.pageCount).toBe(604) // configured from manifest
    expect(new Set(pageCalls.map(([, p]) => p))).toEqual(new Set([49, 50, 51]))
    expect(pages.entry(50)?.status).toBe('ready')
    expect(pages.entry(50)?.family).toBe('tj-p50') // tajweed default on
    pages.dispose()
  })

  it('evicts pages outside the keep radius when paging', async () => {
    const { data, fonts } = makeDoubles()
    const reader = useReaderStore()
    reader.goToPage(50)
    const pages = useReaderPages(reader, { data, fonts, keepRadius: 1 })
    await flush()
    expect(pages.entry(49)).toBeTruthy()

    reader.goToPage(52)
    await flush()
    // 49 is now 3 away from 52 → evicted; 51/52/53 present.
    expect(pages.entry(49)).toBeUndefined()
    expect(pages.entry(52)?.status).toBe('ready')
    pages.dispose()
  })

  it('re-resolves the font family on tajweed toggle without refetching the chunk', async () => {
    const { data, fonts, pageCalls, fontCalls } = makeDoubles()
    const reader = useReaderStore()
    const pages = useReaderPages(reader, { data, fonts })
    await flush()
    const pageFetchesBefore = pageCalls.length
    expect(pages.entry(1)?.family).toBe('tj-p1')

    reader.toggleTajweed()
    await flush()
    expect(pages.entry(1)?.family).toBe('qpc-p1') // swapped to uthmani
    expect(pageCalls.length).toBe(pageFetchesBefore) // no new chunk fetches
    expect(fontCalls.some((r) => r.tajweed === false)).toBe(true)
    pages.dispose()
  })

  it('loads per-surah translations only when WBW is on, and swaps language', async () => {
    const { data, fonts, trCalls } = makeDoubles()
    const reader = useReaderStore()
    const pages = useReaderPages(reader, { data, fonts })
    await flush()
    // WBW off by default → no translations fetched or attached.
    expect(trCalls).toEqual([])
    expect(pages.entry(1)?.translations).toBeUndefined()

    reader.toggleWbw()
    await flush()
    expect(pages.entry(1)?.translations).toEqual({ '1:1:1': 'en-the', '1:1:2': 'en-praise' })
    expect(trCalls).toContain('en:1')

    reader.setWbwLang('bn')
    await flush()
    expect(pages.entry(1)?.translations?.['1:1:1']).toBe('bn-the')
    expect(trCalls).toContain('bn:1')

    reader.toggleWbw()
    await flush()
    expect(pages.entry(1)?.translations).toBeUndefined() // cleared when off
    pages.dispose()
  })

  it('clears the cache and reloads on layout switch', async () => {
    const { data, fonts } = makeDoubles()
    const reader = useReaderStore()
    reader.goToPage(3)
    const pages = useReaderPages(reader, { data, fonts })
    await flush()
    expect(pages.entry(3)?.family).toBe('tj-p3')

    reader.setLayout('indopak')
    await flush()
    expect(pages.entry(3)?.family).toBe('indopak') // reloaded under new layout
    pages.dispose()
  })
})
