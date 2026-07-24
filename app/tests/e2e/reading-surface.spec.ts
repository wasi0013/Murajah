import { test, expect } from '@playwright/test'

// Diagnostic screenshots land in the gitignored Playwright output dir. Must be
// repo-relative — an absolute machine-specific path is unwritable in CI and
// fails the run (Playwright creates parent dirs for this path automatically).
const SHOT = 'test-results/screenshots'

test('reading surface renders real page 1 with QPC + tajweed fonts', async ({ page }) => {
  await page.goto('/gallery')

  const surface = page.locator('.surface')
  await expect(surface).toBeVisible({ timeout: 10_000 })
  // Page 1 = Al-Fatiha: surah header + several ayah lines with words.
  await expect(surface.locator('.line-ayah').first()).toBeVisible()
  await expect(surface.locator('.word').first()).not.toBeEmpty()

  // Word states applied at known locations.
  await expect(page.locator('.state-mistake')).toHaveCount(1)

  // Tajweed on (default) — capture the real coloured tajweed font.
  await page.locator('.surface').scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${SHOT}/surface-tajweed.png` })

  // Tajweed off — uthmani QPC font.
  await page
    .getByRole('heading', { name: 'Reading surface — page 1' })
    .locator('..')
    .getByRole('switch')
    .click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${SHOT}/surface-uthmani.png` })
})
