import { test, expect } from '@playwright/test'
import { openSettings, closeSettings } from './helpers'

// A word tap opens morphology (read mode) or marks a mistake (mark mode). But a
// touch that starts on a word and then *scrolls* must not be mistaken for a tap —
// otherwise every scroll pops a morphology sheet / stray mistake. The pager only
// treats a stationary press (within the tap slop, ending in pointerup not
// pointercancel) as a tap; any movement past the slop is a scroll/drag.
// These specifically exercise Read mode — the app now defaults to Mark mode.

const firstWord = (page: import('@playwright/test').Page) =>
  page.locator('.surface .word').first()

async function useReadMode(page: import('@playwright/test').Page) {
  await openSettings(page)
  await page.getByRole('radio', { name: 'Read' }).click()
  await closeSettings(page)
}

test('a vertical drag on a word does not open morphology (scroll intent)', async ({ page }) => {
  await page.goto('/')
  await expect(firstWord(page)).not.toBeEmpty({ timeout: 10_000 })
  await useReadMode(page)

  const box = (await firstWord(page).boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx, cy + 20, { steps: 3 })
  await page.mouse.move(cx, cy + 60, { steps: 5 })
  await page.mouse.up()

  await page.waitForTimeout(300)
  await expect(page.getByRole('dialog', { name: 'Word morphology' })).toBeHidden()
})

test('a stationary tap still opens morphology', async ({ page }) => {
  await page.goto('/')
  await expect(firstWord(page)).not.toBeEmpty({ timeout: 10_000 })
  await useReadMode(page)
  await firstWord(page).click()
  await expect(page.getByRole('dialog', { name: 'Word morphology' })).toBeVisible({ timeout: 10_000 })
})
