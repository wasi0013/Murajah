import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { openSettings } from './helpers'

// Accessibility gate for the reader (3.11.2). The `.surface` is excluded — its
// authentic Quran glyphs / tajweed colours are content, not UI.
const themes = ['light', 'dark', 'sepia'] as const

const scan = (page: import('@playwright/test').Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('.surface')

function serious(results: Awaited<ReturnType<AxeBuilder['analyze']>>) {
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, nodes: v.nodes.length }))
}

for (const theme of themes) {
  test(`reader has no serious a11y violations — ${theme}`, async ({ page }) => {
    await page.goto('/read/qpc/2')
    await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
    await page.waitForTimeout(200)

    const found = serious(await scan(page).analyze())
    expect(found, JSON.stringify(found)).toEqual([])
  })
}

test('reader controls sheet has no serious a11y violations', async ({ page }) => {
  await page.goto('/read/qpc/2')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  await openSettings(page)
  await page.waitForTimeout(300)

  const found = serious(await scan(page).analyze())
  expect(found, JSON.stringify(found)).toEqual([])
})
