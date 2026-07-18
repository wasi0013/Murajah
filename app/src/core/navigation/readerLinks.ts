import type { RouteLocationRaw } from 'vue-router'

/**
 * Canonical builders for the friendly reader URLs (Phase 9.1) — the one place
 * that knows the route names, so callers never hand-assemble `{ name, params }`.
 * A surah target yields `/1`…`/114` (or `/1/255` with an ayah); a page target
 * yields `/page/N`. Layout + view toggles are the viewer's persisted prefs, so
 * they're deliberately absent here (see core/navigation/readerRoute.ts).
 */
export type ReaderTarget =
  | { surah: number; ayah?: number }
  | { page: number }
  | { slug: string }

export function readerLink(target: ReaderTarget): RouteLocationRaw {
  if ('surah' in target) {
    return target.ayah != null
      ? { name: 'read-ayah', params: { surah: String(target.surah), ayah: String(target.ayah) } }
      : { name: 'read-surah', params: { surah: String(target.surah) } }
  }
  if ('slug' in target) {
    return { name: 'read-slug', params: { slug: target.slug } }
  }
  return { name: 'read-page', params: { page: String(target.page) } }
}

/** The standalone mushaf (scan) surface at a given page. */
export function mushafLink(page: number): RouteLocationRaw {
  return { name: 'mushaf', params: { page: String(page) } }
}
