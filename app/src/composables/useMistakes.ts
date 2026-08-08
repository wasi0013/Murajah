import { watch } from 'vue'
import type { useReaderStore } from '@/stores/reader'
import { useMistakesStore } from '@/stores/mistakes'
import { useMistakeColorsStore } from '@/stores/mistakeColors'
import { useProgressStore } from '@/stores/progress'
import type { DataClient } from '@/core/data'
import type { NavIndex } from '@/core/data/types'
import type { HighlightColor } from '@/core/navigation/previewRoute'
import { getDataClient } from '@/core/data'
import { loadMistakes, saveMistakes, loadMistakeColors, saveMistakeColors } from '@/core/storage/userData'

/**
 * Binds the mistakes store to the reader and to persistence. Marking always
 * keys by the word's **QPC page** (the legacy canonical space): in QPC layout
 * that's the current page; in Indopak it's resolved from the QPC nav index
 * (the ayah's page), so Indopak marks land in the same keyspace as legacy/QPC
 * data. Display is page-agnostic (global id membership), so it just works.
 */
export function useMistakes(
  reader: ReturnType<typeof useReaderStore>,
  data: DataClient = getDataClient(),
) {
  const store = useMistakesStore()
  const colors = useMistakeColorsStore()
  const progress = useProgressStore()
  let qpcNav: NavIndex | undefined

  async function qpcPageFor(location: string): Promise<number | undefined> {
    if (!qpcNav) {
      try {
        await data.init()
        qpcNav = await data.getNavIndex('qpc')
      } catch {
        return undefined
      }
    }
    const ayah = location.split(':').slice(0, 2).join(':')
    return qpcNav.ayahToPage[ayah]
  }

  /**
   * Toggle the tapped word's mistake mark (resolving its QPC page), painting it
   * with `color` (the reader's currently active palette swatch — see
   * MistakeColorBar.vue) when the tap newly marks it. An already-marked word
   * (any color) just un-marks — the color that was there is dropped, not
   * reused. Marking a new mistake also drops that page's memorization strength
   * by 1 (Phase 4.1.4); un-marking never restores it (strength only rises via a
   * clean recitation) — unchanged by which color a mark carries.
   */
  async function markWord(location: string, wordId: number, color: HighlightColor): Promise<void> {
    const qpcPage =
      reader.layout === 'qpc' ? reader.page : ((await qpcPageFor(location)) ?? reader.page)
    const marked = store.toggle(qpcPage, wordId)
    if (marked) {
      colors.set(wordId, color)
      progress.penalizeMistake(qpcPage)
    } else {
      colors.clear(wordId)
    }
  }

  async function hydrate(): Promise<void> {
    const [map, colorMap] = await Promise.all([loadMistakes(), loadMistakeColors()])
    if (map.size) store.setAll(map)
    if (colorMap.size) colors.setAll(colorMap)
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  let colorTimer: ReturnType<typeof setTimeout> | undefined
  const stop = watch(
    () => store.snapshot(),
    (snap) => {
      clearTimeout(timer)
      timer = setTimeout(() => void saveMistakes(snap), 300)
    },
  )
  const stopColors = watch(
    () => colors.snapshot(),
    (snap) => {
      clearTimeout(colorTimer)
      colorTimer = setTimeout(() => void saveMistakeColors(snap), 300)
    },
  )

  function dispose(): void {
    clearTimeout(timer)
    clearTimeout(colorTimer)
    stop()
    stopColors()
  }

  return { store, markWord, hydrate, dispose }
}
