import { bandForStrength, type StrengthRank } from './strengthBands'

/**
 * Manages one page's "run" of manual memorization-level picks (see
 * `ProgressView.vue`'s level dropdown): what raw strength a pick actually
 * writes, and whether/when to debounce-stamp the decay clock. The two are
 * combined here because they share the exact same lifecycle — a "run" starts
 * on the first edit, extends on every further edit, and ends when the
 * cooldown fires or `cancel()` is called — so tracking it twice (once per
 * concern) would just duplicate the same baseline bookkeeping.
 *
 * **Exact-restore on revert.** `setStrengthBand`-style writes always write a
 * band's *floor* value. That's fine for a genuine change, but is lossy for
 * "pick X, then pick back to the original band Y": naively re-writing Y's
 * floor would silently drop any real strength built up above that floor
 * (e.g. 55 → pick Qawiy (75) → pick Da'if again → naive floor write gives
 * 40, not the original 55). `pickLevel` instead snapshots the *exact* raw
 * strength before the first edit in a run and restores it precisely if a
 * later pick in the same run nets back to that same band — never floors a
 * value that was never actually left.
 *
 * **Debounced decay-clock stamp.** See the cooldown semantics on
 * `onLevelChange` in the (now-merged) stamp logic: a pick that nets to no
 * real change, within `cooldownMs`, never resets `lastReviewDate`.
 */
export interface LevelEditControllerDeps {
  /** Read a page's *current* raw strength (not cached). */
  currentStrength: (page: number) => number
  /** Write a band's floor value for a page — a genuine level change. */
  writeBandFloor: (page: number, rank: StrengthRank) => void
  /** Restore an exact previous raw strength value (a reverted change). */
  restoreStrength: (page: number, strength: number) => void
  /** Commit the decay-clock stamp — normally the progress store's `touchReviewDate`. */
  stamp: (page: number, date: string) => void
  /** Today's date (`YYYY-MM-DD`) at commit time, not schedule time. */
  today: () => string
  /** Debounce window. Defaults to 60s. */
  cooldownMs?: number
}

export interface LevelEditController {
  /** Call on every level pick from the dropdown. Applies the strength write immediately. */
  pickLevel: (page: number, rank: StrengthRank) => void
  /** Cancel a page's in-progress run — call on any other explicit, deliberate action (a manual date edit, "Revised today"). */
  cancel: (page: number) => void
  /** Cancel every page's in-progress run (test/teardown use). */
  cancelAll: () => void
}

export const DEFAULT_LEVEL_EDIT_COOLDOWN_MS = 60_000

interface RunBaseline {
  rank: StrengthRank
  strength: number
}

export function createLevelEditController(deps: LevelEditControllerDeps): LevelEditController {
  const cooldownMs = deps.cooldownMs ?? DEFAULT_LEVEL_EDIT_COOLDOWN_MS
  const baseline = new Map<number, RunBaseline>()
  const timers = new Map<number, ReturnType<typeof setTimeout>>()

  function cancel(page: number): void {
    const timer = timers.get(page)
    if (timer !== undefined) clearTimeout(timer)
    timers.delete(page)
    baseline.delete(page)
  }

  function pickLevel(page: number, rank: StrengthRank): void {
    let base = baseline.get(page)
    if (!base) {
      const strength = deps.currentStrength(page)
      base = { rank: bandForStrength(strength).rank, strength }
      baseline.set(page, base)
    }

    if (rank === base.rank) {
      // Netted back to where this run started — restore precisely, don't floor.
      deps.restoreStrength(page, base.strength)
    } else {
      deps.writeBandFloor(page, rank)
    }

    const existing = timers.get(page)
    if (existing !== undefined) clearTimeout(existing)
    const timer = setTimeout(() => {
      timers.delete(page)
      const b = baseline.get(page)
      baseline.delete(page)
      // Re-read fresh at fire time: only stamp if the level actually netted
      // out different from where it stood before this run of edits.
      if (b !== undefined && bandForStrength(deps.currentStrength(page)).rank !== b.rank) {
        deps.stamp(page, deps.today())
      }
    }, cooldownMs)
    timers.set(page, timer)
  }

  function cancelAll(): void {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
    baseline.clear()
  }

  return { pickLevel, cancel, cancelAll }
}
