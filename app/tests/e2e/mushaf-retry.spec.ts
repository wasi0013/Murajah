import { test, expect } from '@playwright/test'

// Regression (iOS): a mushaf page image that came back truncated showed "tap to
// retry", but retry re-read the same poisoned cache and failed identically. An
// empty/partial blob is now rejected (never cached as ready), and retry forces a
// fresh fetch past both caches — so a transient bad image recovers.
test('a bad mushaf image recovers on retry', async ({ page }) => {
  let served = 0
  await page.route('**/img/mushaf/50.webp', async (route) => {
    served += 1
    // First load: a 200 with an empty body (a truncated response). Later loads
    // (the forced retry) get the real image.
    if (served === 1) await route.fulfill({ status: 200, contentType: 'image/webp', body: '' })
    else await route.continue()
  })

  await page.goto('/mushaf/50')

  const retry = page.getByRole('button', { name: /load page 50/i })
  await expect(retry).toBeVisible({ timeout: 10_000 })
  await retry.click()

  // The retry force-refetched a valid image — the page renders.
  await expect(page.locator('.page-img').first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: /load page 50/i })).toBeHidden()
  expect(served).toBeGreaterThanOrEqual(2)
})

test('a transient mushaf image failure auto-recovers without a manual tap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }) // mobile: a single page
  let served = 0
  await page.route('**/img/mushaf/60.webp', async (route) => {
    served += 1
    // Fail the first fetch (a fast-swipe transient); auto-retry gets the image.
    if (served === 1) await route.fulfill({ status: 200, contentType: 'image/webp', body: '' })
    else await route.continue()
  })

  await page.goto('/mushaf/60')

  // The image fails first, so the retry control shows…
  await expect(page.getByRole('button', { name: /load page 60/i })).toBeVisible({ timeout: 10_000 })
  // …then auto-retry force-refetches and it recovers — no user interaction.
  await expect(page.getByRole('button', { name: /load page 60/i })).toBeHidden({ timeout: 10_000 })
  await expect(page.locator('.page-img')).toBeVisible()
  expect(served).toBeGreaterThanOrEqual(2)
})
