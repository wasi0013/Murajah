import { test, expect } from '@playwright/test'

// StatsSummary.vue — the Progress Overview's redesigned summary row (icon-
// badged cards + an SVG average-strength gauge, replacing the old flat text
// grid). Visual polish (icon-in-a-circle, watermarks, the Islamic rosette)
// isn't asserted here — axe + the existing progress.spec.ts contrast scan
// cover that; this locks in the parts that carry real information.

test('the average-strength gauge reflects the real value, not a placeholder', async ({ page }) => {
  await page.goto('/progress')
  await expect(page.getByRole('button', { name: 'Page 1, not memorized' })).toBeVisible({ timeout: 10_000 })

  await page.getByLabel('From page').fill('1')
  await page.getByLabel('To page').fill('5')
  await page.getByRole('button', { name: 'Memorized', exact: true }).click()

  // Bulk-mark credits the Da'if (Weak) floor (40) to every page just marked.
  await expect(page.locator('.stat--strength .stat-n')).toHaveText('40')
  const gauge = page.locator('.stat--strength .gauge')
  await expect(gauge).toHaveAccessibleName(/40.*100.*Weak|Weak.*40.*100/s)

  // The fill's dash-offset must actually move off its 0-strength starting
  // point once there's real data — proves the gauge is wired to `stats`,
  // not a static decoration.
  const dashoffset = await page.locator('.stat--strength .gauge-fill').evaluate((el) => getComputedStyle(el).strokeDashoffset)
  const dasharray = await page.locator('.stat--strength .gauge-fill').evaluate((el) => getComputedStyle(el).strokeDasharray)
  expect(parseFloat(dashoffset)).toBeLessThan(parseFloat(dasharray))
  expect(parseFloat(dashoffset)).toBeGreaterThan(0) // 40/100 is well short of full
})

test('the pages progress bar and hasanah figure render real, live numbers', async ({ page }) => {
  await page.goto('/progress')
  await expect(page.getByRole('button', { name: 'Page 1, not memorized' })).toBeVisible({ timeout: 10_000 })

  await expect(page.locator('.stat--pages .stat-n')).toHaveText('0/604')
  await expect(page.locator('.stat--pages .bar')).toHaveAttribute('aria-valuenow', '0')

  await page.getByLabel('From page').fill('1')
  await page.getByLabel('To page').fill('10')
  await page.getByRole('button', { name: 'Memorized', exact: true }).click()

  await expect(page.locator('.stat--pages .stat-n')).toHaveText('10/604')
  await expect(page.locator('.stat--pages .bar')).toHaveAttribute('aria-valuenow', '10')
  const barWidth = await page.locator('.stat--pages .bar-fill').evaluate((el) => el.getBoundingClientRect().width)
  expect(barWidth).toBeGreaterThan(0)

  // Hasanah accrues from the bulk-mark credit (10 pages × BULK_MARK_STRENGTH),
  // proving the figure isn't a hardcoded placeholder either.
  await expect(page.locator('.stat--hasanah .stat-n')).not.toHaveText('0')
})

test('decorative graphics are hidden from assistive tech; the gauge and bars are not', async ({ page }) => {
  await page.goto('/progress')
  await expect(page.getByRole('button', { name: 'Page 1, not memorized' })).toBeVisible({ timeout: 10_000 })

  // The Islamic rosette + mosque-skyline flourish carry no unique information
  // (the "Total Hasanah" label + number already say everything) — decoration,
  // not content, so they must never be announced.
  await expect(page.locator('.stat--hasanah svg.skyline')).toHaveAttribute('aria-hidden', 'true')
  await expect(page.locator('.stat--hasanah .badge svg')).toHaveAttribute('aria-hidden', 'true')

  // Same for the reading/listening/mistakes cards' symbolic graphics — fixed
  // decorative shapes (see StatsSummary.vue's doc comment), not real trend
  // data, so they must never be announced either.
  await expect(page.locator('.stat--reading svg.decor')).toHaveAttribute('aria-hidden', 'true')
  await expect(page.locator('.stat--listening svg.decor')).toHaveAttribute('aria-hidden', 'true')
  await expect(page.locator('.stat--mistakes svg.decor')).toHaveAttribute('aria-hidden', 'true')

  // But the two elements that DO carry unique information are real,
  // accessible controls/graphics, not decoration.
  await expect(page.locator('.stat--pages .bar')).toHaveAttribute('role', 'progressbar')
  await expect(page.locator('.stat--strength .gauge')).toHaveAttribute('role', 'img')
  await expect(page.locator('.stat--strength .gauge')).toHaveAccessibleName(/.+/)
})

test('disabling a progress-tracking toggle hides its card here, and only that card', async ({
  page,
}) => {
  // Settings toggles (settings.spec.ts) gate accrual in the store and, per
  // this test, also hide the corresponding card — immediate visual proof the
  // setting took effect, rather than a frozen number that just stops moving.
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('switch', { name: 'Total Hasanah' }).click()
  await page.waitForTimeout(300) // let the fire-and-forget pref write commit

  await page.goto('/progress')
  await expect(page.getByRole('button', { name: 'Page 1, not memorized' })).toBeVisible({ timeout: 10_000 })

  await expect(page.locator('.stat--hasanah')).toHaveCount(0)
  // Every other card — including the two never gated by this feature — stays put.
  await expect(page.locator('.stat--pages')).toBeVisible()
  await expect(page.locator('.stat--reading')).toBeVisible()
  await expect(page.locator('.stat--listening')).toBeVisible()
  await expect(page.locator('.stat--mistakes')).toBeVisible()
  await expect(page.locator('.stat--strength')).toBeVisible()
})
