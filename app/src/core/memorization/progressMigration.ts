import type { UserData } from '@/core/storage/legacyExport'
import type { Progress } from '@/core/storage/userData'
import { getPageHasanah } from './pageHasanah.js'

/**
 * Build the Phase-4 `Progress` from a migrated legacy backup (`parseLegacyExport`).
 * Memorized pages + memorization strength (legacy `perfectRevisions`) carry over
 * verbatim. Legacy computed the reward on the fly, so the cumulative `hasanah` is
 * **seeded** from prior memorization — `Σ pageHasanah(page) × strength(page)` —
 * the historical reward; reading rewards then accrue fresh from 0.
 */
export function progressFromLegacy(user: UserData): Progress {
  const strength = new Map(user.perfectRevisions)
  let hasanah = 0
  for (const [page, count] of strength) hasanah += getPageHasanah(page) * count
  // Legacy backups carry no review history, nor any record of *when* a page was
  // memorized — both start empty (review history: real history is Phase 5;
  // memorization order: never tracked pre-migration, see `Progress.memorizedAt`).
  return { memorized: new Set(user.memorized), strength, hasanah, reviewData: new Map(), memorizedAt: new Map() }
}
