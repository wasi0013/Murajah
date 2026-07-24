/**
 * Question-target selection (Phase 6.1.3) — the weak/strong interleave.
 *
 * The quiz reinforces what needs it, so targets are weighted toward **weak** pages.
 * But a session that only ever drills your worst pages is discouraging and blind to
 * regressions in pages you think you know — so roughly one draw in four is pulled
 * from a **strong** page on purpose. Pure and RNG-injected.
 */
import { pickRandom } from './select'
import type { Rng, Target } from './types'

/** Share of question targets deliberately drawn from strong (non-weak) pages. */
export const STRONG_RATIO = 0.25

export interface PickTargetOptions {
  /** Probability a given draw targets a strong page. Defaults to {@link STRONG_RATIO}. */
  strongRatio?: number
  rng?: Rng
}

/**
 * Pick one target from `pool`, honouring the strong/weak interleave.
 *
 * The ratio is a *preference*, not a quota: if the preferred class is empty this draw
 * falls back to the other, so an all-weak or all-strong scope still yields questions.
 * Returns `undefined` only for an empty pool.
 */
export function pickTarget(
  pool: readonly Target[],
  { strongRatio = STRONG_RATIO, rng = Math.random }: PickTargetOptions = {},
): Target | undefined {
  if (pool.length === 0) return undefined

  const weak = pool.filter((t) => t.weak)
  const strong = pool.filter((t) => !t.weak)

  const wantStrong = rng() < strongRatio
  // Preferred class, falling back to the other when the preferred one is empty.
  const preferred = wantStrong ? strong : weak
  const chosen = preferred.length > 0 ? preferred : wantStrong ? weak : strong

  return pickRandom(chosen, rng)
}
