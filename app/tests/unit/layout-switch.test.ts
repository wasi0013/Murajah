import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useReaderStore } from '@/stores/reader'
import { useLayoutSwitch } from '@/composables/useLayoutSwitch'
import type { DataClient } from '@/core/data'

function mockData() {
  const nav: Record<string, unknown> = {
    qpc: { ayahToPage: { '1:1': 1, '2:1': 10 }, surahToPage: {}, juzToPage: {} },
    indopak: { ayahToPage: { '1:1': 1, '2:1': 12 }, surahToPage: {}, juzToPage: {} },
  }
  return {
    init: vi.fn(async () => ({})),
    getNavIndex: vi.fn(async (layout: string) => nav[layout]),
  } as unknown as DataClient & { getNavIndex: ReturnType<typeof vi.fn> }
}

describe('useLayoutSwitch', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('remaps the current page to keep the same ayah', async () => {
    const data = mockData()
    const reader = useReaderStore()
    reader.goToPage(10) // QPC p10 = start of surah 2
    const { switchTo } = useLayoutSwitch(reader, data)

    await switchTo('indopak')
    expect(reader.layout).toBe('indopak')
    expect(reader.page).toBe(12) // surah 2 starts on Indopak p12
  })

  it('is a no-op when switching to the current layout', async () => {
    const data = mockData()
    const reader = useReaderStore()
    const { switchTo } = useLayoutSwitch(reader, data)
    await switchTo('qpc')
    expect(data.getNavIndex).not.toHaveBeenCalled()
  })

  it('caches each layout nav index (fetched once)', async () => {
    const data = mockData()
    const reader = useReaderStore()
    const { switchTo } = useLayoutSwitch(reader, data)
    await switchTo('indopak')
    await switchTo('qpc')
    await switchTo('indopak')
    // qpc + indopak fetched once each despite three switches.
    expect(data.getNavIndex).toHaveBeenCalledTimes(2)
  })

  it('falls back to a clamp when a nav index fails to load', async () => {
    const data = {
      init: vi.fn(async () => ({})),
      getNavIndex: vi.fn(async () => {
        throw new Error('offline')
      }),
    } as unknown as DataClient
    const reader = useReaderStore()
    reader.goToPage(604)
    const { switchTo } = useLayoutSwitch(reader, data)
    await switchTo('indopak')
    expect(reader.layout).toBe('indopak')
    expect(reader.page).toBe(604) // clamped to Indopak (610), no remap
  })
})
