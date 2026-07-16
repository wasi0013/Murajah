import { test, expect } from '@playwright/test'

test('swipe: rightward drag turns to the next page (RTL)', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })

  const box = (await page.locator('.pager').boundingBox())!
  const y = box.y + box.height / 2
  // Drag content rightward across ~60% of the width → next page in RTL.
  await page.mouse.move(box.x + box.width * 0.2, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.8, y, { steps: 10 })
  await page.mouse.up()

  await expect(page.getByText('Page 2 / 604')).toBeVisible()
  await expect(page).toHaveURL(/\/read\/qpc\/2/)
})

test('keyboard: arrows are RTL-aware', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })

  await page.keyboard.press('ArrowLeft') // RTL → next
  await expect(page.getByText('Page 2 / 604')).toBeVisible()
  await page.keyboard.press('ArrowRight') // RTL → previous
  await expect(page.getByText('Page 1 / 604')).toBeVisible()
})

test('indicator shows juz and surah name', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  // Page 1 is Juz 1 / Al-Fatiha — juz fills in once the nav index loads.
  await expect(page.locator('.page-meta')).toContainText('Juz 1', { timeout: 10_000 })
})
