import { test, expect } from '@playwright/test'

test('quick-jump resolves ayah / surah name / page to the right page', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })

  const openJump = () => page.getByRole('button', { name: 'Go to page, ayah or surah' }).click()
  const input = page.getByRole('textbox', { name: 'Quick jump' })

  await openJump()
  await input.fill('2:255') // Ayat al-Kursi → QPC page 42
  await input.press('Enter')
  await expect(page).toHaveURL(/\/read\/qpc\/42(\?|$)/)

  await openJump()
  await input.fill('baqarah') // surah name → surah 2 starts on page 2
  await input.press('Enter')
  await expect(page).toHaveURL(/\/read\/qpc\/2(\?|$)/)

  await openJump()
  await input.fill('page 300')
  await input.press('Enter')
  await expect(page).toHaveURL(/\/read\/qpc\/300(\?|$)/)

  // An unresolvable name doesn't navigate.
  await openJump()
  await input.fill('zzzznotasurah')
  await input.press('Enter')
  await expect(page).toHaveURL(/\/read\/qpc\/300(\?|$)/) // unchanged
})

test('the Surahs tab opens the Contents browser', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()

  await page.getByRole('button', { name: 'Surahs' }).click()
  await expect(page).toHaveURL(/\/contents/)
  await expect(page.getByRole('button', { name: /^Al-Fatihah/ })).toBeVisible({ timeout: 10_000 })
})

test('the More tab opens a menu with the live recitation entry', async ({ page }) => {
  // "More" is a mobile-only affordance — desktop unpacks it as an inline rail tab.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'More' }).click()
  await expect(page.getByRole('button', { name: /Live recitation/ })).toBeVisible()
})

test('reader feature flag off shows the disabled placeholder', async ({ page }) => {
  // Default is on (covered by every other test); the localStorage override flips it off.
  await page.addInitScript(() => localStorage.setItem('murajah:reader', 'off'))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Reader not available' })).toBeVisible()
  await expect(page).toHaveURL(/\/disabled/)

  await page.goto('/read/qpc/42') // deep-links are gated too
  await expect(page).toHaveURL(/\/disabled/)
})
