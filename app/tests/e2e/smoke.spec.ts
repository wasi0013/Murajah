import { test, expect } from '@playwright/test'

test('app shell loads and reader route renders', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Murajah/)
  await expect(page.getByRole('heading', { name: 'Murajah' })).toBeVisible()
})

test('theme toggle switches the document theme', async ({ page }) => {
  await page.goto('/')
  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: /Theme:/ }).click()
  await expect(html).toHaveAttribute('data-theme', 'dark')
})
