import { test, expect } from '@playwright/test'

const firstWord = (page: import('@playwright/test').Page) =>
  page.locator('.col[aria-hidden="false"] .surface .word').first()

test('mark mode toggles a persisted mistake; read mode still opens morphology', async ({ page }) => {
  await page.goto('/')
  await expect(firstWord(page)).not.toBeEmpty({ timeout: 10_000 })

  // Switch to mark mode and mark the first word.
  await page.getByRole('radio', { name: 'Mark' }).click()
  await firstWord(page).click()
  await expect(firstWord(page)).toHaveClass(/state-mistake/)

  // Persist (debounced) then reload — the mark survives.
  await page.waitForTimeout(500)
  await page.reload()
  await expect(firstWord(page)).not.toBeEmpty({ timeout: 10_000 })
  await expect(firstWord(page)).toHaveClass(/state-mistake/)

  // Mode also persisted (still 'mark'): tapping again unmarks.
  await firstWord(page).click()
  await expect(firstWord(page)).not.toHaveClass(/state-mistake/)

  // Read mode: the same tap opens morphology instead of marking.
  await page.getByRole('radio', { name: 'Read' }).click()
  await firstWord(page).click()
  await expect(page.getByRole('dialog', { name: 'Word morphology' })).toBeVisible({ timeout: 10_000 })
  await expect(firstWord(page)).not.toHaveClass(/state-mistake/)
})
