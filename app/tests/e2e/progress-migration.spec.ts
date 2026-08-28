import { test, expect, type Page } from '@playwright/test'

// Migration render parity (Phase 4.10.1, browser side). Seeds IndexedDB with the
// on-disk shape a migrated legacy backup produces (memorized pages, perfect
// revisions = strength, a cumulative hasanah, word-level mistakes), reloads, and
// asserts the Progress view renders it faithfully. The exact hasanah = Σ×strength
// arithmetic is proven by the migration-parity integration test; here we verify
// the persisted counter + memorized cells + mistake flags actually render.

const HASANAH = 123456

// The migrated on-disk records (murajah-userdata → store "data").
const STORED_PROGRESS = {
  memorized: [1, 2, 3, 50, 604],
  perfectRevisions: { '1': 5, '2': 3, '604': 12 },
  hasanah: HASANAH,
  reviewData: {},
}
const STORED_MISTAKES = { '3': [1, 4, 7], '50': [2] }

async function seedUserData(page: Page) {
  await page.evaluate(
    ({ progress, mistakes }) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('murajah-userdata', 1)
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains('data')) req.result.createObjectStore('data')
        }
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction('data', 'readwrite')
          tx.objectStore('data').put(progress, 'progress')
          tx.objectStore('data').put(mistakes, 'mistakes')
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        }
      }),
    { progress: STORED_PROGRESS, mistakes: STORED_MISTAKES },
  )
}

const hasanah = (page: Page) => page.locator('.stat', { hasText: 'Hasanah' }).locator('.stat-n')

test('a migrated backup renders identical memorized pages, hasanah and mistakes', async ({
  page,
}) => {
  // Boot once so the app creates the DB, then seed the migrated records and reload
  // so hydration reads them.
  await page.goto('/progress')
  await expect(page.getByRole('button', { name: 'Page 1, not memorized' })).toBeVisible({
    timeout: 10_000,
  })
  await seedUserData(page)
  await page.reload()

  // Seeded hasanah counter renders (formatted).
  await expect(hasanah(page)).toHaveText('123,456', { timeout: 10_000 })

  // Every migrated memorized page shows memorized.
  for (const p of STORED_PROGRESS.memorized) {
    await expect(page.getByRole('button', { name: new RegExp(`^Page ${p}, memorized`) })).toBeVisible()
  }

  // Mistake pages carry the mistake count in their label (a non-colour cue).
  // Pages 3 and 50 are memorized but have no `perfectRevisions` entry at all
  // (legacy imports predate that counter for pages never formally revised) —
  // the storage-layer backfill floors those to Da'if ("Weak") on this load
  // rather than leaving them at raw 0, which used to render "Not Memorized"
  // despite being memorized (see strengthBands.ts's `effectiveRank`).
  await expect(page.getByRole('button', { name: 'Page 3, memorized, Weak (ضعيف), 3 mistakes' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Page 50, memorized, Weak (ضعيف), 1 mistakes' })).toBeVisible()

  // Summary stats reflect the migrated set: 5 memorized, 2 pages with mistakes.
  await expect(page.locator('.stat', { hasText: 'Pages ·' }).locator('.stat-n')).toHaveText('5/604')
  await expect(page.locator('.stat', { hasText: 'mistakes' }).locator('.stat-n')).toHaveText('2')
})
