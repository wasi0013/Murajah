import { test, expect } from '@playwright/test'

test('app shell loads and the reader renders', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Murajah/)
  // The reader control toolbar and the reading surface both mount.
  await expect(page.getByRole('toolbar', { name: 'Reader controls' })).toBeVisible()
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
})

test('theme applies and can switch (via gallery control)', async ({ page }) => {
  await page.goto('/')
  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-theme', 'light')

  // Theme switching UI lives in the gallery until the reader chrome lands (3.10).
  await page.goto('/gallery')
  await page.getByRole('button', { name: 'dark', exact: true }).click()
  await expect(html).toHaveAttribute('data-theme', 'dark')
})
