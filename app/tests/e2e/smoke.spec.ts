import { test, expect } from '@playwright/test'

test('app shell loads and the reader renders', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Murajah/)
  // The reader chrome (settings entry + primary tab bar) and the surface mount.
  await expect(page.getByRole('button', { name: 'Reader settings' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
})

test('theme applies and can switch (via settings)', async ({ page }) => {
  await page.goto('/')
  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-theme', 'sepia')

  await page.goto('/settings')
  await page.getByRole('radio', { name: 'Dark' }).click()
  await expect(html).toHaveAttribute('data-theme', 'dark')
})
