import { test, expect } from '@playwright/test'

// Phase 9.1 — human-friendly reader URLs. /:surah and /page/N are entry points that
// render the reader in the user's own script; the surah/ayah/slug forms stay sticky
// in the address bar, page navigation normalises to the canonical /read form.

test('/:surah opens that surah and keeps the friendly URL', async ({ page }) => {
  await page.goto('/2') // Al-Baqarah starts on QPC page 2
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  await expect(page).toHaveURL(/\/2$/)
  await expect(page.getByText(/Page 2 \//)).toBeVisible()
})

test('/114 opens An-Nas (last surah)', async ({ page }) => {
  await page.goto('/114')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  await expect(page).toHaveURL(/\/114$/)
  await expect(page.getByText(/Page 604 \//)).toBeVisible()
})

test('/page/:page opens that page', async ({ page }) => {
  await page.goto('/page/50')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  await expect(page).toHaveURL(/\/page\/50$/)
  await expect(page.getByText(/Page 50 \//)).toBeVisible()
})

test('a name-slug opens the surah', async ({ page }) => {
  await page.goto('/al-fatihah')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  await expect(page).toHaveURL(/\/al-fatihah$/)
  await expect(page.getByText(/Page 1 \//)).toBeVisible()
})

test('/:surah/:ayah lands on the ayah’s page with the verse present', async ({ page }) => {
  await page.goto('/2/255') // Ayat al-Kursi → QPC page 42
  await expect(page).toHaveURL(/\/2\/255$/)
  await expect(page.locator('.word[data-verse="2:255"]').first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/Page 42 \//)).toBeVisible()
})

test('paging off a surah URL normalises to the canonical form', async ({ page }) => {
  await page.goto('/2')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Next page', exact: true }).click()
  await expect(page).toHaveURL(/\/read\/qpc\/3$/)
})

test('a word-route is not swallowed by the surah param', async ({ page }) => {
  await page.goto('/today')
  await expect(page).toHaveURL(/\/today$/)
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
})

test('an out-of-range surah redirects to the reader home', async ({ page }) => {
  await page.goto('/999')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  await expect(page).not.toHaveURL(/999/)
})
