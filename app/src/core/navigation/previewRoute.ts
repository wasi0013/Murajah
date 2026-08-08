import type { Word } from '@/core/data/types'
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

// —— 3a. Highlight query parsing ————————————————————————————————

/**
 * The six highlighter slots. `red` is the default — it's also what a
 * colorless `hl=` param aliases into (see {@link parseHighlightParams}) — and
 * is the only one that reuses an existing visual (ReadingSurface's
 * `.state-mistake`) rather than getting a new `.state-hl-*` wash.
 */
export type HighlightColor = 'red' | 'amber' | 'blue' | 'green' | 'purple' | 'teal'

const HIGHLIGHT_COLORS: HighlightColor[] = ['red', 'amber', 'blue', 'green', 'purple', 'teal']

/** One highlight token, resolved to an ayah + an optional word sub-range within
 * it. No `wordStart`/`wordEnd` means "the whole ayah" — deliberately left
 * unresolved to concrete words here; that needs the page's loaded `Word[]`
 * (see {@link resolveWordStates}), since ayah metadata only has word *counts*
 * nowhere in this app, let alone per-word text. */
export interface HighlightSpec {
  ayah: number
  wordStart?: number
  wordEnd?: number
}

export type HighlightSpecsByColor = Partial<Record<HighlightColor, HighlightSpec[]>>

/** Raw query shape this route reads — every other param is ignored, not an
 * error. Value type mirrors vue-router's actual `LocationQuery` (a bare
 * `?red` with no `=value` resolves to `null`, not `''`), so `route.query` can
 * be passed straight through with no cast. */
export type PreviewHighlightQuery = Partial<
  Record<HighlightColor | 'hl', string | (string | null)[] | null>
>

function toTokenList(v: string | (string | null)[] | null | undefined): string[] {
  if (v == null) return []
  const values = Array.isArray(v) ? v : [v]
  return values
    .filter((s): s is string => s != null)
    .flatMap((s) => s.split(','))
    .map((s) => s.trim())
    .filter(Boolean)
}

// `ayah`, `ayah:word`, or `ayah:word-word` — anything else (letters, a bare
// colon, an inverted word range, stray punctuation) doesn't match and the
// token is dropped by the caller, not the whole param.
const TOKEN_RE = /^(\d+)(?::(\d+)(?:-(\d+))?)?$/

function parseToken(token: string): HighlightSpec | null {
  const m = TOKEN_RE.exec(token)
  if (!m) return null
  const ayah = Number(m[1])
  if (ayah < 1) return null
  if (m[2] == null) return { ayah }
  const wordStart = Number(m[2])
  if (wordStart < 1) return null
  const wordEnd = m[3] == null ? wordStart : Number(m[3])
  if (wordEnd < wordStart) return null
  return { ayah, wordStart, wordEnd }
}

/**
 * Parse the six color query params (plus the colorless `hl=` alias, which
 * merges into `red`) into per-color highlight specs. Individual malformed
 * tokens are dropped silently — a typo in one token never blanks the rest of
 * that param, let alone the page.
 */
export function parseHighlightParams(query: PreviewHighlightQuery): HighlightSpecsByColor {
  const result: HighlightSpecsByColor = {}
  for (const color of HIGHLIGHT_COLORS) {
    const tokens = toTokenList(query[color])
    if (color === 'red') tokens.push(...toTokenList(query.hl))
    const specs = tokens.map(parseToken).filter((s): s is HighlightSpec => s !== null)
    if (specs.length) result[color] = specs
  }
  return result
}

// —— 3b. Resolving specs against a loaded page ——————————————————————

/** The subset of ReadingSurface's `wordStates` values this route ever produces.
 * `red` deliberately maps to `'mistake'` — no separate state, it reuses the
 * existing mistake-mark visual (see ReadingSurface.vue's `.state-mistake`). */
export type PreviewWordState = 'mistake' | 'hl-amber' | 'hl-blue' | 'hl-green' | 'hl-purple' | 'hl-teal'

const STATE_FOR_COLOR: Record<HighlightColor, PreviewWordState> = {
  red: 'mistake',
  amber: 'hl-amber',
  blue: 'hl-blue',
  green: 'hl-green',
  purple: 'hl-purple',
  teal: 'hl-teal',
}

/**
 * Turn parsed highlight specs into a `location → state` map for
 * ReadingSurface's `word-states` prop, against one page's actually-loaded
 * `Word[]` (this is the step that resolves a bare "whole ayah" spec to
 * concrete words). Colors are applied in fixed priority order — `red` first —
 * and a word already claimed by a higher-priority color is left alone, so a
 * single-word `red` spec correctly carves a hole out of a whole-ayah `blue`
 * spec covering the same ayah, rather than one flattening the other.
 */
export function resolveWordStates(
  specsByColor: HighlightSpecsByColor,
  words: Word[],
): Record<string, PreviewWordState> {
  const result: Record<string, PreviewWordState> = {}
  for (const color of HIGHLIGHT_COLORS) {
    const specs = specsByColor[color]
    if (!specs?.length) continue
    const state = STATE_FOR_COLOR[color]
    for (const w of words) {
      if (w.location in result) continue // higher-priority color already claimed it
      const ayah = Number(w.ayah)
      const wordIndex = Number(w.word)
      const matches = specs.some((spec) => {
        if (spec.ayah !== ayah) return false
        if (spec.wordStart == null) return true // whole ayah
        return wordIndex >= spec.wordStart && wordIndex <= (spec.wordEnd ?? spec.wordStart)
      })
      if (matches) result[w.location] = state
    }
  }
  return result
}
