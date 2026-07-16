import { watch } from 'vue'
import type { useReaderStore } from '@/stores/reader'
import { useMistakesStore } from '@/stores/mistakes'
import type { DataClient } from '@/core/data'
import type { NavIndex } from '@/core/data/types'
import { getDataClient } from '@/core/data'
import { loadMistakes, saveMistakes } from '@/core/storage/userData'

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

  /** Toggle the tapped word's mistake mark (resolving its QPC page). */
  async function markWord(location: string, wordId: number): Promise<void> {
    const qpcPage =
      reader.layout === 'qpc' ? reader.page : ((await qpcPageFor(location)) ?? reader.page)
    store.toggle(qpcPage, wordId)
  }

  async function hydrate(): Promise<void> {
    const map = await loadMistakes()
    if (map.size) store.setAll(map)
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const stop = watch(
    () => store.snapshot(),
    (snap) => {
      clearTimeout(timer)
      timer = setTimeout(() => void saveMistakes(snap), 300)
    },
  )

  function dispose(): void {
    clearTimeout(timer)
    stop()
  }

  return { store, markWord, hydrate, dispose }
}
