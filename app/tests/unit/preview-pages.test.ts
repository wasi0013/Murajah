import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { computed, ref } from 'vue'
import type { NavIndex, PageChunk } from '@/core/data/types'
import type { PreviewRange } from '@/core/navigation/previewRoute'
import { usePreviewPages } from '@/composables/usePreviewPages'

function fakeNav(ayahToPage: Record<string, number>) {
  const nav: NavIndex = { ayahToPage, surahToPage: {}, juzToPage: {}, juzToVerse: {} }
  return {
    init: vi.fn(async () => undefined as never),
    getNavIndex: vi.fn(async () => nav),
    getPage: vi.fn(async (_layout, page: number) => ({ page, layout: [], words: [] }) as PageChunk),
  }
}

function fakeFonts() {
  return {
    init: vi.fn(async () => undefined as never),
    ensure: vi.fn(async (req: { page: number }) => `tj-p${req.page}`),
  }
}

describe('usePreviewPages', () => {
  it('short-circuits over the page cap: zero page/font fetches', async () => {
    // 1..13 = 13 pages, one over the 12-page cap.
    const data = fakeNav({ '2:1': 1, '2:2': 13 })
    const fonts = fakeFonts()
    const range = ref<PreviewRange | undefined>({ surah: 2, startAyah: 1, endAyah: 2 })

    const result = usePreviewPages(computed(() => range.value), { data, fonts })
    await vi.waitFor(() => expect(result.resolving.value).toBe(false))

    expect(result.rangeTooLarge.value).toBe(true)
    expect(result.pages.value).toEqual([])
    expect(data.getPage).not.toHaveBeenCalled()
    expect(fonts.ensure).not.toHaveBeenCalled()
  })

  it('proceeds normally at exactly the cap (12 pages)', async () => {
    const data = fakeNav({ '2:1': 1, '2:2': 12 })
    const fonts = fakeFonts()
    const range = ref<PreviewRange | undefined>({ surah: 2, startAyah: 1, endAyah: 2 })

    const result = usePreviewPages(computed(() => range.value), { data, fonts })
    await vi.waitFor(() => {
      expect(result.pages.value.length).toBe(12)
      for (const p of result.pages.value) expect(result.entry(p)?.status).toBe('ready')
    })

    expect(result.rangeTooLarge.value).toBe(false)
    expect(result.pages.value).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(data.getPage).toHaveBeenCalledTimes(12)
  })

  it('a failing page does not block its siblings from becoming ready', async () => {
    const data = fakeNav({ '2:1': 1, '2:2': 3 })
    data.getPage.mockImplementation(async (_layout, page: number) => {
      if (page === 2) throw new Error('boom')
      return { page, layout: [], words: [] } as PageChunk
    })
    const fonts = fakeFonts()
    const range = ref<PreviewRange | undefined>({ surah: 2, startAyah: 1, endAyah: 2 })

    const result = usePreviewPages(computed(() => range.value), { data, fonts })
    await vi.waitFor(() => {
      expect(result.entry(1)?.status).toBe('ready')
      expect(result.entry(2)?.status).toBe('error')
      expect(result.entry(3)?.status).toBe('ready')
    })
  })

  it('retry re-attempts only the given page', async () => {
    const data = fakeNav({ '2:1': 1, '2:2': 2 })
    let failPage2 = true
    data.getPage.mockImplementation(async (_layout, page: number) => {
      if (page === 2 && failPage2) throw new Error('boom')
      return { page, layout: [], words: [] } as PageChunk
    })
    const fonts = fakeFonts()
    const range = ref<PreviewRange | undefined>({ surah: 2, startAyah: 1, endAyah: 2 })

    const result = usePreviewPages(computed(() => range.value), { data, fonts })
    await vi.waitFor(() => {
      expect(result.entry(1)?.status).toBe('ready')
      expect(result.entry(2)?.status).toBe('error')
    })
    const callsBeforeRetry = data.getPage.mock.calls.length

    failPage2 = false
    result.retry(2)
    await vi.waitFor(() => expect(result.entry(2)?.status).toBe('ready'))

    expect(result.entry(1)?.status).toBe('ready') // untouched by the retry
    // Only page 2 was re-fetched — one new call, not a re-resolution of both.
    expect(data.getPage.mock.calls.length).toBe(callsBeforeRetry + 1)
  })

  it('never imports the reader store — /preview must ignore the visitor’s own prefs', () => {
    const source = readFileSync('src/composables/usePreviewPages.ts', 'utf-8')
    expect(source).not.toMatch(/stores\/reader/)
  })
})
