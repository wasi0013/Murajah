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
    const n = Number(Array.isArray(raw) ? raw[0] : raw)
    return Number.isFinite(n) ? n : undefined
  }

  async function hydrate(): Promise<void> {
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
