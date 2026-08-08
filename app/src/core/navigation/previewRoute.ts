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

/** Fixed display/priority order — exported so the color-picker bar (Task: the
 * preview page's own tap-to-paint editor) iterates the same canonical order
 * rather than redeclaring it. */
export const HIGHLIGHT_COLORS: HighlightColor[] = ['red', 'amber', 'blue', 'green', 'purple', 'teal']

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

/** The `ReadingSurface` state class a given color renders as — exported for
 * the color-picker bar, which needs it to render its own swatches/labels. */
export function stateForColor(color: HighlightColor): PreviewWordState {
  return STATE_FOR_COLOR[color]
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

// —— 4. Tap-to-paint editing (Task: the color bar on /preview itself) ————
//
// /preview's highlights are entirely URL-driven, so "marking a word" here
// means editing the current URL's query params, not writing to any store —
// there is nothing to persist and nothing that touches the visitor's own
// local data. `toggleWordHighlight` finds whichever color (if any) currently
// claims a word — same priority order `resolveWordStates` renders with — and
// either removes it from that color, or (if unclaimed) adds it to whichever
// color is active on the bar.

/** A single word to toggle, addressed the same way a highlight token is. */
export interface WordRef {
  ayah: number
  word: number
}

/** Expand a spec into one-token-per-word against a known word list — needed
 * so removing a single word from a whole-ayah (or ranged) spec never removes
 * its ayah-mates too. Falls back to the spec itself if `words` doesn't cover
 * it (e.g. a whole-ayah spec whose ayah spans a page boundary this call
 * wasn't given words for) — imperfect for that rare case, but never wrong in
 * the common one. */
function expandSpec(spec: HighlightSpec, words: Word[]): HighlightSpec[] {
  if (spec.wordStart != null) {
    if (spec.wordStart === spec.wordEnd) return [spec]
    const out: HighlightSpec[] = []
    for (let w = spec.wordStart; w <= (spec.wordEnd ?? spec.wordStart); w++) {
      out.push({ ayah: spec.ayah, wordStart: w, wordEnd: w })
    }
    return out
  }
  const ayahWords = words.filter((w) => Number(w.ayah) === spec.ayah).map((w) => Number(w.word))
  if (!ayahWords.length) return [spec] // no data for this ayah — can't safely expand
  return ayahWords.map((w) => ({ ayah: spec.ayah, wordStart: w, wordEnd: w }))
}

/** Which color (if any) currently claims `target`, in the same red-first
 * priority `resolveWordStates` applies. */
function ownerColor(specsByColor: HighlightSpecsByColor, target: WordRef): HighlightColor | null {
  for (const color of HIGHLIGHT_COLORS) {
    const specs = specsByColor[color]
    if (!specs?.length) continue
    const hit = specs.some(
      (spec) =>
        spec.ayah === target.ayah &&
        (spec.wordStart == null || (target.word >= spec.wordStart && target.word <= (spec.wordEnd ?? spec.wordStart))),
    )
    if (hit) return color
  }
  return null
}

/**
 * Toggle one word: unclaimed → added to `activeColor`; already claimed by any
 * color → removed from that color (regardless of `activeColor`), matching
 * "tap an unmarked word to paint it, tap a marked word to clear it". `words`
 * is the tapped word's own page's loaded `Word[]` (used only to expand a
 * whole-ayah spec when removing one word from it).
 */
export function toggleWordHighlight(
  specsByColor: HighlightSpecsByColor,
  target: WordRef,
  activeColor: HighlightColor,
  words: Word[],
): HighlightSpecsByColor {
  const owner = ownerColor(specsByColor, target)
  const result: HighlightSpecsByColor = { ...specsByColor }

  if (owner) {
    const expanded = (result[owner] ?? []).flatMap((spec) => expandSpec(spec, words))
    const kept = expanded.filter((spec) => !(spec.ayah === target.ayah && spec.wordStart === target.word))
    if (kept.length) result[owner] = kept
    else delete result[owner]
  } else {
    result[activeColor] = [...(result[activeColor] ?? []), { ayah: target.ayah, wordStart: target.word, wordEnd: target.word }]
  }
  return result
}

function stringifySpec(spec: HighlightSpec): string {
  if (spec.wordStart == null) return String(spec.ayah)
  if (spec.wordStart === spec.wordEnd) return `${spec.ayah}:${spec.wordStart}`
  return `${spec.ayah}:${spec.wordStart}-${spec.wordEnd}`
}

/** Serialize parsed specs back into the six query-param values (`undefined`
 * for a color with nothing to show — merge this into `route.query` and Vue
 * Router drops the key entirely, rather than writing `?amber=`). */
export function specsByColorToQuery(
  specsByColor: HighlightSpecsByColor,
): Record<HighlightColor, string | undefined> {
  const query = {} as Record<HighlightColor, string | undefined>
  for (const color of HIGHLIGHT_COLORS) {
    const specs = specsByColor[color]
    query[color] = specs?.length ? specs.map(stringifySpec).join(',') : undefined
  }
  return query
}
