import { watch } from 'vue'
import type { Router, RouteLocationNormalizedLoaded } from 'vue-router'
import type { useReaderStore } from '@/stores/reader'
import { parseReaderRoute, readerStateToRoute } from '@/core/navigation/readerRoute'

type ReaderStore = ReturnType<typeof useReaderStore>

/**
 * Two-way bind the reader store and the `/read/:layout/:page` route:
 *  - store → URL: page/layout changes `push` (so browser back/forward pages),
 *    toggle-only changes `replace` (history isn't spammed);
 *  - URL → store: back/forward + deep-links apply to the store.
 * Loops are broken structurally — each side skips when the target already equals
 * the current location, so no re-entrancy flag is needed. Reads the reactive
 * route from `router.currentRoute`, so it works with or without a component.
 */
export function useReaderRouteSync(reader: ReaderStore, router: Router) {
  const route = (): RouteLocationNormalizedLoaded => router.currentRoute.value

  /** Apply the current URL to the store (deep-link / back-forward restore). */
  function applyRoute(): void {
    const r = route()
    reader.restore(parseReaderRoute(r.params, r.query))
  }

  const stopStore = watch(
    () => {
      const { layout, page, tajweed, wbw, tafsir } = reader.snapshot()
      return { layout, page, tajweed, wbw, tafsir }
    },
    (curr) => {
      const target = readerStateToRoute(curr)
      if (routeMatches(route(), target)) return
      const r = route()
      const navChange =
        r.params.layout !== target.params.layout ||
        String(r.params.page ?? '') !== target.params.page
      const to = { name: 'reader' as const, params: target.params, query: target.query }
      void (navChange ? router.push(to) : router.replace(to)).catch(() => {})
    },
    { flush: 'post' },
  )

  const stopRoute = watch(
    () => route().fullPath,
    () => applyRoute(),
  )

  return {
    applyRoute,
    dispose() {
      stopStore()
      stopRoute()
    },
  }
}

/** True when the live route already encodes `target` (params + the 3 toggles). */
function routeMatches(
  route: RouteLocationNormalizedLoaded,
  target: ReturnType<typeof readerStateToRoute>,
): boolean {
  if (route.params.layout !== target.params.layout) return false
  if (String(route.params.page ?? '') !== target.params.page) return false
  for (const key of ['tajweed', 'wbw', 'tafsir'] as const) {
    const cur = route.query[key]
    const normalized = Array.isArray(cur) ? cur[0] : (cur ?? undefined)
    if (normalized !== (target.query[key] ?? undefined)) return false
  }
  return true
}
