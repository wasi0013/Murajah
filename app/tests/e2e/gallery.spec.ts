import { test, expect } from '@playwright/test'

const SHOT = '/private/tmp/claude-501/-Volumes-Main-personal-projects-Murajah/e4aa36f0-35bb-43c9-b51b-f93ff28e231f/scratchpad'

test('gallery renders and switches themes', async ({ page }) => {
  await page.goto('/gallery')
  await expect(page.getByRole('heading', { name: 'Color roles' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Primary' })).toBeVisible()

  // Light
  await page.getByRole('button', { name: 'light', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.screenshot({ path: `${SHOT}/gallery-light.png`, fullPage: true })

  // Dark (wait for the color transition to settle before shooting)
  await page.getByRole('button', { name: 'dark', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${SHOT}/gallery-dark.png`, fullPage: true })

  // The settled primary button background is the dark accent (amber), proving
  // the earlier olive look was just a mid-transition artifact.
  const primaryBg = await page
    .getByRole('button', { name: 'Primary' })
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(primaryBg).toBe('rgb(226, 164, 75)') // #e2a44b

  // Sepia
  await page.getByRole('button', { name: 'sepia', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia')
  await page.screenshot({ path: `${SHOT}/gallery-sepia.png`, fullPage: true })
})
