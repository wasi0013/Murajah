import { ref, watch } from 'vue'
import type { useReaderStore } from '@/stores/reader'
import type { DataClient } from '@/core/data'
import type { FontLoader, FontRequest } from '@/core/fonts'
import type { Layout, PageChunk, TafsirChunk, TafsirMapping } from '@/core/data/types'
import { getDataClient } from '@/core/data'
import { getFontLoader } from '@/core/fonts'

export interface VerseStudy {
  /** `s:a` verse key. */
  verse: string
  /** The verse's Arabic (its words on this page), rendered in the page font. */
  arabic: string
  /** English — Saheeh International. */
  en: string
  /** Bengali — Dr. Abu Bakr Muhammad Zakaria. */
  bn: string
}

/**
 * Backs the verse-study panel beneath the mushaf: for the current page's verses
 * it pairs the Arabic (from the page chunk, in the page's glyph font) with the
 * English + Bengali translations. The Arabic tafsir (large) loads lazily, only
 * when a verse's Tafsir section is expanded. All chunks are cached; loads run
 * only while the panel is on and are guarded against page/layout changes.
 */
export function useVerseStudy(
  reader: ReturnType<typeof useReaderStore>,
  data: DataClient = getDataClient(),
  fonts: FontLoader = getFontLoader(),
) {
  const mappingCache = new Map<Layout, TafsirMapping>()
  const chunkCache = new Map<string, PageChunk>()
  const trCache = new Map<string, TafsirChunk>() // `${lang}:${surah}` (en/bn)
  const arCache = new Map<number, TafsirChunk>() // ar tafsir by surah
  const entries = ref<VerseStudy[]>([])
  const fontFamily = ref('serif')
  const tafsir = ref<Record<string, string>>({}) // verse → ar tafsir (lazy)
  const loading = ref(false)

  const fontReq = (): FontRequest =>
    reader.layout === 'indopak'
      ? { layout: 'indopak', page: reader.page }
      : { layout: 'qpc', page: reader.page, tajweed: reader.tajweed }

  async function load(): Promise<void> {
    if (!reader.tafsir) {
      entries.value = []
      tafsir.value = {}
      return
    }
    const page = reader.page
    const layout = reader.layout
    loading.value = true
    try {
      await Promise.all([data.init(), fonts.init()])
      let mapping = mappingCache.get(layout)
      if (!mapping) {
        mapping = await data.getTafsirMapping(layout)
        mappingCache.set(layout, mapping)
      }
      const verses = mapping[String(page)] ?? []

      const ckey = `${layout}:${page}`
      let chunk = chunkCache.get(ckey)
      if (!chunk) {
        chunk = await data.getPage(layout, page)
        chunkCache.set(ckey, chunk)
      }

      const surahs = [...new Set(verses.map((v) => Number(v.split(':')[0])))]
      await Promise.all(
        surahs.flatMap((surah) =>
          (['en', 'bn'] as const).map(async (lang) => {
            const key = `${lang}:${surah}`
            if (!trCache.has(key)) trCache.set(key, await data.getTafsir(lang, surah))
          }),
        ),
      )
      const family = await fonts.ensure(fontReq())

      if (!reader.tafsir || reader.page !== page || reader.layout !== layout) return
      fontFamily.value = family

      const byVerse = new Map<string, string[]>()
      for (const w of chunk.words) {
        const v = `${w.surah}:${w.ayah}`
        ;(byVerse.get(v) ?? byVerse.set(v, []).get(v)!).push(w.text)
      }
      entries.value = verses.map((verse) => {
        const surah = Number(verse.split(':')[0])
        return {
          verse,
          arabic: (byVerse.get(verse) ?? []).join(' '),
          en: trCache.get(`en:${surah}`)?.[verse]?.text ?? '',
          bn: trCache.get(`bn:${surah}`)?.[verse]?.text ?? '',
        }
      })
      tafsir.value = {}
    } catch {
      entries.value = []
    } finally {
      loading.value = false
    }
  }

  /** Load the Arabic tafsir for a verse on demand (its Tafsir section opened). */
  async function expandTafsir(verse: string): Promise<void> {
    if (tafsir.value[verse] !== undefined) return
    const surah = Number(verse.split(':')[0])
    try {
      await data.init()
      let chunk = arCache.get(surah)
      if (!chunk) {
        chunk = await data.getTafsir('ar', surah)
        arCache.set(surah, chunk)
      }
      tafsir.value = { ...tafsir.value, [verse]: chunk[verse]?.text ?? '' }
    } catch {
      tafsir.value = { ...tafsir.value, [verse]: '' }
    }
  }

  watch(() => [reader.page, reader.layout, reader.tafsir, reader.tajweed], load, { immediate: true })

  return { entries, fontFamily, tafsir, loading, expandTafsir }
}
