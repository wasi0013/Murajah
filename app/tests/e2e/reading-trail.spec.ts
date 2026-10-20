import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Reading trail: after a hop (quick-jump, deep link…) a "back" chip retraces it,
// and the quick-jump palette lists recent reading spots when nothing is typed.

const openJump = (page: Page) => page.getByRole('button', { name: 'Go to page, ayah or surah' }).click()
const jumpInput = (page: Page) => page.getByRole('textbox', { name: 'Quick jump' })

async function jump(page: Page, query: string) {
  await openJump(page)
  await jumpInput(page).fill(query)
  await jumpInput(page).press('Enter')
}

async function readerReady(page: Page) {
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 15_000 })
}

test('a hop offers the way back; going back offers the way forward; reading on retires it', async ({ page }) => {
  await page.goto('/read/qpc/50')
  await readerReady(page)
  await expect(page.locator('.trail-chip')).toHaveCount(0) // just arrived: nothing to go back to

  await jump(page, '2:255') // → page 42, a hop
  await expect(page).toHaveURL(/\/read\/qpc\/42(\?|$)/)
  const back = page.getByRole('button', { name: 'Back to page 50' })
  await expect(back).toBeVisible()

  await back.click()
  await expect(page).toHaveURL(/\/read\/qpc\/50(\?|$)/)
  await expect(page.getByRole('button', { name: 'Back to page 42' })).toBeVisible()

  await page.locator('.topbar').getByRole('button', { name: 'Next page' }).click() // reading on
  await expect(page).toHaveURL(/\/read\/qpc\/51(\?|$)/)
  await expect(page.locator('.trail-chip')).toHaveCount(0)
})

test('the quick-jump palette lists recent spots and they survive a reload', async ({ page }) => {
  await page.goto('/read/qpc/50')
  await readerReady(page)
  await jump(page, 'page 300')
  await expect(page).toHaveURL(/\/read\/qpc\/300(\?|$)/)
  await jump(page, 'page 120')
  await expect(page).toHaveURL(/\/read\/qpc\/120(\?|$)/)

  await page.waitForTimeout(500) // let the debounced save land
  await page.reload()
  await readerReady(page)

  await openJump(page)
  await expect(page.getByText('Recent pages')).toBeVisible()
  const options = page.getByRole('option')
  await expect(options).toHaveCount(2)
  await expect(options.nth(0)).toContainText('Page 300')
  await expect(options.nth(1)).toContainText('Page 50')
  await options.nth(1).click()
  await expect(page).toHaveURL(/\/read\/qpc\/50(\?|$)/)
})

test('a cold friendly deep link is not mistaken for a hop from page 1', async ({ page }) => {
  await page.goto('/2/255')
  await readerReady(page)
  await expect(page.locator('.trail-chip')).toHaveCount(0)
  await openJump(page)
  await expect(page.getByText('Recent pages')).toHaveCount(0)
})

test('the mushaf continues the same trail and offers the way back too', async ({ page }) => {
  await page.goto('/mushaf/50')
  await expect(page.getByRole('button', { name: 'Go to page, ayah or surah' })).toContainText('50')
  await jump(page, 'page 100')
  await expect(page).toHaveURL(/\/mushaf\/100$/)
  await page.getByRole('button', { name: 'Back to page 50' }).click()
  await expect(page).toHaveURL(/\/mushaf\/50$/)
})

test('the back chip gets out of the way: hides itself after 3s, or on its close button', async ({ page }) => {
  await page.goto('/read/qpc/50')
  await readerReady(page)
  await jump(page, 'page 300')
  const chip = page.locator('.trail-chip')
  await expect(chip).toBeVisible()
  await page.mouse.move(0, 0) // never hover it: let the countdown run
  await expect(chip).toHaveCount(0, { timeout: 5_000 })

  await jump(page, 'page 120')
  await expect(chip).toBeVisible()
  await page.getByRole('button', { name: 'Hide back button' }).click()
  await expect(chip).toHaveCount(0)
  await expect(page).toHaveURL(/\/read\/qpc\/120(\?|$)/) // closing doesn't navigate

  // The spot is still on the trail.
  await openJump(page)
  await expect(page.getByRole('option').first()).toContainText('Page 300')
})

test('the back chip passes an accessibility scan', async ({ page }) => {
  await page.goto('/read/qpc/50')
  await readerReady(page)
  await jump(page, 'page 300')
  const chip = page.locator('.trail-chip')
  await expect(chip).toBeVisible()
  // Scan the settled chip, not a frame of its fade-in (contrast would read low).
  await expect.poll(() => chip.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
  const results = await new AxeBuilder({ page }).include('.trail-chip').analyze()
  expect(results.violations).toEqual([])
})
