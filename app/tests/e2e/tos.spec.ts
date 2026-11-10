import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('renders the terms and keeps the app tab bar', async ({ page }) => {
  await page.goto('/tos')
  await expect(page.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '6. No warranty' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
})

// Linked from outside (store listings), so a first-time visitor must not be
// blocked by the onboarding modal; see App.vue's NO_ONBOARDING_ROUTE_NAMES.
test.describe('first-time visitor (unseeded storage)', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('does not show the onboarding modal', async ({ page }) => {
    await page.goto('/tos')
    await expect(page.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible()
    await expect(page.locator('[role="dialog"]')).toBeHidden()
  })
})

test('has no axe violations', async ({ page }) => {
  await page.goto('/tos')
  await expect(page.locator('main.tos')).toBeVisible()
  const results = await new AxeBuilder({ page }).include('main.tos').analyze()
  expect(results.violations).toEqual([])
})
