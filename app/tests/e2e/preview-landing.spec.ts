import { test, expect } from '@playwright/test'

/**
 * `/preview` (no params): the beginner-friendly tutorial and link-builder
 * landing page for the shareable verse-range viewer (see preview.spec.ts for
 * the actual `/preview/:surah/:ayah` link it builds).
 */

test('shows the tutorial and has no shell chrome', async ({ page }) => {
  await page.goto('/preview')
  await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible()
  await expect(page.getByText('Select your verses')).toBeVisible()
  await expect(page.getByText('Choose a color and mark words')).toBeVisible()
  await expect(page.locator('.shell-tabbar')).toHaveCount(0)
})

test('the throwaway demo lets a visitor paint and unpaint a word, unsaved', async ({ page }) => {
  await page.goto('/preview')
  const bar = page.getByRole('radiogroup', { name: 'Highlight color' })
  await expect(bar).toBeVisible()
  await expect(bar.getByRole('radio', { name: 'Red' })).toHaveAttribute('aria-checked', 'true')

  const firstWord = page.locator('.demo-word').first()
  await expect(firstWord).not.toHaveClass(/demo-word-marked/)
  await firstWord.click()
  await expect(firstWord).toHaveClass(/demo-word-marked/)
  await firstWord.click()
  await expect(firstWord).not.toHaveClass(/demo-word-marked/)

  // Switching color and reloading never persists anything. It is local-only.
  await bar.getByRole('radio', { name: 'Blue' }).click()
  await firstWord.click()
  await expect(firstWord).toHaveClass(/demo-word-marked/)
  await page.reload()
  await expect(page.locator('.demo-word').first()).not.toHaveClass(/demo-word-marked/)
})

test('the example link opens a real, already-highlighted preview', async ({ page }) => {
  await page.goto('/preview')
  await page.getByRole('link', { name: 'View a live example' }).click()
  await expect(page).toHaveURL(/\/preview\/1\/1-7\?red=1&blue=4/)
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
})

test('warns that a very long passage may be too big to preview', async ({ page }) => {
  await page.goto('/preview')
  await expect(page.getByText('Extremely long passages may be too large to open smoothly in the preview.')).toBeVisible()
})

test('the dropdowns build and open a single-verse preview link', async ({ page }) => {
  await page.goto('/preview')
  await page.getByLabel('Surah').selectOption('2')
  await page.getByLabel('From ayah').selectOption('255')
  await page.getByLabel('To ayah').selectOption('255')
  await page.getByRole('button', { name: 'Open preview' }).click()

  await expect(page).toHaveURL('/preview/2/255')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
})

test('the dropdowns build and open a multi-verse range link', async ({ page }) => {
  await page.goto('/preview')
  await page.getByLabel('Surah').selectOption('1')
  await page.getByLabel('From ayah').selectOption('2')
  await page.getByLabel('To ayah').selectOption('4')
  await page.getByRole('button', { name: 'Open preview' }).click()

  await expect(page).toHaveURL('/preview/1/2-4')
})

test('changing the surah resets an ayah range that would no longer be valid', async ({ page }) => {
  await page.goto('/preview')
  const fromSelect = page.getByLabel('From ayah')
  await page.getByLabel('Surah').selectOption('2') // Al-Baqarah has 286 ayahs, so 20 is valid here.
  await fromSelect.selectOption('20')
  await page.getByLabel('Surah').selectOption('1') // Al-Fatihah has only 7 ayahs, so 20 is no longer valid.
  await expect(fromSelect).toHaveValue('1')
  await expect(page.getByLabel('To ayah')).toHaveValue('1')
})

test('the back link returns home', async ({ page }) => {
  await page.goto('/preview')
  await page.getByRole('link', { name: 'Back to home' }).click()
  await expect(page).toHaveURL('/')
})

test.describe('fresh visitor (no saved prefs)', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('is not blocked by onboarding', async ({ page }) => {
    await page.goto('/preview')
    await expect(page.getByRole('dialog', { name: 'Choose your language' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible()
  })
})
