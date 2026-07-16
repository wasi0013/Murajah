import { test, expect } from '@playwright/test'

const SHOT = '/private/tmp/claude-501/-Volumes-Main-personal-projects-Murajah/e4aa36f0-35bb-43c9-b51b-f93ff28e231f/scratchpad'

test('gallery renders and switches themes', async ({ page }) => {
  await page.goto('/gallery')
  await expect(page.getByRole('heading', { name: 'Color roles' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Primary' })).toBeVisible()

  const settle = () => page.waitForTimeout(400)
  const primaryBg = () =>
    page.getByRole('button', { name: 'Primary' }).evaluate((el) => getComputedStyle(el).backgroundColor)

  // Light (pine accent)
  await page.getByRole('button', { name: 'light', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await settle()
  expect(await primaryBg()).toBe('rgb(15, 95, 87)') // #0f5f57
  await page.screenshot({ path: `${SHOT}/gallery-light.png`, fullPage: true })

  // Dark (amber accent)
  await page.getByRole('button', { name: 'dark', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await settle()
  expect(await primaryBg()).toBe('rgb(226, 164, 75)') // #e2a44b
  await page.screenshot({ path: `${SHOT}/gallery-dark.png`, fullPage: true })

  // Sepia (pine accent again)
  await page.getByRole('button', { name: 'sepia', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia')
  await settle()
  expect(await primaryBg()).toBe('rgb(15, 95, 87)') // #0f5f57
  await page.screenshot({ path: `${SHOT}/gallery-sepia.png`, fullPage: true })
})
