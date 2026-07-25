import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Audio (Phase 7). Drives the real player UI against the built app. Actual audio
// bytes stream from external CDNs and can't play deterministically in CI, so these
// assert the wiring and UI states (grain, reciter, AB-repeat, layout gating, live,
// record) rather than audible playback — which is unit-covered by the engine tests.

async function openReaderPlayer(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Recitation audio' }).click()
  await expect(page.locator('.player')).toBeVisible()
}

test('the headphones control opens the mini-player', async ({ page }) => {
  await openReaderPlayer(page)
  await expect(page.getByRole('radio', { name: 'Verse' })).toBeVisible()
})

test('the grain toggle switches between Verse and Page', async ({ page }) => {
  await openReaderPlayer(page)
  const verse = page.getByRole('radio', { name: 'Verse' })
  const pageGrain = page.getByRole('radio', { name: 'Page' })
  await expect(verse).toHaveAttribute('aria-checked', 'true')
  await pageGrain.click()
  await expect(pageGrain).toHaveAttribute('aria-checked', 'true')
})

test('page mode is disabled in Indopak layout (decision 6)', async ({ page }) => {
  // Deep-link to an Indopak page, then open the player.
  await page.goto('/read/indopak/3')
  await page.getByRole('button', { name: 'Recitation audio' }).click()
  await expect(page.locator('.player')).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Page' })).toBeDisabled()
  await expect(page.getByRole('radio', { name: 'Verse' })).toBeEnabled()
})

test('the reciter picker lists reciters and selecting one updates the player', async ({ page }) => {
  await openReaderPlayer(page)
  await page.locator('.reciter').click()
  const option = page.getByRole('option', { name: 'Mishary Rashid Al Afasy' })
  await expect(option).toBeVisible()
  await option.click()
  await expect(page.locator('.reciter')).toHaveText('Mishary Rashid Al Afasy')
})

test('AB-repeat: setting A then B starts the loop (decision 7a)', async ({ page }) => {
  await openReaderPlayer(page)
  await page.getByRole('button', { name: 'More controls' }).click()
  const a = page.locator('.chip.ab').first()
  const b = page.locator('.chip.ab').nth(1)
  const loop = page.getByRole('button', { name: 'Loop' })
  await expect(loop).toHaveAttribute('aria-pressed', 'false')
  await a.click()
  await b.click()
  await expect(loop).toHaveAttribute('aria-pressed', 'true') // auto-on when both set
})

test('AB-repeat: the Loop button is always usable, even before any A/B marker is set', async ({ page }) => {
  // Regression: Loop used to be disabled until a marker existed, making "just loop
  // the whole thing" impossible without first fiddling with A/B. What it does when
  // pressed (loop the whole item vs. from a marker) is unit-covered in
  // audio-engine.test.ts, since it depends on the track's duration.
  await openReaderPlayer(page)
  await page.getByRole('button', { name: 'More controls' }).click()
  const loop = page.getByRole('button', { name: 'Loop' })
  await expect(loop).toBeEnabled()
})

test('the reader tags words with their verse for highlight sync', async ({ page }) => {
  await page.goto('/')
  // Words render from real data; each carries a data-verse anchor (7.4 mapping).
  const firstWord = page.locator('.surface .word').first()
  await expect(firstWord).toBeVisible({ timeout: 15_000 })
  await expect(firstWord).toHaveAttribute('data-verse', /^\d+:\d+$/)
})

test('the mushaf view opens the player over its visible spread', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/mushaf/3')
  await page.getByRole('button', { name: 'Recitation audio' }).click()
  await expect(page.locator('.player')).toBeVisible()
  // In QPC page numbering the mushaf offers page grain (double-page is unit-covered).
  await expect(page.getByRole('radio', { name: 'Page' })).toBeEnabled()
})

test('record panel opens with a record control', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Record your recitation' }).click()
  // Chromium supports MediaRecorder, so the record button shows (we don't capture).
  await expect(page.getByRole('button', { name: /Record page/ })).toBeVisible()
})

test('live recitation opens as a full view from More and a channel starts the embed', async ({ page }) => {
  // "More" is a mobile-only affordance — desktop unpacks it as an inline rail tab.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('button', { name: /Live recitation/ }).click()
  await expect(page).toHaveURL(/\/live$/)
  await page.getByRole('button', { name: /Makkah Live/ }).click()
  await expect(page.locator('iframe[title="Live recitation stream"]')).toBeVisible()
})

/** Wait for running transitions so axe samples resting colours. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)))
    await frame()
    await frame()
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)))
  })
}

async function expectAxeClean(page: Page, label: string) {
  await settle(page)
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(serious, `${label}: ${JSON.stringify(serious.map((v) => v.id))}`).toEqual([])
}

for (const theme of ['light', 'dark', 'sepia'] as const) {
  test(`player has no serious a11y violations — ${theme}`, async ({ page }) => {
    await openReaderPlayer(page)
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expectAxeClean(page, `${theme} — player`)
    // Expand the advanced tray and re-check.
    await page.getByRole('button', { name: 'More controls' }).click()
    await expect(page.getByRole('button', { name: 'Loop' })).toBeVisible()
    await expectAxeClean(page, `${theme} — tray`)
  })
}
