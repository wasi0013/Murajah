import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// "Install for iOS" appears twice (hero + closing banner) — both are anchor
// jumps to the always-in-DOM #ios-install section, not a reveal-on-click
// disclosure, so `.first()`/`.last()` just disambiguates which link, not
// which state.

test('shows the logo and the hero install CTAs', async ({ page }) => {
  await page.goto('/download')
  await expect(page.getByRole('img', { name: 'Murajah' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Install for Android/ }).first()).toHaveAttribute(
    'href',
    'https://play.google.com/store/apps/details?id=com.murajah.webview',
  )
  await expect(page.getByRole('link', { name: /Install for iOS/ }).first()).toHaveAttribute(
    'href',
    '#ios-install',
  )
})

test('the iOS instructions section is always present and both entry points scroll to it', async ({
  page,
}) => {
  await page.goto('/download')
  // Always in the DOM now — not gated behind a click.
  const heading = page.getByRole('heading', { name: 'Add Murajah to your Home Screen' })
  await expect(heading).toBeAttached()
  await expect(page.getByText('Install on iOS as app')).toBeAttached()

  await page.getByRole('link', { name: /Install for iOS/ }).first().click()
  await expect(heading).toBeInViewport()

  await page.evaluate(() => window.scrollTo(0, 0))
  await page.getByRole('link', { name: 'Install on iOS' }).click() // the banner's badge image
  await expect(heading).toBeInViewport()
})

test('the iOS video embed lazy-loads', async ({ page }) => {
  await page.goto('/download')
  const iframe = page.locator('.video-wrap iframe')
  await expect(iframe).toHaveAttribute('src', 'https://www.youtube.com/embed/kwymbQOGipc')
  await expect(iframe).toHaveAttribute('loading', 'lazy')
  await expect(page.getByRole('heading', { name: /Quick Safari method/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Shortcuts app/ })).toBeVisible()
})

test('the middle CTA banner has accurate Google Play / iOS badges and a Discord CTA', async ({ page }) => {
  await page.goto('/download')
  await page.locator('.cta-banner').scrollIntoViewIfNeeded()

  const playBadge = page.locator('.cta-banner a[href*="play.google.com"] img')
  await expect(playBadge).toHaveAttribute('src', '/badges/google-play-badge.png')
  await expect(playBadge).toHaveAttribute('alt', /Google Play/)

  const iosBadge = page.locator('.cta-banner a[href="#ios-install"] img')
  await expect(iosBadge).toHaveAttribute('src', '/badges/install-ios-badge.svg')

  await expect(page.getByRole('link', { name: 'Join the Discord' })).toHaveAttribute(
    'href',
    'https://discord.gg/Vycfm28anP',
  )
})

test('feature demos are lazy: no video element or network request until scrolled into view', async ({
  page,
}) => {
  const videoRequests: string[] = []
  page.on('request', (req) => {
    if (req.url().includes('/videos/') && req.url().endsWith('.mp4')) videoRequests.push(req.url())
  })

  await page.goto('/download')
  await expect(page.locator('.demo-card')).toHaveCount(4)
  // Nothing below the fold has fetched a clip yet.
  expect(videoRequests).toEqual([])

  await page.locator('.demo-card').first().scrollIntoViewIfNeeded()
  await expect(page.locator('.demo-card').first().locator('video')).toHaveCount(1, { timeout: 5000 })
})

test('links to the Discord community from the bottom card', async ({ page }) => {
  await page.goto('/download')
  await expect(page.getByRole('link', { name: /Join the Murajah Discord/ })).toHaveAttribute(
    'href',
    'https://discord.gg/Vycfm28anP',
  )
})

test('keeps the app tab bar (not treated as a chrome-less route)', async ({ page }) => {
  await page.goto('/download')
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
})

// The install page is reached from outside links, so a genuinely first-time
// visitor (no saved prefs) must never be blocked by the non-dismissible
// language-picker onboarding modal — see App.vue's NO_ONBOARDING_ROUTE_NAMES.
test.describe('first-time visitor (unseeded storage)', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('does not show the onboarding modal', async ({ page }) => {
    await page.goto('/download')
    await expect(page.locator('[role="dialog"]')).toBeHidden()
    await expect(page.getByRole('link', { name: /Install for Android/ }).first()).toBeVisible()
  })
})

test('has no serious a11y violations', async ({ page }) => {
  await page.goto('/download')
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    // The YouTube Shorts embed is third-party markup we don't control — axe
    // can reach into it via CDP even across origins, and its (Google-owned)
    // DOM has its own a11y bugs unrelated to this page. Seen in CI: YouTube
    // serves the mobile player template there (`ytm-…` classes) instead of
    // the desktop one, which trips aria-allowed-attr/aria-prohibited-attr/
    // button-name inside the iframe. Our own `title`/`allow` on the <iframe>
    // are still exercised by the "lazy-loads" test above.
    .exclude('.video-wrap iframe')
    .analyze()
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([])
})
