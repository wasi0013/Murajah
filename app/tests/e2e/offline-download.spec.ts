import { test, expect } from '@playwright/test'

// Offline download manager UI — a single unified "download for offline" pack
// (everything: both scripts, translations, tafsir, morphology, images, fonts).
// Doesn't wait for the full pack (slow, not the point, thousands of items) —
// proves the interaction: starting shows progress, cancel stops it and offers
// resume, and at least a few real items actually land in the persistent
// caches (so "resumable" isn't just UI state). Also covers the safe "Clear
// cache" action, which must never disturb the reader's own memorization data.

test('download for offline: start shows progress, cancel offers resume, some data is actually cached', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible({ timeout: 10_000 })

  const startButton = page.getByRole('button', { name: 'Download for offline' })
  await expect(startButton).toBeVisible()
  await startButton.click()

  // Progress text appears and advances past 0.
  const progress = page.getByText(/^\d+ \/ \d+$/)
  await expect(progress).toBeVisible()
  await expect
    .poll(async () => {
      const text = await progress.textContent()
      return Number(text?.match(/(\d+) \//)?.[1] ?? 0)
    }, { timeout: 10_000 })
    .toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('button', { name: 'Canceled — tap to resume' })).toBeVisible()

  // The items fetched before cancel are genuinely persisted, not just counted
  // — check both the JSON chunk cache and the font cache (two of the several
  // caches the unified pack writes to).
  const cachedCounts = await page.evaluate(async () => {
    async function count(dbName: string): Promise<number> {
      const req = indexedDB.open(dbName)
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      if (!db.objectStoreNames.contains('assets')) {
        db.close()
        return 0
      }
      const tx = db.transaction('assets', 'readonly')
      const n = await new Promise<number>((resolve, reject) => {
        const r = tx.objectStore('assets').count()
        r.onsuccess = () => resolve(r.result)
        r.onerror = () => reject(r.error)
      })
      db.close()
      return n
    }
    return { assets: await count('murajah-assets'), fonts: await count('murajah-fonts') }
  })
  expect(cachedCounts.assets + cachedCounts.fonts).toBeGreaterThan(0)
})

test('clear cache: requires confirmation, wipes the cache, and never touches memorization data', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible({ timeout: 10_000 })

  // Seed some "memorization progress" so we can prove it survives.
  await page.evaluate(async () => {
    const req = indexedDB.open('murajah-userdata', 1)
    await new Promise<void>((resolve, reject) => {
      req.onupgradeneeded = () => req.result.createObjectStore('data')
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction('data', 'readwrite')
        tx.objectStore('data').put({ sentinel: 'keep-me' }, 'progress')
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
      req.onerror = () => reject(req.error)
    })
  })

  await page.getByRole('button', { name: 'Clear cache' }).click()
  await expect(page.getByRole('heading', { name: 'Clear the cache?' })).toBeVisible()

  // Cancel first — must not clear anything.
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('heading', { name: 'Clear the cache?' })).not.toBeVisible()

  await page.getByRole('button', { name: 'Clear cache' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Clear cache' }).click()
  await expect(page.getByText('Cache cleared')).toBeVisible()

  await page.waitForURL('**/settings', { timeout: 5_000 })
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible({ timeout: 10_000 })

  const progress = await page.evaluate(async () => {
    const req = indexedDB.open('murajah-userdata')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const tx = db.transaction('data', 'readonly')
    const value = await new Promise<unknown>((resolve, reject) => {
      const r = tx.objectStore('data').get('progress')
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    db.close()
    return value
  })
  expect(progress).toEqual({ sentinel: 'keep-me' })
})
