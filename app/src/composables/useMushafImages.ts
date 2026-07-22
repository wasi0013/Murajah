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
/** Wait for paging to settle before loading, so a fast swipe doesn't fire (and
 * fail) fetches for pages flashed past — only the page you land on is loaded. */
const SETTLE_MS = 120
/** Transient fetch failures (common on a fast mobile swipe) auto-retry a few
 * times before the manual "tap to retry" is ever shown. */
const MAX_AUTO_RETRIES = 2
const RETRY_BACKOFF_MS = 400

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
  const retryTimers = new Set<ReturnType<typeof setTimeout>>()
  let settleTimer: ReturnType<typeof setTimeout> | undefined

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

  async function ensure(page: number, opts?: { reload?: boolean }): Promise<void> {
    if (!ready.value || !client.inRange(page)) return
    if (!opts?.reload && entries.get(page)?.status === 'ready') return
    entries.set(page, { status: 'loading' })
    try {
      const blob = await client.getPageBlob(page, opts)
      const url = URL.createObjectURL(blob)
      const prev = entries.get(page)
      if (prev?.url) URL.revokeObjectURL(prev.url)
      entries.set(page, { status: 'ready', url })
    } catch {
      entries.set(page, { status: 'error' })
    }
  }

  /**
   * The Blob loaded but the <img> couldn't decode it (a corrupt image, or iOS
   * dropping the decode under memory pressure). Revoke the dud URL and flip to
   * the error state so the user gets a retry that force-refetches a fresh copy.
   */
  function markError(page: number): void {
    const e = entries.get(page)
    if (e?.status !== 'ready') return // ignore stale errors from revoked/pruned pages
    if (e.url) URL.revokeObjectURL(e.url)
    entries.set(page, { status: 'error' })
  }

  /**
   * Load a page and, on a transient failure, auto-retry (force-refetch) a couple
   * of times with a short backoff before leaving it in the error state. Retries
   * stop once the page scrolls out of the retained window, so a fast swipe never
   * keeps retrying pages the reader has already left.
   */
  async function ensureWithRetry(page: number, attempt = 0): Promise<void> {
    await ensure(page, attempt > 0 ? { reload: true } : undefined)
    if (entries.get(page)?.status !== 'error') return
    if (attempt >= MAX_AUTO_RETRIES || !retained().has(page)) return
    const timer = setTimeout(() => {
      retryTimers.delete(timer)
      if (retained().has(page)) void ensureWithRetry(page, attempt + 1)
    }, RETRY_BACKOFF_MS * (attempt + 1))
    retryTimers.add(timer)
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
    // Warm neighbours + free memory immediately (cheap, cached, errors swallowed).
    client.prefetch(prefetchPages(store.page, store.pageCount, store.spread))
    prune()
    // Debounce the visible-page load: during a fast swipe the page changes faster
    // than SETTLE_MS, so only the page the reader settles on is fetched.
    clearTimeout(settleTimer)
    settleTimer = setTimeout(() => {
      for (const p of store.visible) void ensureWithRetry(p)
    }, SETTLE_MS)
  }

  watch(() => [store.page, store.spread], refresh, { flush: 'post' })

  onUnmounted(() => {
    clearTimeout(settleTimer)
    for (const timer of retryTimers) clearTimeout(timer)
    retryTimers.clear()
    for (const e of entries.values()) if (e.url) URL.revokeObjectURL(e.url)
    entries.clear()
  })

  const aspectRatio = computed(() => aspect.value)

  return {
    entry: (page: number): Entry | undefined => entries.get(page),
    // Explicit retry forces a fresh fetch past both caches, so a cached bad image
    // can't keep serving the same failure.
    retry: (page: number) => void ensure(page, { reload: true }),
    markError,
    aspectRatio,
    ready,
    initPromise,
  }
}
