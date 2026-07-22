import { test, expect } from '@playwright/test'

// Deterministic proxies for the §3 interaction budgets (the throttled FCP/LCP/
// TTI/CLS numbers are gated separately by Lighthouse CI, lighthouserc.json).

test('cold page data + fonts stay within budget', async ({ page }) => {
  const bytes = new Map<string, number>()
  page.on('response', async (r) => {
    const u = r.url()
    if (u.includes('/data/qpc/pages/') || u.includes('/fonts/')) {
      try {
        bytes.set(u, (await r.body()).length)
      } catch {
        /* ignore */
      }
    }
  })

  await page.goto('/read/qpc/50')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  await page.waitForTimeout(500)

  // Each page chunk (current + prefetched neighbours) is tiny vs the old monolith.
  const pages = [...bytes].filter(([u]) => u.includes('/data/qpc/pages/'))
  expect(pages.length).toBeGreaterThan(0)
  for (const [u, size] of pages) expect(size, u).toBeLessThan(30 * 1024)

  // Only the window's fonts load (current + neighbours), never the 604-page set.
  const fonts = [...bytes.keys()].filter((u) => u.includes('/fonts/'))
  expect(fonts.length, 'bounded fonts').toBeLessThan(8)
})

test('warm morphology tap is served from cache (no new fetch)', async ({ page }) => {
  const morReqs: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/data/morphology/')) morReqs.push(r.url())
  })

  await page.goto('/read/qpc/2') // Al-Baqarah — all words share one morphology chunk
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  const words = page.locator('.surface .word')

  // First tap warms the surah's morphology.
  await words.first().click()
  await expect(page.getByRole('dialog', { name: 'Word morphology' })).toBeVisible({ timeout: 10_000 })
  const afterFirst = morReqs.length
  expect(afterFirst).toBeGreaterThan(0)
  await page.keyboard.press('Escape')

  // A second tap in the same surah must not fetch again (warm → instant).
  await words.nth(4).click()
  await expect(page.getByRole('dialog', { name: 'Word morphology' })).toBeVisible()
  expect(morReqs.length).toBe(afterFirst)
})

test('page turns work under prefers-reduced-motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/read/qpc/10')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page).toHaveURL(/\/read\/qpc\/11/)
  await expect(page.getByText('Page 11 / 604')).toBeVisible()
})
