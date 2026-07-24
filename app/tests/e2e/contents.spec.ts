import { test, expect } from '@playwright/test'

test('Surah lens navigates to a surah’s page', async ({ page }) => {
  await page.goto('/contents')
  const furqan = page.getByRole('button', { name: /^Al-Furqan/ })
  await expect(furqan).toBeVisible({ timeout: 10_000 })
  await furqan.click()
  // Al-Furqan is surah 25 — the friendly URL /25 (reader resolves it to a page).
  await expect(page).toHaveURL(/\/25$/)
})

test('Juz lens navigates to a juz’s page and scrolls to its start verse', async ({ page }) => {
  await page.goto('/contents')
  await page.getByRole('radio', { name: 'Juz' }).click()
  const juz30 = page.getByRole('button', { name: /^Juz 30/ })
  await expect(juz30).toBeVisible({ timeout: 10_000 })
  await juz30.click()
  // Juz 30 starts at 78:1 — routed through the ayah friendly URL (not /page/582)
  // so the reader also scrolls to the exact line, not just the page.
  await expect(page).toHaveURL(/\/78\/1$/)
  await expect(page.locator('.word[data-verse="78:1"]').first()).toBeVisible({ timeout: 10_000 })
})

test('Page lens navigates to a page', async ({ page }) => {
  await page.goto('/contents')
  await page.getByRole('radio', { name: 'Page' }).click()
  await page.getByRole('button', { name: 'Page 42', exact: true }).click()
  await expect(page).toHaveURL(/\/page\/42$/)
})
