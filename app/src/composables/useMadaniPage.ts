import { ref, watch, type Ref } from 'vue'
import type { useReaderStore } from '@/stores/reader'
import type { DataClient } from '@/core/data'
import type { Layout, NavIndex } from '@/core/data/types'
import { getDataClient } from '@/core/data'
import { remapPage } from '@/core/navigation/remapPage'

/**
 * The canonical **Madani (604) page** for the reader's current position. QPC is
 * already Madani; Indopak (610) is remapped through the nav indexes to the page
 * showing the same ayah. Used for canonical-604 concerns — the reading-reward
 * page weight and hasanah — so switching layout on the same content doesn't
 * change the reward basis.
 */
export function useMadaniPage(
  reader: ReturnType<typeof useReaderStore>,
  data: DataClient = getDataClient(),
): Ref<number> {
  const madani = ref(reader.page)
  const navs = new Map<Layout, NavIndex | undefined>()

  async function nav(layout: Layout): Promise<NavIndex | undefined> {
    if (!navs.has(layout)) {
      try {
        await data.init()
        navs.set(layout, await data.getNavIndex(layout))
      } catch {
        navs.set(layout, undefined)
      }
    }
    return navs.get(layout)
  }

  async function recompute(): Promise<void> {
    if (reader.layout === 'qpc') {
      madani.value = reader.page
      return
    }
    const [from, to] = await Promise.all([nav(reader.layout), nav('qpc')])
    madani.value = from && to ? remapPage(from, to, reader.page) : reader.page
  }

  watch(() => [reader.page, reader.layout], recompute, { immediate: true })
  return madani
}
