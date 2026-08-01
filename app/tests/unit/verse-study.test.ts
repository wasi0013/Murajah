import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useReaderStore } from '@/stores/reader'
import { useVerseStudy } from '@/composables/useVerseStudy'
import type { DataClient } from '@/core/data'
import type { FontLoader } from '@/core/fonts'

function mocks() {
  const mapping = { qpc: { '22': ['2:142', '2:143'] } }
  const tafsir: Record<string, Record<string, { text: string }>> = {
    'en:2': { '2:142': { text: 'The foolish…' }, '2:143': { text: 'And thus…' } },
    'bn:2': { '2:142': { text: 'নির্বোধরা…' }, '2:143': { text: 'এভাবে…' } },
    'ar:2': { '2:142': { text: '<div class="text-rtl">تفسير…</div>' } },
  }
  const arCalls: string[] = []
  const data = {
    init: vi.fn(async () => ({})),
    getTafsirMapping: vi.fn(async (l: string) => (mapping as never)[l]),
    getPage: vi.fn(async () => ({
      page: 22,
      layout: [],
      words: [
        { id: 1, surah: '2', ayah: '142', word: '1', location: '2:142:1', text: 'سَیَقُوْلُ' },
        { id: 2, surah: '2', ayah: '142', word: '2', location: '2:142:2', text: 'السُّفَهَآءُ' },
        { id: 3, surah: '2', ayah: '143', word: '1', location: '2:143:1', text: 'وَكَذٰلِكَ' },
      ],
    })),
    getTafsir: vi.fn(async (lang: string, surah: number) => {
      if (lang === 'ar') arCalls.push(`ar:${surah}`)
      return tafsir[`${lang}:${surah}`] ?? {}
    }),
    getVerseText: vi.fn(async () => ({
      '2:142': { text: 'سَيَقُولُ السُّفَهَاءُ' },
      '2:143': { text: 'وَكَذَٰلِكَ' },
    })),
  } as unknown as DataClient
  const fonts = {
    init: vi.fn(async () => ({})),
    ensure: vi.fn(async () => 'tj-p22'),
  } as unknown as FontLoader
  return { data, fonts, arCalls }
}

const flush = async () => {
  await nextTick()
  await new Promise((r) => setTimeout(r)) // let all async loads settle
}

describe('useVerseStudy', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('pairs Arabic with en + bn translations for the page verses', async () => {
    const { data, fonts } = mocks()
    const reader = useReaderStore()
    reader.goToPage(22)
    const s = useVerseStudy(reader, data, fonts)
    reader.toggleTafsir()
    await flush()

    expect(s.fontFamily.value).toBe('tj-p22')
    expect(s.entries.value).toEqual([
      {
        verse: '2:142',
        arabic: 'سَیَقُوْلُ السُّفَهَآءُ',
        arabicText: 'سَيَقُولُ السُّفَهَاءُ',
        en: 'The foolish…',
        bn: 'নির্বোধরা…',
      },
      {
        verse: '2:143',
        arabic: 'وَكَذٰلِكَ',
        arabicText: 'وَكَذَٰلِكَ',
        en: 'And thus…',
        bn: 'এভাবে…',
      },
    ])
  })

  it('loads Arabic tafsir only when a verse is expanded', async () => {
    const { data, fonts, arCalls } = mocks()
    const reader = useReaderStore()
    reader.goToPage(22)
    const s = useVerseStudy(reader, data, fonts)
    reader.toggleTafsir()
    await flush()
    expect(arCalls).toEqual([]) // not fetched upfront

    await s.expandTafsir('2:142')
    expect(arCalls).toEqual(['ar:2'])
    expect(s.tafsir.value['2:142']).toContain('تفسير')

    // Second expand in same surah reuses the cache.
    await s.expandTafsir('2:143')
    expect(arCalls).toEqual(['ar:2'])
    expect(s.tafsir.value['2:143']).toBe('') // no ar entry for 2:143 → empty
  })

  it('clears when tafsir is toggled off', async () => {
    const { data, fonts } = mocks()
    const reader = useReaderStore()
    reader.goToPage(22)
    const s = useVerseStudy(reader, data, fonts)
    reader.toggleTafsir()
    await flush()
    expect(s.entries.value.length).toBe(2)
    reader.toggleTafsir()
    await flush()
    expect(s.entries.value).toEqual([])
  })
})
