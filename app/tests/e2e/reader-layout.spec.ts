import { test, expect } from '@playwright/test'
import { openSettings } from './helpers'

/** surah:ayah of the first word on the visible page (layout-independent). */
async function topAyah(page: import('@playwright/test').Page): Promise<string> {
  const loc = await page
    .locator('.surface .word')
    .first()
    .getAttribute('data-loc')
  return loc!.split(':').slice(0, 2).join(':')
}

test('switching to Indopak keeps the ayah and swaps the font', async ({ page }) => {
  await page.goto('/read/qpc/50') // mid Al-Baqarah — layouts diverge here
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })

  const ayahBefore = await topAyah(page)
  const qpcFamily = await page
    .locator('.surface')
    .evaluate((el) => getComputedStyle(el).fontFamily)

  await openSettings(page)
  await page.getByRole('radio', { name: 'Indopak' }).click()

  // Lands on an Indopak page showing the same ayah (page number differs).
  await expect(page).toHaveURL(/\/read\/indopak\/\d+/)
  await expect.poll(() => topAyah(page)).toBe(ayahBefore)

  const indopakFamily = await page
    .locator('.surface')
    .evaluate((el) => getComputedStyle(el).fontFamily)
  expect(indopakFamily).not.toBe(qpcFamily) // per-page QPC glyph font → Indopak
})

test('tajweed control is hidden on Indopak, shown on Uthmani', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  await openSettings(page)

  const tajweed = page.getByRole('switch', { name: 'Tajweed colours' })
  await expect(tajweed).toBeVisible() // QPC default

  await page.getByRole('radio', { name: 'Indopak' }).click()
  await expect(tajweed).toBeHidden()

  await page.getByRole('radio', { name: 'Uthmani' }).click()
  await expect(tajweed).toBeVisible()
})

test('Indopak shows exactly 15 mushaf lines, each justified to fill the width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/read/indopak/22') // a full 15-line page (Al-Baqarah)
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })

  const surface = page.locator('.surface')
  await expect(surface.locator('.line-ayah')).toHaveCount(15)
  // No horizontal overflow, and every line fills the column edge-to-edge
  // (scale-to-fill justification) — the minimum line-fill is ~100%.
  const stats = await surface.evaluate((s) => {
    const el = s as HTMLElement
    const rows = Array.from(s.querySelectorAll('.line-ayah')) as HTMLElement[]
    const fills = rows.map((r) => {
      let min = Infinity
      let max = -Infinity
      for (const w of Array.from(r.children)) {
        const b = w.getBoundingClientRect()
        min = Math.min(min, b.left)
        max = Math.max(max, b.right)
      }
      return (max - min) / r.clientWidth
    })
    return { overflow: el.scrollWidth - el.clientWidth, minFill: Math.min(...fills) }
  })
  expect(stats.overflow).toBeLessThanOrEqual(1)
  expect(stats.minFill).toBeGreaterThan(0.97)

  // Words (incl. tokens with a trailing waqf mark after a space) never wrap, so
  // the mark can't detach onto its own row — guard against that regression.
  const noWrap = await surface
    .locator('.arabic')
    .first()
    .evaluate((el) => getComputedStyle(el).whiteSpace)
  expect(noWrap).toBe('nowrap')
})
