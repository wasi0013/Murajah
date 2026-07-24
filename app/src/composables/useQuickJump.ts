import type { useReaderStore } from '@/stores/reader'
import type { DataClient } from '@/core/data'
import type { Layout, NavIndex } from '@/core/data/types'
import type { Jump } from '@/core/navigation/parseJump'
import { getDataClient } from '@/core/data'
import { resolveJump } from '@/core/navigation/resolveJump'

/**
 * Resolves a quick-jump target to a page for the active layout (via that
 * layout's nav index, cached) and navigates. Page counts differ per layout, so
 * jumping always uses the current layout's index.
 */
export function useQuickJump(
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

  /** Navigate to a parsed jump target; a no-op if it doesn't resolve. */
  async function jumpTo(jump: Jump): Promise<void> {
    const index = await nav(reader.layout)
    if (!index) return
    const page = resolveJump(index, jump)
    if (page !== undefined) reader.goToPage(page)
  }

  return { jumpTo }
}
