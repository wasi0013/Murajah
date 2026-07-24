import { test, expect } from '@playwright/test'

// Every route is a lazy chunk. If one fails to load, the navigation must not die
// silently (the tap looking dead was the reported "routing is broken" symptom) —
// the router recovers with a one-shot full navigation, then surfaces a toast.

test('a failing route chunk surfaces an error instead of a silent dead tap', async ({ page }) => {
  // Fail every attempt to load the Contents route chunk (initial + the recovery
  // reload), so we exercise the "give up and tell the user" path.
  await page.route(/ContentsView-.*\.js/, (r) => r.abort())

  await page.goto('/')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Surahs' }).click()

  // The navigation failed, but the app said so rather than doing nothing.
  await expect(page.getByText('Couldn’t open that page. Please try again.')).toBeVisible({
    timeout: 15_000,
  })
})
