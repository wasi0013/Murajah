import { test, expect } from '@playwright/test'

// On a reload, the page chunk must be served from the IndexedDB AssetCache in
// the worker — proven by the absence of a network request for it the 2nd time.
test('page chunk is served from IndexedDB on reload (no re-fetch)', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('page-status')).toHaveText(/page 1 · \d+ words/, { timeout: 10_000 })

  const secondLoad: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/data/qpc/pages/1.json')) secondLoad.push(r.url())
  })

  await page.reload()
  await expect(page.getByTestId('page-status')).toHaveText(/page 1 · \d+ words/, { timeout: 10_000 })

  // The chunk was cached in IndexedDB on the first visit, so the reload serves
  // it from cache — no network request for page 1's JSON.
  expect(secondLoad).toEqual([])
})
