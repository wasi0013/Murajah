import { watch } from 'vue'
import type { Router, RouteLocationNormalizedLoaded } from 'vue-router'
import type { useReaderStore } from '@/stores/reader'
import { parseReaderRoute, readerStateToRoute, type FriendlyTarget } from '@/core/navigation/readerRoute'

type ReaderStore = ReturnType<typeof useReaderStore>

/**
 * Result of resolving the current URL as a *friendly* reader route (Phase 9.1):
 *  - `undefined` — not a friendly route (a canonical `/read/:layout/:page` or `/`);
 *  - `'pending'` — friendly, but the nav index hasn't loaded yet;
 *  - `null`      — friendly but names something invalid (surah > 114, bad slug);
 *  - a target    — resolved to a page (+ optional verse to scroll to).
 */
export type FriendlyResolution = FriendlyTarget | null | 'pending' | undefined

export interface ReaderRouteSyncOptions {
  /** Resolve the current route as a friendly reader URL (see {@link FriendlyResolution}). */
  resolveFriendly?: (route: RouteLocationNormalizedLoaded) => FriendlyResolution
}

/**
 * Two-way bind the reader store and the reader URLs:
 *  - the canonical `/read/:layout/:page` form (layout + toggles, fully shareable);
 *  - the friendly forms `/:surah`, `/:surah/:ayah`, `/page/:page`, `/:slug` (9.1),
 *    which carry only *where* — script + toggles come from the store.
 *
 * store → URL: page/layout changes `push`, toggle-only changes `replace`. A friendly
 * URL that still names the current page is left **sticky** (kept in the bar) — it only
 * normalises to `/read/…` once the reader moves off that page. URL → store applies
 * deep-links + back/forward. Loops are broken structurally (each side skips when the
 * target already equals the current location); no re-entrancy flag needed.
 */
export function useReaderRouteSync(
  reader: ReaderStore,
  router: Router,
  opts: ReaderRouteSyncOptions = {},
) {
  const route = (): RouteLocationNormalizedLoaded => router.currentRoute.value

  /** Apply the current URL to the store (deep-link / back-forward restore). */
  function applyRoute(): void {
    const r = route()
    const friendly = opts.resolveFriendly?.(r)
    if (friendly === 'pending') return // nav not ready — ReaderView re-applies once it loads
    if (friendly === null) {
      void router.replace({ name: 'home' }).catch(() => {}) // named something that doesn't exist
      return
    }
    if (friendly) {
      reader.goToPage(friendly.page)
      reader.setFocusVerse(friendly.ayah ?? null)
      return
    }
    reader.restore(parseReaderRoute(r.params, r.query))
  }

  const stopStore = watch(
    () => {
      const { layout, page, tajweed, wbw, tafsir } = reader.snapshot()
      return { layout, page, tajweed, wbw, tafsir }
    },
    (curr) => {
      // Keep a friendly URL in the bar while it still names the current page, and
      // don't clobber it during the nav-not-ready window (9.1, decision 3).
      const friendly = opts.resolveFriendly?.(route())
      if (friendly === 'pending') return
      if (friendly && friendly.page === curr.page) return

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
