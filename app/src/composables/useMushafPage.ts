import { watch } from 'vue'
import type { Router } from 'vue-router'
import type { useMushafStore } from '@/stores/mushaf'
import { getPref, setPref } from '@/core/storage/prefs'

type MushafStore = ReturnType<typeof useMushafStore>

const PREF_KEY = 'mushaf'
const DEBOUNCE_MS = 300

/**
 * Binds the mushaf store to persistence + the `/mushaf/:page` route, reusing the
 * reader's patterns (useReaderPersistence + useReaderRouteSync) at a smaller
 * scale — the only persisted/synced field is the page:
 *  - `hydrate()` applies the saved last page (call before mount);
 *  - a debounced watch persists page changes off the render path;
 *  - store→URL pushes on page change (so browser back/forward pages); URL→store
 *    applies deep-links + back/forward. The loop is broken structurally (each
 *    side skips when the target already equals the current page).
 */
export function useMushafPage(store: MushafStore, router: Router) {
  const route = () => router.currentRoute.value
  const routePage = (): number | undefined => {
    const raw = route().params.page
    const s = Array.isArray(raw) ? raw[0] : raw
    // The `:page` param is optional (`/mushaf` with none matches too), and Vue
    // Router represents "absent" as `''`, not `undefined`. `Number('')` is `0`
    // (not `NaN`), so without this guard an absent page reads as page 0 —
    // which then clamps to page 1, masking the last-read-page restore below.
    if (!s) return undefined
    const n = Number(s)
    return Number.isFinite(n) ? n : undefined
  }

  async function hydrate(): Promise<void> {
    // A deep-linked URL (e.g. /mushaf/50) wins outright. Restoring the saved page
    // first would briefly set the store to the *old* page, which the store→URL
    // watcher below immediately pushes to the address bar — clobbering the
    // deep link before applyRoute() ever runs (and, on a slow connection,
    // aborting the in-flight image fetch for the requested page, surfacing a
    // spurious "tap to retry"). Skip the restore entirely when the URL already
    // names a page; applyRoute() (called right after) is then the sole source.
    if (routePage() !== undefined) return
    const saved = await getPref<{ page: number }>(PREF_KEY)
    if (saved) store.restore(saved)
  }

  /** Apply the current URL's page to the store (deep-link / back-forward). */
  function applyRoute(): void {
    const p = routePage()
    if (p !== undefined) store.goToPage(p)
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const stopPersist = watch(
    () => store.page,
    (page) => {
      clearTimeout(timer)
      timer = setTimeout(() => void setPref(PREF_KEY, { page }), DEBOUNCE_MS)
    },
  )

  const stopToUrl = watch(
    () => store.page,
    (page) => {
      if (routePage() === page) return
      void router.push({ name: 'mushaf', params: { page: String(page) } }).catch(() => {})
    },
    { flush: 'post' },
  )

  const stopFromUrl = watch(
    () => route().fullPath,
    () => applyRoute(),
  )

  return {
    hydrate,
    applyRoute,
    dispose() {
      clearTimeout(timer)
      stopPersist()
      stopToUrl()
      stopFromUrl()
    },
  }
}
