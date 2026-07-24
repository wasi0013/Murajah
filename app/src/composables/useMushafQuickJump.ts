import type { useMushafStore } from '@/stores/mushaf'
import type { DataClient } from '@/core/data'
import type { NavIndex } from '@/core/data/types'
import type { Jump } from '@/core/navigation/parseJump'
import { getDataClient } from '@/core/data'
import { resolveJump } from '@/core/navigation/resolveJump'

type MushafStore = ReturnType<typeof useMushafStore>

/**
 * Shared quick-jump for the mushaf surface. The image page scheme *is* the QPC
 * Madani-604 nav index (verified 3b.0.1), so `2:255`, `page 50`, `juz 5` and
 * surah names resolve through that index and land on the matching mushaf page.
 * Reuses the reader's `resolveJump`; a target that doesn't resolve is a no-op.
 */
export function useMushafQuickJump(store: MushafStore, data: DataClient = getDataClient()) {
  let nav: NavIndex | undefined
  let loaded = false

  async function ensureNav(): Promise<NavIndex | undefined> {
    if (!loaded) {
      try {
        await data.init()
        nav = await data.getNavIndex('qpc')
      } catch {
        nav = undefined
      }
      loaded = true
    }
    return nav
  }

  async function jumpTo(jump: Jump): Promise<void> {
    const index = await ensureNav()
    if (!index) return
    const target = resolveJump(index, jump)
    if (target) store.goToPage(target.page) // clamps to the mushaf range
  }

  return { jumpTo }
}
