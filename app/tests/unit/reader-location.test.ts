import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useReaderStore } from '@/stores/reader'
import { useReaderLocation } from '@/composables/useReaderLocation'
import type { DataClient } from '@/core/data'

function mockData() {
  const initSpy = vi.fn(async () => ({}))
  const navByLayout: Record<string, unknown> = {
    qpc: { ayahToPage: {}, surahToPage: { '1': 1, '2': 2 }, juzToPage: { '1': 1, '2': 22 } },
    indopak: { ayahToPage: {}, surahToPage: { '1': 1, '2': 3 }, juzToPage: { '1': 1, '2': 24 } },
  }
  return {
    init: initSpy,
    getSurahNames: vi.fn(async () => ({ '1': 'الفاتحة', '2': 'البقرة' })),
    getNavIndex: vi.fn(async (layout: string) => navByLayout[layout]),
  } as unknown as DataClient & { init: typeof initSpy }
}

const flush = async () => {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}

describe('useReaderLocation', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('initialises the client before accessing data', async () => {
    const data = mockData()
    const reader = useReaderStore()
    useReaderLocation(reader, data)
    // Must not throw synchronously, and init() is awaited before getSurahNames.
    expect(data.init).toHaveBeenCalled()
    await flush()
    expect(data.getSurahNames).toHaveBeenCalled()
  })

  it('derives juz + surah name for the current page', async () => {
    const data = mockData()
    const reader = useReaderStore()
    const loc = useReaderLocation(reader, data)
    await flush()
    reader.goToPage(30)
    await flush()
    expect(loc.juz.value).toBe(2) // page 30 → juz 2 (starts p22)
    expect(loc.surahName.value).toBe('البقرة') // surah 2 (starts p2)
  })

  it('reloads the nav index when the layout changes', async () => {
    const data = mockData()
    const reader = useReaderStore()
    useReaderLocation(reader, data)
    await flush()
    reader.setLayout('indopak')
    await flush()
    expect(data.getNavIndex).toHaveBeenCalledWith('indopak')
  })
})
