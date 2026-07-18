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

test('export then import restores state, and junk is rejected', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible({
    timeout: 10_000,
  })
  const html = page.locator('html')

  // Establish a distinctive state (Dark theme) and export it to a file.
  await page.getByRole('radio', { name: 'Dark' }).click()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export backup' }).click(),
  ])
  const file = await download.path()

  // Move state away from the backup so a restore is observable.
  await page.getByRole('radio', { name: 'Light' }).click()
  await expect(html).toHaveAttribute('data-theme', 'light')

  // Junk import: a clear error, no confirm dialog, and data left intact.
  await page.locator('input[type=file]').setInputFiles({
    name: 'junk.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{not json'),
  })
  await expect(page.getByText('This file is not valid JSON.')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Import backup' })).toHaveCount(0)
  await expect(html).toHaveAttribute('data-theme', 'light')

  // Real import: confirm the replace, then the reload restores Dark.
  await page.locator('input[type=file]').setInputFiles(file)
  await page.getByRole('button', { name: 'Replace data' }).click()
  await expect(html).toHaveAttribute('data-theme', 'dark', { timeout: 10_000 })
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
