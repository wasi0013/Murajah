import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { setActivePinia, createPinia } from 'pinia'
import legacyBackup from '../fixtures/legacy-export.json'
import { parseLegacyExport } from '@/core/storage/legacyExport'
import { progressFromLegacy } from '@/core/memorization/progressMigration'
import { getPageHasanah } from '@/core/memorization/pageHasanah.js'
import {
  loadProgress,
  saveProgress,
  loadMistakes,
  saveMistakes,
  _resetUserDataDb,
} from '@/core/storage/userData'
import { useProgressStore } from '@/stores/progress'
import { useMistakesStore } from '@/stores/mistakes'
import { memorizationStats, pageCell } from '@/core/memorization/progressView'
import { effectiveRank, bandForStrength, daysSince, MEMORIZED_FLOOR_STRENGTH } from '@/core/memorization/strengthBands'

/**
 * Migration-parity (headline, Phase 4.10.1). Exercises the REAL migration path end
 * to end on a committed legacy v2.0.0 backup: parse → progressFromLegacy → persist
 * to IndexedDB → reload into fresh stores → assert the rendered view-model shows
 * identical memorized pages, strength levels, mistakes, and a hasanah seeded to
 * Σ pageHasanah × strength. No hand-computed expectations — derived from the fixture.
 */
describe('migration parity on a committed legacy export', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
    _resetUserDataDb()
    setActivePinia(createPinia())
  })

  it('migrates → persists → reloads with identical progress + mistakes + seeded hasanah', async () => {
    const user = parseLegacyExport(legacyBackup)

    // Expectations derived straight from the fixture (no magic numbers).
    const expectedMemorized = new Set(legacyBackup.memorized)
    const legacyStrength = new Map(
      Object.entries(legacyBackup.perfectRevisions).map(([p, n]) => [Number(p), n as number]),
    )
    let expectedHasanah = 0
    for (const [page, n] of legacyStrength) expectedHasanah += getPageHasanah(page) * n
    // The storage-layer backfill (userData.ts) floors any memorized page the
    // legacy export carried with no `perfectRevisions` entry at all to
    // `MEMORIZED_FLOOR_STRENGTH` — silently, with no hasanah for the credit
    // (unlike a live user-triggered mark), so `expectedHasanah` above is
    // computed from the raw legacy numbers only, before this floor applies.
    const expectedStrength = new Map(legacyStrength)
    for (const page of legacyBackup.memorized) {
      if (!expectedStrength.has(page)) expectedStrength.set(page, MEMORIZED_FLOOR_STRENGTH)
    }
    const expectedMistakePages = Object.values(legacyBackup.mistakes).filter(
      (ids) => (ids as number[]).length > 0,
    ).length

    // Migrate + persist (the real import path: no live UI yet — Phase 8).
    await saveProgress(progressFromLegacy(user))
    await saveMistakes(user.mistakes)

    // Reload into fresh stores (simulates a cold start after import).
    setActivePinia(createPinia())
    const progress = useProgressStore()
    const mistakes = useMistakesStore()
    progress.setAll(await loadProgress())
    mistakes.setAll(await loadMistakes())

    // Store-level parity.
    expect(progress.memorized).toEqual(expectedMemorized)
    expect(progress.strength).toEqual(expectedStrength)
    expect(progress.hasanah).toBe(expectedHasanah)
    expect(expectedHasanah).toBeGreaterThan(0)
    expect(mistakes.byPage).toEqual(
      new Map(
        Object.entries(legacyBackup.mistakes).map(([p, ids]) => [Number(p), new Set(ids as number[])]),
      ),
    )

    // View-model parity: the stats the Progress dashboard renders.
    const stats = memorizationStats({
      memorized: progress.memorized,
      strength: progress.strength,
      mistakes: mistakes.byPage,
      hasanah: progress.hasanah,
      totalPages: 604,
    })
    expect(stats.memorizedCount).toBe(expectedMemorized.size)
    expect(stats.totalHasanah).toBe(expectedHasanah)
    expect(stats.mistakePages).toBe(expectedMistakePages)

    // Cell parity: each memorized page renders memorized, with the migrated strength
    // level (decay-capped by whatever reviewData migration/backfill produced) and
    // any mistake count — the grid's per-cell inputs.
    for (const page of expectedMemorized) {
      const strength = expectedStrength.get(page) ?? 0
      const mistakeCount = (legacyBackup.mistakes as Record<string, number[]>)[String(page)]?.length ?? 0
      const days = daysSince(progress.reviewData.get(page)?.lastReviewDate)
      const cell = pageCell(page, progress.isMemorized(page), progress.strengthOf(page), mistakeCount, days)
      expect(cell.memorized).toBe(true)
      expect(cell.strength).toBe(strength)
      expect(cell.level).toBe(effectiveRank(true, strength, days))
      expect(cell.mistakes).toBe(mistakeCount)
    }

    // A legacy page with a small raw strength (604 → 12, "Jadid") no longer
    // saturates the old broken 0–6 ramp — it renders its real band, not "mastered".
    const days604 = daysSince(progress.reviewData.get(604)?.lastReviewDate)
    expect(pageCell(604, true, progress.strengthOf(604), 0, days604).level).toBe(
      bandForStrength(progress.strengthOf(604)).rank,
    )
    expect(bandForStrength(progress.strengthOf(604)).rank).toBe(1) // 12 → Jadid, not Mutqan

    // Regression: the fixture has memorized pages with NO `perfectRevisions`
    // entry at all (legacy imports predate that counter for pages the user
    // never formally revised). Those must be backfilled to the Weak floor —
    // in the stored strength itself, not just at display time — and render
    // "Weak", not "Not Memorized" — the bug this fixture was extended to catch.
    const zeroStrengthMemorized = [...expectedMemorized].filter((p) => !legacyStrength.has(p))
    expect(zeroStrengthMemorized.length).toBeGreaterThan(0) // sanity: the fixture actually exercises this
    for (const page of zeroStrengthMemorized) {
      expect(progress.strengthOf(page)).toBe(MEMORIZED_FLOOR_STRENGTH) // floored in storage, not just display
      const days = daysSince(progress.reviewData.get(page)?.lastReviewDate)
      expect(days).not.toBe(Infinity) // backfilled to the import date, not left anchor-less
      expect(pageCell(page, true, progress.strengthOf(page), 0, days).level).toBe(2) // Da'if (Weak)
    }
  })
})
