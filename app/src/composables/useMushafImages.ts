import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import type { useMushafStore } from '@/stores/mushaf'
import { getMushafClient } from '@/core/mushaf'
import { prefetchPages } from '@/core/mushaf/spread'

type MushafStore = ReturnType<typeof useMushafStore>
type Status = 'loading' | 'ready' | 'error'
interface Entry {
  status: Status
  /** Object URL for the decoded Blob (revoked when the page leaves the window). */
  url?: string
}

/** Default page aspect until the manifest loads — reserves the box (no CLS). */
const DEFAULT_ASPECT = 678 / 966

/**
 * Loads mushaf page images for the store's visible page(s) as object URLs, keeps
 * per-page load state, and warms neighbour pages into the cache so paging is
 * instant. Object URLs are revoked as pages leave the retained window (visible +
 * prefetch), and all are revoked on unmount — no Blob-URL leaks during a long
 * read. The heavy Blob fetch + IndexedDB caching lives in the MushafClient.
 */
export function useMushafImages(store: MushafStore) {
  const client = getMushafClient()
  const entries = reactive(new Map<number, Entry>())
  const ready = ref(false)
  const aspect = ref(DEFAULT_ASPECT)

  const initPromise = client
    .init()
    .then((m) => {
      ready.value = true
      aspect.value = m.width / m.height
      store.configure(m.pageCount)
      refresh()
    })
    .catch(() => {
      /* manifest load failed — the view shows an error state per page */
    })

  async function ensure(page: number): Promise<void> {
    if (!ready.value || !client.inRange(page)) return
    if (entries.get(page)?.status === 'ready') return
    entries.set(page, { status: 'loading' })
    try {
      const blob = await client.getPageBlob(page)
      const url = URL.createObjectURL(blob)
      const prev = entries.get(page)
      if (prev?.url) URL.revokeObjectURL(prev.url)
      entries.set(page, { status: 'ready', url })
    } catch {
      entries.set(page, { status: 'error' })
    }
  }

  function retained(): Set<number> {
    const keep = new Set<number>(store.visible)
    for (const p of prefetchPages(store.page, store.pageCount, store.spread)) keep.add(p)
    return keep
  }

  /** Revoke + drop object URLs for pages outside the retained window. */
  function prune(): void {
    const keep = retained()
    for (const [page, e] of entries) {
      if (!keep.has(page)) {
        if (e.url) URL.revokeObjectURL(e.url)
        entries.delete(page)
      }
    }
  }

  function refresh(): void {
    if (!ready.value) return
    for (const p of store.visible) void ensure(p)
    // Neighbours are only warmed into the cache (no object URL yet) — cheap, and
    // the object URL is minted from the cached Blob the moment the page shows.
    client.prefetch(prefetchPages(store.page, store.pageCount, store.spread))
    prune()
  }

  watch(() => [store.page, store.spread], refresh, { flush: 'post' })

  onUnmounted(() => {
    for (const e of entries.values()) if (e.url) URL.revokeObjectURL(e.url)
    entries.clear()
  })

  const aspectRatio = computed(() => aspect.value)

  return {
    entry: (page: number): Entry | undefined => entries.get(page),
    retry: (page: number) => void ensure(page),
    aspectRatio,
    ready,
    initPromise,
  }
}
