import { test, expect } from '@playwright/test'
import { openSettings, closeSettings } from './helpers'

test('tapping a word opens its morphology; popup is code-split and dismissible', async ({
  page,
}) => {
  const chunkReqs: string[] = []
  page.on('request', (r) => {
    if (/MorphologyPopup/.test(r.url())) chunkReqs.push(r.url())
  })

  await page.goto('/')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })

  // A word tap opens morphology only in Read mode — the app now defaults to
  // Mark mode (mistake-marking), so switch explicitly.
  await openSettings(page)
  await page.getByRole('radio', { name: 'Read' }).click()
  await closeSettings(page)

  // The popup chunk is not in the initial bundle — nothing requested yet.
  expect(chunkReqs).toEqual([])

  const firstWord = page.locator('.surface .word').first()
  await firstWord.click()

  const dialog = page.getByRole('dialog', { name: 'Word morphology' })
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  await expect(dialog).toContainText('Surah 1')
  await expect(dialog.locator('.analysis')).not.toBeEmpty()

  // Its chunk loaded on demand, and the tapped word is highlighted.
  expect(chunkReqs.length).toBeGreaterThan(0)
  await expect(page.locator('.word.state-morphology')).toHaveCount(1)

  // Escape closes and clears the highlight.
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.locator('.word.state-morphology')).toHaveCount(0)
})

test('paging dismisses an open morphology popup', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  await openSettings(page)
  await page.getByRole('radio', { name: 'Read' }).click()
  await closeSettings(page)
  await page.locator('.surface .word').first().click()
  await expect(page.getByRole('dialog', { name: 'Word morphology' })).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Next page', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Word morphology' })).toBeHidden()
})
