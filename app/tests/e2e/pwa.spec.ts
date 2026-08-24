import { test, expect, type Page } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Phase 10 — plans/archive/phase-10-pwa-migration.md. Covers the load-bearing pieces
// that can be verified with browser automation: device-gated registration
// (§10.1/10.1.3), universal legacy teardown (§10.2), and that the app still
// boots normally under the new SW. The iOS *navigation* bug family itself
// (§0.1/§10.3) only reproduces on real WebKit — see the plan's own note that
// Playwright's `webkit` project isn't a faithful proxy for that; this suite
// verifies the *gate* (which URL gets registered, what Cache Storage ends up
// holding), not the WebKit-specific crash.
//
// A fresh client's very first SW activation deliberately does NOT reload —
// there's no prior controller/session to bring current, so `clientsClaim()`
// simply acquiring this client is not treated as "an update the user should
// see" (see `registerServiceWorker`'s `applyUpdateCalled` guard — reloading
// unconditionally on that transition was tried and produced a real reload
// loop against a still-active prior worker in testing). Only a genuine
// `applyUpdate()` — the first-handoff nudge or a tapped "update available"
// toast — reloads. `gotoAndSettle` is only needed where that applies.

// Test fixture ONLY — simulates the legacy `source/sw.js` registration every
// real user has before their first new-app boot. Written straight into the
// preview server's `dist/` (gitignored, never part of `app/public/`) so it
// never ships in the real deploy — only exists for the one test below that
// registers it. Must be a real static file, not `page.context().route()`
// fulfillment: routing a synthesized response for the SW script, even
// byte-identical, reliably made Chromium's SW update-check misbehave in
// testing (a CDP-interception artifact, not a real bug).
test.beforeAll(() => {
  const distDir = fileURLToPath(new URL('../../dist/', import.meta.url))
  writeFileSync(
    `${distDir}legacy-sw-stub.js`,
    "self.addEventListener('install', () => self.skipWaiting())\nself.addEventListener('activate', () => self.clients.claim())\n",
  )
})

async function gotoAndSettle(page: Page, url: string): Promise<void> {
  let loadCount = 0
  page.on('load', () => loadCount++)
  await page.goto(url)
  await expect.poll(() => loadCount, { timeout: 15_000 }).toBeGreaterThanOrEqual(2)
}

test('desktop/Android: registers the SW at the plain URL, scope /, no query', async ({ page }) => {
  await page.goto('/')
  const scriptURL = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    return reg.active?.scriptURL
  })
  expect(scriptURL).toMatch(/\/service-worker\.js$/)
})

test('iOS/iPadOS: registers with ?platform=ios (device gate honors platform+touch, not just UA)', async ({ page }) => {
  // Precise property overrides (not Playwright's built-in device descriptors,
  // which don't cover `navigator.platform`/`maxTouchPoints`) — reproduces the
  // exact iPadOS-masquerades-as-Mac case decision 1 calls out.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get: () => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15',
    })
    Object.defineProperty(navigator, 'platform', { configurable: true, get: () => 'MacIntel' })
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 5 })
  })

  await page.goto('/')
  const scriptURL = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    return reg.active?.scriptURL
  })
  expect(scriptURL).toMatch(/\/service-worker\.js\?platform=ios$/)

  // The precache manifest must never reach Cache Storage on iOS (§10.3) — the
  // worker's own precache bucket (workbox-precache-*) must not exist.
  const cacheKeys = await page.evaluate(() => caches.keys())
  expect(cacheKeys.some((k) => k.startsWith('workbox-precache-'))).toBe(false)
})

test('legacy SW + murajah-cache-*/murajah-fonts-* buckets are torn down on new-app boot', async ({ page }) => {
  // First load lets the real app register its own SW normally (fresh install
  // — no reload expected here).
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)

  // Swap in a stand-in "legacy" registration + legacy-named caches at the
  // same scope, simulating a browser that has only ever run the legacy SW —
  // the state every real existing user is in before their first new-app boot.
  await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(regs.map((r) => r.unregister()))
    await navigator.serviceWorker.register('/legacy-sw-stub.js', { scope: '/' })
    await navigator.serviceWorker.ready
    const cache = await caches.open('murajah-cache-v26.05.31')
    await cache.put('/dummy', new Response('legacy'))
    const fontsCache = await caches.open('murajah-fonts-v26.05.31')
    await fontsCache.put('/dummy-font', new Response('legacy-font'))
  })

  // New boot: main.ts's teardown must find and retire the stub before
  // re-registering the real worker. This is the migrated-user path — the new
  // worker parks behind the still-controlling legacy one, so this DOES
  // reload (the approved first-handoff nudge, see decision 5 / open Q2).
  await gotoAndSettle(page, '/')

  const state = await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations()
    return {
      scriptURLs: regs.map((r) => r.active?.scriptURL),
      cacheKeys: await caches.keys(),
    }
  })

  expect(state.scriptURLs.some((u) => u?.includes('legacy-sw-stub'))).toBe(false)
  expect(state.scriptURLs.some((u) => u?.endsWith('/service-worker.js'))).toBe(true)
  expect(state.cacheKeys).not.toContain('murajah-cache-v26.05.31')
  expect(state.cacheKeys).not.toContain('murajah-fonts-v26.05.31')

  // The app itself still renders after the migration boot.
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })

  // Regression guard for the reload loop found in testing: an unconditional
  // reload-on-controllerchange chained into a spurious re-install on every
  // subsequent boot. A bounded load count alone wouldn't have caught a
  // dismissible toast nobody taps, so also assert the update toast never
  // appears on these now-ordinary, already-migrated boots.
  for (let i = 0; i < 3; i++) {
    let loadCount = 0
    page.on('load', () => loadCount++)
    await page.goto('/')
    await page.waitForTimeout(2000) // let any (unwanted) async update cycle surface
    expect(loadCount, `boot ${i}: exactly one load, no chained reload`).toBe(1)
    await expect(page.getByText('Update available', { exact: false })).toHaveCount(0)
    await expect(page.getByText('has been rebuilt', { exact: false })).toHaveCount(0)
  }
})

test('install CTA: Android/desktop shows a button that triggers the captured beforeinstallprompt', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: 'Install' })).toHaveCount(0)

  await page.evaluate(() => {
    ;(window as Window & { __promptCalled?: boolean }).__promptCalled = false
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt?: () => Promise<void>
      userChoice?: Promise<{ outcome: string }>
    }
    event.prompt = () => {
      ;(window as Window & { __promptCalled?: boolean }).__promptCalled = true
      return Promise.resolve()
    }
    event.userChoice = Promise.resolve({ outcome: 'accepted' })
    window.dispatchEvent(event)
  })

  const install = page.getByRole('button', { name: 'Install' })
  await expect(install).toBeVisible()
  await install.click()
  await expect
    .poll(() => page.evaluate(() => (window as Window & { __promptCalled?: boolean }).__promptCalled))
    .toBe(true)
})

test('install CTA: iOS shows the manual Share instruction, not a button (no beforeinstallprompt API there)', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15',
    })
  })
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Add to Home Screen', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Install' })).toHaveCount(0)
})
