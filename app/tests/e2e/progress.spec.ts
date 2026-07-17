import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Memorization progress view (Phase 4). Reached from the reader top bar; renders
// the canonical 604-page grid grouped into 30 juz, with a per-page sheet to mark
// memorized and record clean revisions (which award hasanah). Data persists to
// IndexedDB, so marks survive a reload.

const hasanah = (page: Page) => page.locator('.stat', { hasText: 'Hasanah' }).locator('.stat-n')

test('reader top bar opens the progress view', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Memorization progress' }).click()
  await expect(page).toHaveURL(/\/progress$/)
  await expect(page.getByRole('heading', { name: 'Memorization', level: 1 })).toBeVisible()
})

test('grid renders 604 pages across 30 juz', async ({ page }) => {
  await page.goto('/progress')
  await expect(page.getByRole('button', { name: 'Page 1, not memorized' })).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.locator('.juz')).toHaveCount(30)
  await expect(page.locator('.cell')).toHaveCount(604)
})

test('marking a page memorized persists across reload', async ({ page }) => {
  await page.goto('/progress')
  const cell = page.getByRole('button', { name: 'Page 5, not memorized' })
  await expect(cell).toBeVisible({ timeout: 10_000 })
  await cell.click()

  // Sheet opens for that page; toggle memorized on.
  await expect(page.getByRole('dialog', { name: 'Page 5' })).toBeVisible()
  await page.getByRole('switch', { name: 'Memorized' }).click()
  await page.keyboard.press('Escape')

  // The cell now reports memorized in its accessible name.
  await expect(page.getByRole('button', { name: 'Page 5, memorized' })).toBeVisible()

  // Persist (debounced) then reload — the mark survives.
  await page.waitForTimeout(500)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Page 5, memorized' })).toBeVisible({
    timeout: 10_000,
  })
})

test('recording a clean revision raises strength and awards hasanah', async ({ page }) => {
  await page.goto('/progress')
  await expect(hasanah(page)).toHaveText('0', { timeout: 10_000 })

  await page.getByRole('button', { name: 'Page 8, not memorized' }).click()
  await expect(page.getByRole('dialog', { name: 'Page 8' })).toBeVisible()

  // "+" records a clean recitation from memory: strength 0 → 1, hasanah increases.
  await page.getByRole('button', { name: 'Record a clean revision' }).click()
  await expect(page.locator('.step-val')).toHaveText('1')
  await page.keyboard.press('Escape')

  await expect(hasanah(page)).not.toHaveText('0')
})

test('bulk range mark memorizes a contiguous range', async ({ page }) => {
  await page.goto('/progress')
  await expect(page.getByRole('button', { name: 'Page 1, not memorized' })).toBeVisible({
    timeout: 10_000,
  })

  await page.getByLabel('From page').fill('1')
  await page.getByLabel('To page').fill('3')
  await page.getByRole('button', { name: 'Memorized', exact: true }).click()

  for (const p of [1, 2, 3]) {
    await expect(page.getByRole('button', { name: `Page ${p}, memorized` })).toBeVisible()
  }
})

test('grid cells are a roving-tabindex group navigable by arrow keys', async ({ page }) => {
  await page.goto('/progress')
  const cell1 = page.getByRole('button', { name: 'Page 1, not memorized' })
  await expect(cell1).toBeVisible({ timeout: 10_000 })

  await cell1.focus()
  await expect(cell1).toBeFocused()

  // Left/Right move one page; Home/End jump to the ends.
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Page 2, not memorized' })).toBeFocused()
  await page.keyboard.press('End')
  await expect(page.getByRole('button', { name: 'Page 604, not memorized' })).toBeFocused()
  await page.keyboard.press('Home')
  await expect(cell1).toBeFocused()

  // ArrowDown moves by a whole row (more than one page).
  await page.keyboard.press('ArrowDown')
  await expect(cell1).not.toBeFocused()

  // Enter activates the focused cell (opens its sheet).
  await page.keyboard.press('Home')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Page 1' })).toBeVisible()
})

test('the juz-jump bar scrolls the grid to a juz', async ({ page }) => {
  await page.goto('/progress')
  await expect(page.getByRole('button', { name: 'Page 1, not memorized' })).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.locator('[data-juz="30"]')).not.toBeInViewport()

  await page.getByRole('button', { name: 'Jump to juz 30' }).click()
  await expect(page.locator('[data-juz="30"]')).toBeInViewport()
})

test('a weakest-page chip opens that page and deep-links into the reader', async ({ page }) => {
  await page.goto('/progress')
  await expect(page.getByRole('button', { name: 'Page 1, not memorized' })).toBeVisible({
    timeout: 10_000,
  })

  // Memorize a few pages — never-reviewed pages surface as "Needs review".
  await page.getByLabel('From page').fill('1')
  await page.getByLabel('To page').fill('3')
  await page.getByRole('button', { name: 'Memorized', exact: true }).click()

  // The chip (exact "Page 2") is distinct from the grid cell ("Page 2, memorized").
  const chip = page.getByRole('button', { name: 'Page 2', exact: true })
  await expect(chip).toBeVisible()
  await chip.click()

  // Opens the per-page sheet, whose "Open in reader" deep-links /read/qpc/2.
  await expect(page.getByRole('dialog', { name: 'Page 2' })).toBeVisible()
  await page.getByRole('button', { name: 'Open in reader' }).click()
  await expect(page).toHaveURL(/\/read\/qpc\/2$/)
})

// The progress chrome must be axe-clean in all three themes. Colour is never the
// only cue (page numbers + mistake dots + labels), which axe can't verify but the
// design guarantees.
const themes = ['light', 'dark', 'sepia'] as const
for (const theme of themes) {
  test(`progress view has no serious a11y violations — ${theme}`, async ({ page }) => {
    await page.goto('/progress')
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expect(page.getByRole('button', { name: 'Page 1, not memorized' })).toBeVisible({
      timeout: 10_000,
    })

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    )
    expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.length })))).toEqual(
      [],
    )
  })
}
