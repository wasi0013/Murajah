import { ayahCount } from '@/core/quran/surahMeta'

/**
 * Pure parsing/validation/resolution for the `/preview/:surah/:ayah(-:endAyah)?`
 * route (see plans task list in `tasks/plan.md`) — no router, no data client, so
 * it's fully unit-testable like `readerRoute.ts`/`resolveJump.ts`. Three
 * independent pieces, in the order a request flows through them:
 *
 *  1. {@link parsePreviewRange} — route params → a validated `{surah, startAyah,
 *     endAyah}`, or a typed error.
 *  2. {@link withinPageCap} — a bare page-count boundary check (the actual
 *     page-number resolution needs the nav index, so it lives in
 *     `usePreviewPages.ts`; this function just answers the yes/no).
 *  3. {@link parseHighlightParams} + {@link resolveWordStates} — the URL's
 *     highlight query params → a `location → state` map, once a page's real
 *     `Word[]` is loaded (a bare "highlight this whole ayah" token can't
 *     resolve to concrete words before then — surah metadata only has ayah
 *     *counts*, not per-ayah word counts).
 */

const MAX_SURAH = 114
/** Pages beyond this per range: reject before fetching (see tasks/plan.md's
 * page-cap arithmetic — worst case ~1.3MB of unique tajweed font files). */
export const PAGE_CAP = 12

// —— 1. Surah + ayah-range validation ————————————————————————————

export interface PreviewRange {
  surah: number
  startAyah: number
  endAyah: number
}

export type PreviewRangeResult =
  | { ok: true; value: PreviewRange }
  | { ok: false; error: 'surah' | 'range' }

/** Raw route params for the two `/preview` route records (single verse has no `endAyah`). */
export interface PreviewRouteParams {
  surah?: string | string[]
  ayah?: string | string[]
  endAyah?: string | string[]
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

function toInt(v: string | undefined): number | undefined {
  if (v == null || v === '') return undefined
  const n = Number(v)
  return Number.isInteger(n) ? n : undefined
}

/**
 * Validate route params into a surah + ayah range. Rejects an unknown surah
 * (`'surah'`), or a range that's inverted, non-positive, or beyond that
 * surah's actual ayah count (`'range'`) — using {@link ayahCount} rather than
 * trusting the URL.
 */
export function parsePreviewRange(params: PreviewRouteParams): PreviewRangeResult {
  const surah = toInt(first(params.surah))
  if (surah == null || surah < 1 || surah > MAX_SURAH) return { ok: false, error: 'surah' }

  const startAyah = toInt(first(params.ayah))
  const endRaw = first(params.endAyah)
  const endAyah = endRaw == null ? startAyah : toInt(endRaw)

  const count = ayahCount(surah)
  if (
    startAyah == null ||
    endAyah == null ||
    startAyah < 1 ||
    endAyah < startAyah ||
    endAyah > count
  ) {
    return { ok: false, error: 'range' }
  }

  return { ok: true, value: { surah, startAyah, endAyah } }
}

// —— 2. Page cap ————————————————————————————————————————————————

/** Whether a `[startPage, endPage]` span (inclusive) fits within {@link PAGE_CAP}. */
export function withinPageCap(startPage: number, endPage: number, cap = PAGE_CAP): boolean {
  return endPage - startPage + 1 <= cap
}
