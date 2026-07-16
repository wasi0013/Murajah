import { test, expect } from '@playwright/test'
import { openSettings } from './helpers'

const family = (page: import('@playwright/test').Page) =>
  page.locator('.col[aria-hidden="false"] .surface').evaluate((el) => getComputedStyle(el).fontFamily)

test('tajweed toggle swaps the QPC font without reflowing the page', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  await openSettings(page)

  // Default on → coloured tajweed per-page font.
  await expect.poll(() => family(page)).toContain('tj-p')
  const wordsBefore = await page.locator('.col[aria-hidden="false"] .surface .word').count()
  const heightBefore = await page
    .locator('.col[aria-hidden="false"] .surface')
    .evaluate((el) => Math.round(el.getBoundingClientRect().height))

  await page.getByRole('switch', { name: 'Tajweed colours' }).click()

  // Off → plain uthmani per-page font; URL records the non-default toggle.
  await expect.poll(() => family(page)).toContain('qpc-p')
  await expect(page).toHaveURL(/tajweed=0/)

  // Same content → the word count is unchanged (the real no-reflow guarantee).
  // Page height may shift a little: the tajweed/uthmani per-page fonts have
  // marginally different metrics, which scale-to-fill reflects (< ~6%).
  expect(await page.locator('.col[aria-hidden="false"] .surface .word').count()).toBe(wordsBefore)
  const heightAfter = await page
    .locator('.col[aria-hidden="false"] .surface')
    .evaluate((el) => Math.round(el.getBoundingClientRect().height))
  expect(Math.abs(heightAfter - heightBefore)).toBeLessThan(heightBefore * 0.06)
})

test('tajweed legend opens from the settings sheet and lists the rules', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  await openSettings(page)

  await page.getByRole('button', { name: 'Tajweed legend' }).click()
  const legend = page.getByRole('dialog', { name: 'Tajweed legend' })
  await expect(legend).toBeVisible()
  await expect(legend.getByText('Ghunnah')).toBeVisible()
  await expect(legend.getByText('Qalqalah')).toBeVisible()

  // Turning tajweed off (also dismisses the popover) hides the legend trigger.
  await page.getByRole('switch', { name: 'Tajweed colours' }).click()
  await expect(page.getByRole('button', { name: 'Tajweed legend' })).toBeHidden()
})
