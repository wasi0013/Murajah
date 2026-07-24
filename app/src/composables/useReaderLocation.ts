import { computed, ref, watch } from 'vue'
import type { useReaderStore } from '@/stores/reader'
import type { DataClient } from '@/core/data'
import type { NavIndex, SurahNames } from '@/core/data/types'
import { getDataClient } from '@/core/data'
import { juzForPage, surahForPage } from '@/core/navigation/juz'

/**
 * Reactive "where am I" for the reader indicator: the current juz and surah
 * name, derived from the per-layout nav index (reloaded on layout change) plus
 * the surah-name index. Lazy and non-blocking — the numbers just fill in once
 * the small indexes load; the reader never waits on them.
 */
export function useReaderLocation(
  reader: ReturnType<typeof useReaderStore>,
  data: DataClient = getDataClient(),
) {
  const nav = ref<NavIndex>()
  const surahNames = ref<SurahNames>({})

  // The manifest must be loaded before any data access (accessors throw
  // synchronously otherwise). init() is idempotent, so awaiting it is cheap.
  const ready = data.init()
  ready.then(() => data.getSurahNames()).then((n) => (surahNames.value = n)).catch(() => {})

  watch(
    () => reader.layout,
    async (layout) => {
      try {
        await ready
        nav.value = await data.getNavIndex(layout)
      } catch {
        nav.value = undefined
      }
    },
    { immediate: true },
  )

  const juz = computed(() => (nav.value ? juzForPage(nav.value.juzToPage, reader.page) : undefined))
  const surahName = computed(() => {
    if (!nav.value) return undefined
    const surah = surahForPage(nav.value.surahToPage, reader.page)
    return surah != null ? surahNames.value[String(surah)] : undefined
  })

  // `nav` is exposed so the reader can resolve friendly URLs (/:surah, /:slug) to a
  // page for the active layout without loading the index a second time (9.1).
  return { juz, surahName, nav }
}
