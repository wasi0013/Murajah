import { test, expect } from '@playwright/test'

test('keyboard: arrows are RTL-aware', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })

  await page.keyboard.press('ArrowLeft') // RTL → next
  await expect(page.getByText('Page 2 / 604')).toBeVisible()
  await page.keyboard.press('ArrowRight') // RTL → previous
  await expect(page.getByText('Page 1 / 604')).toBeVisible()
})

test('indicator shows juz and surah name', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  // Page 1 is Juz 1 / Al-Fatiha — juz fills in once the nav index loads.
  await expect(page.locator('.page-meta')).toContainText('Juz 1', { timeout: 10_000 })
})
