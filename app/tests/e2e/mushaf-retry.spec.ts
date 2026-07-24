import { test, expect } from '@playwright/test'

// Regression (iOS): a mushaf page image that came back truncated showed "tap to
// retry", but retry re-read the same poisoned cache and failed identically, and
// on a fast swipe the failures never recovered on their own. Now: empty/partial
// blobs are rejected (never cached), a transient failure auto-retries, and the
// manual retry force-refetches past both caches.

test('a transient mushaf image failure auto-recovers without a manual tap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }) // mobile: a single page
  let served = 0
  await page.route('**/img/mushaf/60.webp', async (route) => {
    served += 1
    // Fail only the first fetch (a fast-swipe transient); auto-retry gets it.
    if (served === 1) await route.fulfill({ status: 200, contentType: 'image/webp', body: '' })
    else await route.continue()
  })

  await page.goto('/mushaf/60')

  // No user interaction — the page recovers on its own via auto-retry.
  await expect(page.getByRole('button', { name: /load page 60/i })).toBeHidden({ timeout: 10_000 })
  await expect(page.locator('.page-img')).toBeVisible()
})

test('a persistently-failing image recovers when the user taps retry', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }) // mobile: a single page
  let broken = true
  await page.route('**/img/mushaf/50.webp', async (route) => {
    if (broken) await route.fulfill({ status: 200, contentType: 'image/webp', body: '' })
    else await route.continue()
  })

  await page.goto('/mushaf/50')

  // Every fetch fails, so auto-retries exhaust and the manual control persists.
  const retry = page.getByRole('button', { name: /load page 50/i })
  await expect(retry).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(1600) // let the auto-retry backoffs run out
  await expect(retry).toBeVisible()

  // The source recovers; a manual retry force-refetches and the page renders.
  broken = false
  await retry.click()
  await expect(page.locator('.page-img')).toBeVisible({ timeout: 10_000 })
  await expect(retry).toBeHidden()
})
