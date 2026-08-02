import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Listen (Phase 8). Audio bytes stream from external CDNs and can't play in CI, so
// these assert the wiring and UI: the scope picker, the page-only mini-player (no
// grain toggle), the curated reciter list, and the browse → listen cross-link.

// `/listen` is directly routable — most tests below just need to land there and
// don't care how, so they navigate straight there rather than via the "More"
// sheet (a mobile-only affordance now that the desktop rail unpacks Quiz/
// Listen/Live/Settings as ordinary inline tabs — see BottomTabBar.vue).
async function openListen(page: Page) {
  await page.goto('/listen')
}

test('the More menu offers both Listen and Live recitation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }) // mobile: the sheet this test covers
  await page.goto('/')
  await page.getByRole('button', { name: 'More' }).click()
  await expect(page.getByRole('button', { name: /^Listen/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Live recitation/ })).toBeVisible()
})

test('picking a surah docks the mini-player with no grain toggle', async ({ page }) => {
  await openListen(page)
  const furqan = page.getByRole('button', { name: /Al-Furqan/ })
  await expect(furqan).toBeVisible({ timeout: 10_000 })
  await furqan.click()
  await expect(page.locator('.player')).toBeVisible()
  // Listen is page-only — the reader's Verse/Page grain toggle must not appear.
  await expect(page.getByRole('radiogroup', { name: 'Playback grain' })).toHaveCount(0)
})

test('the tray hides the (non-functional) repeat/spaced-drill controls', async ({ page }) => {
  // BUG regression: Listen is a straight-through whole-scope playthrough, not a
  // per-verse drill — repeatCount/spaced are never wired into its playlists
  // (see useListenPlayer.ts), so the tray must not show controls implying they do.
  await openListen(page)
  await page.getByRole('button', { name: /Al-Furqan/ }).click()
  await expect(page.locator('.player')).toBeVisible()
  await page.getByRole('button', { name: 'More controls' }).click()
  await expect(page.getByText('Repetition')).toHaveCount(0)
})

test('the reciter picker offers the curated single-voice set only', async ({ page }) => {
  await openListen(page)
  await page.getByRole('button', { name: /Al-Furqan/ }).click()
  await page.locator('.reciter').click()
  await expect(page.getByRole('option', { name: 'Mishary Rashid Al Afasy' })).toBeVisible()
  // Husary is page-only (no per-ayah recording) → excluded from Listen.
  await expect(page.getByRole('option', { name: /Husary/ })).toHaveCount(0)
})

test('the Whole Quran scope plays from a single Play button', async ({ page }) => {
  await openListen(page)
  await page.getByRole('radio', { name: 'Whole Quran' }).click()
  await page.getByRole('button', { name: 'Play the whole Quran' }).click()
  await expect(page.locator('.player')).toBeVisible()
})

test('the browse → listen cross-link deep-links and plays a surah', async ({ page }) => {
  await page.goto('/contents')
  await page.getByRole('button', { name: 'Listen to Al-Furqan' }).click()
  await expect(page).toHaveURL(/\/listen\?scope=surah&ref=25/)
  await expect(page.locator('.player')).toBeVisible()
})

/** Let mount/theme transitions finish so axe samples resting colours, not a fade. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)))
    await frame()
    await frame()
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)))
  })
}

// Scans the Listen chrome, scope picker, and surah list (where the Makki/Madani
// badge contrast lives). The docked mini-player is a11y-covered in audio.spec — and
// starting playback here would leave the loading spinner running forever in CI.
for (const theme of ['light', 'dark', 'sepia'] as const) {
  test(`Listen has no serious a11y violations — ${theme}`, async ({ page }) => {
    await page.goto('/listen')
    await expect(page.getByRole('button', { name: /^Al-Furqan/ })).toBeVisible({ timeout: 10_000 })
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await settle(page)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(serious, `${theme}: ${JSON.stringify(serious.map((v) => v.id))}`).toEqual([])
  })
}
