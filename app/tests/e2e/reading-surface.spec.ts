import { test, expect } from '@playwright/test'

const SHOT = '/private/tmp/claude-501/-Volumes-Main-personal-projects-Murajah/e4aa36f0-35bb-43c9-b51b-f93ff28e231f/scratchpad'

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
