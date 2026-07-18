import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// App settings surface (Phase 9.4). Reached from the reader's "More" tab; owns
// the colour theme, which is applied to <html data-theme> and persisted to
// IndexedDB so it survives a reload.

test('the More tab opens Settings', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'More' }).click()
  const sheet = page.getByRole('dialog', { name: 'More' })
  await sheet.getByRole('button', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
})

test('choosing a theme paints the document and persists across reload', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible({
    timeout: 10_000,
  })

  const html = page.locator('html')
  await page.getByRole('radio', { name: 'Dark' }).click()
  await expect(html).toHaveAttribute('data-theme', 'dark')

  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true')
})

test('the back button returns to the reader', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible({
    timeout: 10_000,
  })
  await page.getByRole('button', { name: 'Back to reader' }).click()
  await expect(page).toHaveURL(/\/$/)
})

test('has no serious a11y violations', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible({
    timeout: 10_000,
  })
  await page.waitForTimeout(300)

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  )
  expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([])
})
