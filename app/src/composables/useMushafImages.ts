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
/** Transient fetch/decode failures (common on a fast mobile swipe, or iOS/Chrome
 * mobile dropping a decode under memory pressure) auto-retry a few times —
 * staying in the `loading` state throughout — before the manual "tap to retry"
 * is ever shown. */
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
  // Auto-retry count per page, shared across fetch failures and decode
  // failures — either kind counts toward the same cap so the two paths can't
  // compound into far more than MAX_AUTO_RETRIES attempts.
  const attempts = new Map<number, number>()
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
      attempts.delete(page)
    } catch {
      fail(page)
    }
  }

  /**
   * The Blob loaded but the <img> couldn't decode it (a corrupt image, or iOS/
   * Chrome mobile dropping the decode under memory pressure — the common cause
   * of a stray "tap to retry" on a fast swipe). Revoke the dud URL and treat it
   * the same as a fetch failure below — a manual tap should be a last resort,
   * not the first response to a transient decode glitch.
   */
  function markError(page: number): void {
    const e = entries.get(page)
    if (e?.status !== 'ready') return // ignore stale errors from revoked/pruned pages
    if (e.url) URL.revokeObjectURL(e.url)
    fail(page)
  }

  /**
   * A fetch or decode failure. While auto-retries remain, the entry stays in
   * `loading` — so the reader sees the ordinary loading skeleton, not a flash
   * of "tap to retry" for what's usually a transient, self-healing glitch — and
   * a force-refetch is scheduled with a short backoff. Only once the budget is
   * exhausted (or the page has scrolled out of the retained window, so retrying
   * would be wasted) does the entry flip to `error` for the manual retry.
   */
  function fail(page: number): void {
    const attempt = (attempts.get(page) ?? 0) + 1
    attempts.set(page, attempt)
    if (attempt > MAX_AUTO_RETRIES || !retained().has(page)) {
      entries.set(page, { status: 'error' })
      return
    }
    entries.set(page, { status: 'loading' })
    const timer = setTimeout(() => {
      retryTimers.delete(timer)
      if (retained().has(page)) void ensure(page, { reload: true })
    }, RETRY_BACKOFF_MS * attempt)
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
        attempts.delete(page)
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
      for (const p of store.visible) void ensure(p)
    }, SETTLE_MS)
  }

  watch(() => [store.page, store.spread], refresh, { flush: 'post' })

  onUnmounted(() => {
    clearTimeout(settleTimer)
    for (const timer of retryTimers) clearTimeout(timer)
    retryTimers.clear()
    for (const e of entries.values()) if (e.url) URL.revokeObjectURL(e.url)
    entries.clear()
    attempts.clear()
  })

  const aspectRatio = computed(() => aspect.value)

  return {
    entry: (page: number): Entry | undefined => entries.get(page),
    // Explicit retry forces a fresh fetch past both caches, so a cached bad image
    // can't keep serving the same failure. Resets the auto-retry count too, so a
    // manual tap always gets the full auto-retry budget behind it again.
    retry: (page: number) => {
      attempts.delete(page)
      void ensure(page, { reload: true })
    },
    // Cache-first load for a page outside `store.visible` (the vertical pager's
    // prev/next slots) — same auto-retry as the visible page, just triggered
    // ahead of when the reader scrolls there instead of on-demand.
    preload: (page: number) => void ensure(page),
    markError,
    aspectRatio,
    ready,
    initPromise,
  }
}
