import { test, expect } from '@playwright/test'

// Phase 10.5 — offline download manager UI. Doesn't wait for a full 604-page
// download (slow, not the point) — proves the interaction: starting shows
// progress, cancel stops it and offers resume, and at least a few real pages
// actually land in the persistent cache (so "resumable" isn't just UI state).

test('text pack: start shows progress, cancel offers resume, some pages are actually cached', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible({ timeout: 10_000 })

  const startButton = page.getByRole('button', { name: 'Download text' })
  await expect(startButton).toBeVisible()
  await startButton.click()

  // Progress text appears and advances past 0.
  const progress = page.getByText(/\d+ \/ 604 pages/)
  await expect(progress).toBeVisible()
  await expect
    .poll(async () => {
      const text = await progress.textContent()
      return Number(text?.match(/(\d+) \//)?.[1] ?? 0)
    }, { timeout: 10_000 })
    .toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('button', { name: 'Canceled — tap to resume' })).toBeVisible()

  // The pages fetched before cancel are genuinely persisted, not just counted.
  const cachedCount = await page.evaluate(async () => {
    const req = indexedDB.open('murajah-assets')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const tx = db.transaction('assets', 'readonly')
    const count = await new Promise<number>((resolve, reject) => {
      const r = tx.objectStore('assets').count()
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    db.close()
    return count
  })
  expect(cachedCount).toBeGreaterThan(0)
})

test('images pack is a separate, independent opt-in', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible({ timeout: 10_000 })

  await expect(page.getByRole('button', { name: 'Download images' })).toBeVisible()
  await page.getByRole('button', { name: 'Download images' }).click()
  await expect(page.getByText(/\d+ \/ 604 pages/)).toBeVisible()
  // Starting images must not also start (or count as) the text pack.
  await expect(page.getByRole('button', { name: 'Download text' })).toBeVisible()
})
