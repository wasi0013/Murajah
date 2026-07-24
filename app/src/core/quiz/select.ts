/**
 * Pure selection primitives (Phase 6.1.1).
 *
 * The only genuinely reusable part of legacy `quizHelpers.js` — re-typed, made
 * non-mutating, and given an injectable RNG. The legacy data-shaping helpers
 * (`buildVerseCache`, `buildPageWordIndex`, `getPagesForSurahs`, …) are gone: they
 * were written against data shapes the new pipeline no longer emits.
 */
import type { Rng } from './types'

/**
 * Fisher–Yates shuffle returning a **new** array (legacy shuffled in place, which is
 * a footgun with Vue reactive arrays). `rng` defaults to `Math.random`.
 */
export function shuffle<T>(arr: readonly T[], rng: Rng = Math.random): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** A random element, or `undefined` for an empty array. */
export function pickRandom<T>(arr: readonly T[], rng: Rng = Math.random): T | undefined {
  if (arr.length === 0) return undefined
  return arr[Math.floor(rng() * arr.length)]
}

/**
 * Sample up to `count` distinct items from `pool`, excluding anything in `exclude`.
 * Partial Fisher–Yates over a filtered copy — O(pool) to filter, O(count) to draw,
 * and it can never return a duplicate or an excluded item.
 *
 * `keyOf` maps an item to the value compared against `exclude` (defaults to the item
 * itself) — so callers can exclude by verse ref, word text, etc.
 */
export function sampleWithout<T, K = T>(
  pool: readonly T[],
  exclude: ReadonlySet<K>,
  count: number,
  keyOf: (item: T) => K = (item) => item as unknown as K,
  rng: Rng = Math.random,
): T[] {
  const eligible = pool.filter((item) => !exclude.has(keyOf(item)))
  const take = Math.min(count, eligible.length)
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(rng() * (eligible.length - i))
    ;[eligible[i], eligible[j]] = [eligible[j], eligible[i]]
  }
  return eligible.slice(0, take)
}
