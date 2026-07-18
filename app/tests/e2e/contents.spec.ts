import { test, expect } from '@playwright/test'

test('Surah lens navigates to a surah’s page', async ({ page }) => {
  await page.goto('/contents')
  const furqan = page.getByRole('button', { name: /^Al-Furqan/ })
  await expect(furqan).toBeVisible({ timeout: 10_000 })
  await furqan.click()
  // Al-Furqan (surah 25) starts on QPC page 359.
  await expect(page).toHaveURL(/\/read\/qpc\/359(\?|$)/)
})

test('Juz lens navigates to a juz’s page', async ({ page }) => {
  await page.goto('/contents')
  await page.getByRole('radio', { name: 'Juz' }).click()
  const juz30 = page.getByRole('button', { name: /^Juz 30/ })
  await expect(juz30).toBeVisible({ timeout: 10_000 })
  await juz30.click()
  // Juz 30 opens on QPC page 582.
  await expect(page).toHaveURL(/\/read\/qpc\/582(\?|$)/)
})

test('Page lens navigates to a page', async ({ page }) => {
  await page.goto('/contents')
  await page.getByRole('radio', { name: 'Page' }).click()
  await page.getByRole('button', { name: 'Page 42', exact: true }).click()
  await expect(page).toHaveURL(/\/read\/qpc\/42(\?|$)/)
})
