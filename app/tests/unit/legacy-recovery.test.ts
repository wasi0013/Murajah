import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { loadProgress, loadMistakes, _resetUserDataDb } from '@/core/storage/userData'
import { _resetPrefsDb } from '@/core/storage/prefs'
import { hasLegacyData, recoverLegacyData, LEGACY_DB_NAME } from '@/core/storage/legacyRecovery'

const LEGACY_DB_VERSION = 6

/** Seed a legacy `murajah-db` shaped like plans/legacy-schema.md, with an
 * `appData` blob under id `murajah-data` — the same fixture shape
 * pwa-rehearsal.spec.ts uses against the real legacy service worker. */
function seedLegacyDb(appData: {
  memorized?: number[]
  perfectRevisions?: Record<string, number>
  mistakes?: Record<string, number[]>
  settings?: Record<string, unknown>
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LEGACY_DB_NAME, LEGACY_DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore('appData', { keyPath: 'id' })
      req.result.createObjectStore('dailyGoals', { keyPath: 'date' })
      req.result.createObjectStore('notes', { keyPath: 'id' })
    }
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction('appData', 'readwrite')
      tx.objectStore('appData').put({ id: 'murajah-data', ...appData })
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error)
    }
    req.onerror = () => reject(req.error)
  })
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetUserDataDb()
  _resetPrefsDb()
})

describe('hasLegacyData', () => {
  it('is false when murajah-db does not exist', async () => {
    expect(await hasLegacyData()).toBe(false)
  })

  it('is true once murajah-db exists', async () => {
    await seedLegacyDb({ memorized: [1] })
    expect(await hasLegacyData()).toBe(true)
  })
})

describe('recoverLegacyData', () => {
  it('reports no-data when there is nothing to recover', async () => {
    expect(await recoverLegacyData()).toEqual({ status: 'no-data' })
  })

  it('merges legacy memorized/strength/mistakes into a fresh new-app store, then deletes murajah-db', async () => {
    await seedLegacyDb({
      memorized: [1, 2, 3],
      perfectRevisions: { '1': 5, '2': 3 },
      mistakes: { '3': [1, 4, 7] },
      settings: { layout: 'indopak', tajweedEnabled: false },
    })

    const result = await recoverLegacyData()
    expect(result).toEqual({ status: 'recovered' })

    const progress = await loadProgress()
    expect(progress.memorized).toEqual(new Set([1, 2, 3]))
    expect(progress.strength.get(1)).toBe(5)
    expect(progress.strength.get(2)).toBe(3)
    expect(progress.hasanah).toBe(0) // legacy carries no hasanah equivalent

    const mistakes = await loadMistakes()
    expect(mistakes.get(3)).toEqual(new Set([1, 4, 7]))

    // Recovered pages get a decay-clock anchor even though the legacy format
    // never carried one — backfilled to today at recovery time.
    expect(progress.reviewData.get(1)?.lastReviewDate).toBeTruthy()
    expect(progress.reviewData.get(2)?.lastReviewDate).toBeTruthy()

    // The legacy database is gone afterward.
    expect(await hasLegacyData()).toBe(false)
  })

  it('merges onto existing new-app progress rather than overwriting it', async () => {
    // A user who already started fresh in the new app before finding "Recover".
    await seedLegacyDb({
      memorized: [1, 2],
      perfectRevisions: { '1': 5 },
      mistakes: {},
    })

    const { saveProgress } = await import('@/core/storage/userData')
    await saveProgress({
      memorized: new Set([2, 50]), // page 2 overlaps, page 50 is new-app-only
      strength: new Map([
        [2, 20], // higher than legacy's implicit 0 for page 2 — must survive
        [50, 8],
      ]),
      hasanah: 12_000, // must never be reset by recovery
      reviewData: new Map(),
    })

    const result = await recoverLegacyData()
    expect(result).toEqual({ status: 'recovered' })

    const progress = await loadProgress()
    // Union of both sources' memorized pages.
    expect(progress.memorized).toEqual(new Set([1, 2, 50]))
    // Legacy's real strength for page 1 (new app had none) is picked up.
    expect(progress.strength.get(1)).toBe(5)
    // Page 2's higher new-app strength (20) is never lowered by legacy's absence of it.
    expect(progress.strength.get(2)).toBe(20)
    // Page 50 (new-app only) is untouched.
    expect(progress.strength.get(50)).toBe(8)
    // Hasanah already earned in the new app is preserved, not reset to 0.
    expect(progress.hasanah).toBe(12_000)
    // Page 1 (legacy-only) gets a backfilled decay anchor.
    expect(progress.reviewData.get(1)?.lastReviewDate).toBeTruthy()
  })

  it('is a no-op the second time, once the legacy database is already gone', async () => {
    await seedLegacyDb({ memorized: [1] })
    await recoverLegacyData()
    expect(await recoverLegacyData()).toEqual({ status: 'no-data' })
  })

  it('treats a legacy db with no appData store as nothing to recover', async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(LEGACY_DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore('notes', { keyPath: 'id' })
      req.onsuccess = () => {
        req.result.close()
        resolve()
      }
      req.onerror = () => reject(req.error)
    })
    expect(await recoverLegacyData()).toEqual({ status: 'no-data' })
  })
})
