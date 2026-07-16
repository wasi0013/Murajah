import { computed, ref } from 'vue'
import type { useMushafStore } from '@/stores/mushaf'
import type { DataClient } from '@/core/data'
import type { NavIndex, SurahNames } from '@/core/data/types'
import { getDataClient } from '@/core/data'
import { juzForPage, surahForPage } from '@/core/navigation/juz'

type MushafStore = ReturnType<typeof useMushafStore>

/**
 * Reactive juz + surah name for the mushaf indicator, from the QPC nav index
 * (the image page scheme). Lazy and non-blocking — the numbers fill in once the
 * small indexes load; the view never waits on them. Mirrors useReaderLocation
 * but fixed to the QPC layout.
 */
export function useMushafLocation(store: MushafStore, data: DataClient = getDataClient()) {
  const nav = ref<NavIndex>()
  const surahNames = ref<SurahNames>({})

  const ready = data.init()
  ready
    .then(() => data.getNavIndex('qpc'))
    .then((n) => (nav.value = n))
    .catch(() => {})
  ready
    .then(() => data.getSurahNames())
    .then((n) => (surahNames.value = n))
    .catch(() => {})

  const juz = computed(() => (nav.value ? juzForPage(nav.value.juzToPage, store.page) : undefined))
  const surahName = computed(() => {
    if (!nav.value) return undefined
    const surah = surahForPage(nav.value.surahToPage, store.page)
    return surah != null ? surahNames.value[String(surah)] : undefined
  })

  return { juz, surahName }
}
