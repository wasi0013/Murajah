import type { useReaderStore } from '@/stores/reader'
import type { DataClient } from '@/core/data'
import type { Layout, NavIndex } from '@/core/data/types'
import { getDataClient } from '@/core/data'
import { remapPage } from '@/core/navigation/remapPage'

/**
 * Switches the reading script (QPC ↔ Indopak) while keeping the reader on the
 * same ayah: QPC (604 pages) and Indopak (610) paginate differently, so the
 * current page is remapped through both layouts' nav indexes (cached per layout)
 * before `setLayout`. Falls back to a plain clamp if an index can't load.
 */
export function useLayoutSwitch(
  reader: ReturnType<typeof useReaderStore>,
  data: DataClient = getDataClient(),
) {
  const cache = new Map<Layout, NavIndex | undefined>()

  async function nav(layout: Layout): Promise<NavIndex | undefined> {
    if (!cache.has(layout)) {
      try {
        await data.init()
        cache.set(layout, await data.getNavIndex(layout))
      } catch {
        cache.set(layout, undefined)
      }
    }
    return cache.get(layout)
  }

  async function switchTo(next: Layout): Promise<void> {
    if (next === reader.layout) return
    const [from, to] = await Promise.all([nav(reader.layout), nav(next)])
    const remapped = from && to ? remapPage(from, to, reader.page) : undefined
    reader.setLayout(next, remapped)
  }

  return { switchTo }
}
