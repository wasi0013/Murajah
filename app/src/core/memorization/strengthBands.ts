/**
 * Human-readable memorization-strength levels + display-only time decay.
 *
 * `perfectRevisions` / `progress.strength` (see `core/storage/userData.ts`) is an
 * unbounded, non-negative integer counter — not a 0–100 percentage. This module
 * maps that raw number onto 7 hifz-terminology bands for display, and caps the
 * displayed band when a page has gone unrevised for a long time ("decay").
 *
 * Independent from `weaknessScorer.ts` on purpose: that module computes a
 * different, 0–100 *weakness score* for daily task scheduling, with its own
 * short (30-day) recency window. This module's decay is a separate, much
 * slower (months-to-years) signal for the retention *label* only — it never
 * feeds scheduling, quizzing, or plan-type detection. See `progress.strength`
 * consumers in `planBuilder.ts` / `dailyTasks.ts` / `useQuiz.ts`, all of which
 * keep reading the raw, undecayed number exactly as before this module existed.
 */

export type StrengthRank = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface StrengthBand {
  rank: StrengthRank
  /** Raw `perfectRevisions` value at/above which a page falls in this band. */
  minStrength: number
  /** i18n key under `strengthBand.*` — display text/colour live in the UI layer. */
  labelKey: string
}

/** The 7 bands, ascending. `minStrength` also doubles as the dropdown's write-back value. */
export const STRENGTH_BANDS: readonly StrengthBand[] = [
  { rank: 0, minStrength: 0, labelKey: 'notMemorized' },
  { rank: 1, minStrength: 1, labelKey: 'jadid' },
  { rank: 2, minStrength: 40, labelKey: 'daif' },
  { rank: 3, minStrength: 60, labelKey: 'mutawassit' },
  { rank: 4, minStrength: 75, labelKey: 'qawiy' },
  { rank: 5, minStrength: 90, labelKey: 'rasikh' },
  { rank: 6, minStrength: 98, labelKey: 'mutqan' },
]

/** The floor decay never caps below — a page once memorized never fully "un-memorizes" from neglect. */
export const DECAY_FLOOR_RANK: StrengthRank = 2

/**
 * The raw-strength floor a page starts at when it's affirmatively marked
 * memorized without going through the guided revision loop — bulk range-mark,
 * the single-page toggle, and the storage-layer backfill for legacy/already-
 * memorized data all credit exactly this (see `stores/progress.ts`'s
 * `creditFreshMemorization` and `core/storage/userData.ts`'s
 * `backfillReviewDates`). Deliberately Da'if's (Weak's) own lower bound, not
 * some arbitrary number — so those pages render at the documented floor
 * immediately, and so `bandForStrength` of this value round-trips to exactly
 * `DECAY_FLOOR_RANK`.
 */
export const MEMORIZED_FLOOR_STRENGTH = bandByRank(DECAY_FLOOR_RANK).minStrength

/**
 * How long a memorized page can sit with **zero** completed revisions —
 * counting from `lastReviewDate` (backfilled to the import/mark date when no
 * real history exists, see `backfillReviewDates` in `core/storage/userData.ts`)
 * — before it's honestly shown as Not Memorized instead of floored at Da'if.
 * Product rule: a page the user has marked memorized only ever displays as
 * Not Memorized if it's gone unrevised, from day one, for 3+ years.
 */
export const NEVER_REVISED_TIMEOUT_DAYS = 1095 // 3 years

/** Highest band whose `minStrength <= strength` (negative strength clamps to rank 0). */
export function bandForStrength(strength: number): StrengthBand {
  let best = STRENGTH_BANDS[0]
  for (const b of STRENGTH_BANDS) if (strength >= b.minStrength) best = b
  return best
}

export function bandByRank(rank: StrengthRank): StrengthBand {
  return STRENGTH_BANDS[rank]
}

/**
 * Whole days between `lastReviewDate` (`YYYY-MM-DD`) and `today`, UTC-anchored
 * (parses via `Date.UTC`, not the local-time `new Date(str)` constructor) so a
 * DST transition never shifts the count by an hour into an extra/missing day.
 * Missing or unparseable input returns `Infinity` — an unknown last-touch date
 * decays conservatively toward the floor rather than being assumed fresh. This
 * only occurs pre-migration; see `backfillReviewDates` in `core/storage/userData.ts`.
 */
export function daysSince(lastReviewDate: string | undefined, today: Date = new Date()): number {
  if (!lastReviewDate) return Infinity
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(lastReviewDate)
  if (!m) return Infinity
  const then = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(then)) return Infinity
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.round((now - then) / 86_400_000)
}

/**
 * Fixed, cumulative-from-`lastReviewDate` day thresholds — NOT per-band dwell
 * time. A single timestamp can't reconstruct which bands a page passed
 * through, so this is a cap on the displayed rank, never a reconstructed
 * step-down path. UI copy must say "not revised since {date}", never
 * "downgraded from X to Y".
 */
export function capForDays(days: number): StrengthRank {
  if (days >= 1365) return 2 // +3mo — floor (Da'if)
  if (days >= 1275) return 3 // +6mo (Mutawassit)
  if (days >= 1095) return 4 // +12mo (Qawiy)
  if (days >= 730) return 5 // 24mo (Rasikh)
  return 6 // no cap
}

/**
 * The rank actually shown to the user: the raw band, capped by neglect, with
 * a `memorized`-aware floor.
 *
 * For any page with `rawStrength > 0` (it's completed at least one real
 * revision) this is unchanged from before: `min(raw, cap)` — decay can only
 * ever push the displayed band down, never up, so an honestly-low band (e.g.
 * Jadid from a handful of revisions) stays exactly that, never gets lifted to
 * the Da'if floor.
 *
 * `rawStrength <= 0` is the case that regressed: a page can be `memorized`
 * (legacy import predating this counter, a fresh single-page mark, or a
 * strength that mistakes floored back to 0) while its raw band is
 * `bandForStrength(0)` = Not Memorized. Showing that for an actually-memorized
 * page is wrong — the boolean and the label contradict each other. So a
 * memorized page with zero revisions floors at Da'if (Weak) instead, *unless*
 * it's gone unrevised for `NEVER_REVISED_TIMEOUT_DAYS` — at that point it
 * really has earned "Not Memorized". A non-memorized page never gets a floor;
 * it shows the honest `min(raw, cap)`, which for `rawStrength <= 0` is always 0.
 */
export function effectiveRank(
  memorized: boolean,
  rawStrength: number,
  daysSinceLastRevision: number,
): StrengthRank {
  const raw = bandForStrength(rawStrength).rank
  const cap = capForDays(daysSinceLastRevision)
  const capped = Math.min(raw, cap) as StrengthRank
  if (!memorized || rawStrength > 0) return capped
  // `daysSinceLastRevision` is only a real elapsed count once a `lastReviewDate`
  // anchor exists (see `daysSince`'s `Infinity` fallback for "no anchor yet").
  // An un-anchored page must NOT trip this escape hatch — that would show
  // "Not Memorized" the instant a page is marked, before the decay clock even
  // has a start date, which is the exact bug this function exists to fix.
  return Number.isFinite(daysSinceLastRevision) && daysSinceLastRevision >= NEVER_REVISED_TIMEOUT_DAYS
    ? 0
    : DECAY_FLOOR_RANK
}
