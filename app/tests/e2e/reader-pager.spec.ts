import { test, expect } from '@playwright/test'

const fontSizePx = (page: import('@playwright/test').Page) =>
  page.locator('.col[aria-hidden="false"] .surface').evaluate(
    (el) => parseFloat(getComputedStyle(el).fontSize),
  )

test('pager mounts at most 3 pages and pages forward', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })

  // Windowed: three fixed slots, never more than three mounted surfaces.
  await expect(page.locator('.track > .col')).toHaveCount(3)
  expect(await page.locator('.surface').count()).toBeLessThanOrEqual(3)

  await expect(page.getByText('Page 1 / 604')).toBeVisible()

  // Next advances the page + reflects in the URL (route sync).
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page.getByText('Page 2 / 604')).toBeVisible()
  await expect(page).toHaveURL(/\/read\/qpc\/2/)
  await expect(page.locator('.surface .word').first()).not.toBeEmpty()
})

test('text-size slider resizes the reading surface', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })

  const before = await fontSizePx(page)
  const slider = page.getByRole('slider', { name: 'Text size' })
  await slider.focus()
  await slider.press('ArrowRight')
  await expect.poll(() => fontSizePx(page)).toBeGreaterThan(before)
})
