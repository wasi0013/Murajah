import { test, expect } from '@playwright/test'

/** surah:ayah of the first word on the visible page (layout-independent). */
async function topAyah(page: import('@playwright/test').Page): Promise<string> {
  const loc = await page
    .locator('.col[aria-hidden="false"] .surface .word')
    .first()
    .getAttribute('data-loc')
  return loc!.split(':').slice(0, 2).join(':')
}

test('switching to Indopak keeps the ayah and swaps the font', async ({ page }) => {
  await page.goto('/read/qpc/50') // mid Al-Baqarah — layouts diverge here
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })

  const ayahBefore = await topAyah(page)
  const qpcFamily = await page
    .locator('.col[aria-hidden="false"] .surface')
    .evaluate((el) => getComputedStyle(el).fontFamily)

  await page.getByRole('radio', { name: 'Indopak' }).click()

  // Lands on an Indopak page showing the same ayah (page number differs).
  await expect(page).toHaveURL(/\/read\/indopak\/\d+/)
  await expect.poll(() => topAyah(page)).toBe(ayahBefore)

  const indopakFamily = await page
    .locator('.col[aria-hidden="false"] .surface')
    .evaluate((el) => getComputedStyle(el).fontFamily)
  expect(indopakFamily).not.toBe(qpcFamily) // per-page QPC glyph font → Indopak
})

test('tajweed control is hidden on Indopak, shown on Uthmani', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })

  const tajweed = page.getByRole('switch', { name: 'Tajweed colours' })
  await expect(tajweed).toBeVisible() // QPC default

  await page.getByRole('radio', { name: 'Indopak' }).click()
  await expect(tajweed).toBeHidden()

  await page.getByRole('radio', { name: 'Uthmani' }).click()
  await expect(tajweed).toBeVisible()
})

test('Indopak keeps 15 lines fitted to width on a phone (no overflow)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/read/indopak/3')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })

  const surface = page.locator('.col[aria-hidden="false"] .surface')
  await expect(surface.locator('.line-ayah')).toHaveCount(15)
  // Shrink-to-fit keeps every line within the column — no horizontal overflow.
  await expect
    .poll(() => surface.evaluate((el) => (el as HTMLElement).scrollWidth - (el as HTMLElement).clientWidth))
    .toBeLessThanOrEqual(1)
})
