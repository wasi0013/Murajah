import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Accessibility baseline for the design system (2.8). Runs axe across all three
// themes on the gallery. The mushaf reading surface (.surface) is excluded — it
// renders authentic Quran glyphs / tajweed colours that are content, not UI.
const themes = ['light', 'dark', 'sepia'] as const

for (const theme of themes) {
  test(`gallery has no serious a11y violations — ${theme}`, async ({ page }) => {
    await page.goto('/gallery')
    await page.getByRole('button', { name: theme, exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await page.waitForTimeout(300)

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .exclude('.surface')
      .analyze()

    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    )
    // Surface any violations in the failure message.
    expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.length })))).toEqual([])
  })
}

test('open dialog has no serious a11y violations', async ({ page }) => {
  await page.goto('/gallery')
  await page.getByRole('button', { name: 'Open modal' }).click()
  await expect(page.getByRole('dialog', { name: 'Reset progress' })).toBeVisible()
  await page.waitForTimeout(350) // let the fade-in settle (opacity 1) before measuring

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .exclude('.surface') // authentic tajweed glyph colours are content, not UI
    .analyze()
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  )
  expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([])
})

// Mushaf image surface (3b.8.2): chrome must be axe-clean in all three themes.
// The scan `<img>`s carry meaningful alt; the scan artwork itself is content.
for (const theme of themes) {
  test(`mushaf surface has no serious a11y violations — ${theme}`, async ({ page }) => {
    await page.goto('/mushaf/50')
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expect(page.locator('img[alt="Mushaf page 50"]')).toBeVisible({ timeout: 10_000 })

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    )
    expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.length })))).toEqual([])
  })
}
