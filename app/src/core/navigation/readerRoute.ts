import type { Layout } from '@/core/data/types'

/**
 * Pure mapping between the reader's URL and its view state — no router here, so
 * it's fully unit-testable. Path carries the two things that define "where you
 * are" (`/read/:layout/:page`); the three primary toggles ride in the query.
 * Only non-default toggles are serialized, so shared links stay clean, while
 * parsing stays lenient (accepts `1`/`0`/`true`/`false`). Langs, text size, and
 * mode are personal prefs (3.1.2), not part of shareable URLs.
 */

/** The URL-encoded slice of reader state. */
export interface ReaderRouteState {
  layout?: Layout
  page?: number
  tajweed?: boolean
  wbw?: boolean
  tafsir?: boolean
}

/** Defaults the serializer omits (they're the store's initial values). */
const TOGGLE_DEFAULTS = { tajweed: true, wbw: false, tafsir: false } as const

type RouteParams = Record<string, string | string[] | undefined>
type RouteQuery = Record<string, string | (string | null)[] | null | undefined>

function isLayout(v: unknown): v is Layout {
  return v === 'qpc' || v === 'indopak'
}

function bool(v: RouteQuery[string]): boolean | undefined {
  const s = Array.isArray(v) ? v[0] : v
  if (s === '1' || s === 'true') return true
  if (s === '0' || s === 'false') return false
  return undefined
}

/** Parse `:layout`/`:page` params + query into a partial reader state. */
export function parseReaderRoute(params: RouteParams, query: RouteQuery = {}): ReaderRouteState {
  const state: ReaderRouteState = {}

  const layout = Array.isArray(params.layout) ? params.layout[0] : params.layout
  if (isLayout(layout)) state.layout = layout

  const rawPage = Array.isArray(params.page) ? params.page[0] : params.page
  const page = Number(rawPage)
  if (Number.isFinite(page) && page >= 1) state.page = Math.trunc(page)

  const t = bool(query.tajweed)
  if (t !== undefined) state.tajweed = t
  const w = bool(query.wbw)
  if (w !== undefined) state.wbw = w
  const f = bool(query.tafsir)
  if (f !== undefined) state.tafsir = f

  return state
}

/** Build the `{ params, query }` for a reader state (omitting default toggles). */
export function readerStateToRoute(state: {
  layout: Layout
  page: number
  tajweed: boolean
  wbw: boolean
  tafsir: boolean
}): { params: { layout: Layout; page: string }; query: Record<string, string> } {
  const query: Record<string, string> = {}
  if (state.tajweed !== TOGGLE_DEFAULTS.tajweed) query.tajweed = state.tajweed ? '1' : '0'
  if (state.wbw !== TOGGLE_DEFAULTS.wbw) query.wbw = state.wbw ? '1' : '0'
  if (state.tafsir !== TOGGLE_DEFAULTS.tafsir) query.tafsir = state.tafsir ? '1' : '0'
  return { params: { layout: state.layout, page: String(state.page) }, query }
}
