import { test, expect } from '@playwright/test'

// Reported bug: some users see a themed-but-empty (dark) screen and nothing
// ever loads — no spinner, no error, no way to recover short of guessing to
// reload. index.html ships a dependency-free boot fallback (plain HTML/CSS +
// one classic script) precisely so it still runs when the module bundle
// itself never executes — see the comment above its <style> block. These
// specs exercise that mechanism directly, independent of *why* boot failed
// (flaky connection, a 404'd entry chunk, a WebView too old for ES modules,
// an uncaught error) — the fallback can't tell those apart and isn't meant
// to; it degrades to the same one panel every time.
//
// The real entry chunk's filename is content-hashed per build
// (`assets/index-<hash>.js`), so every route below matches on the stable
// `assets/index-*.js` shape rather than a fixed name.

test('normal boot: the spinner clears and the trouble panel never appears', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#murajah-boot')).toHaveCount(0, { timeout: 5000 })
})

test('entry chunk fails to load: the retry panel appears quickly (caught as a resource error, not just the timeout)', async ({
  page,
}) => {
  // A generous fallback timeout — this test must resolve via the capturing
  // `error` listener (see index.html), not by waiting it out. Set anyway so
  // a regression in that listener still fails fast instead of hanging 12s.
  await page.addInitScript(() => {
    ;(window as unknown as { __MURAJAH_BOOT_TIMEOUT_MS: number }).__MURAJAH_BOOT_TIMEOUT_MS = 2000
  })
  await page.route('**/assets/index-*.js', (route) => route.abort())
  await page.goto('/', { waitUntil: 'commit' })

  await expect(page.locator('#murajah-boot-trouble')).toBeVisible({ timeout: 1500 })
  await expect(page.locator('#murajah-boot-trouble-text')).toHaveText('This is taking longer than expected.')
  const retry = page.getByRole('button', { name: 'Retry' })
  await expect(retry).toBeVisible()

  // Clicking Retry does a plain reload — proves the button is wired, not just
  // present. The reload itself (not just `waitForEvent`, which always
  // resolves) is proven by the boot fallback actually clearing afterward.
  await page.unroute('**/assets/index-*.js')
  await Promise.all([page.waitForEvent('load'), retry.click()])
  await expect(page.locator('#murajah-boot')).toHaveCount(0, { timeout: 5000 })
})

test('entry chunk hangs (never resolves, no error fires): the timeout alone surfaces the retry panel', async ({
  page,
}) => {
  await page.addInitScript(() => {
    ;(window as unknown as { __MURAJAH_BOOT_TIMEOUT_MS: number }).__MURAJAH_BOOT_TIMEOUT_MS = 500
  })
  // Never call route.fulfill/continue/abort — the request just never settles,
  // simulating a connection that's alive but never delivers the response
  // (distinct from an outright failure, which the previous test covers).
  await page.route('**/assets/index-*.js', () => {})
  await page.goto('/', { waitUntil: 'commit' })

  await expect(page.locator('#murajah-boot-trouble')).toBeVisible({ timeout: 2000 })
})

test('offline: the retry panel names it specifically', async ({ page }) => {
  // Deliberately not `context.setOffline(true)` — that also blocks the
  // initial document request itself (this is the built app's own preview
  // server, not a real second origin the OS could route around), which would
  // fail the navigation before any of index.html's inline markup ever
  // parses. Faking `navigator.onLine` isolates the one thing this fallback
  // actually branches on, same as a real "no signal" device reports it.
  await page.addInitScript(() => {
    ;(window as unknown as { __MURAJAH_BOOT_TIMEOUT_MS: number }).__MURAJAH_BOOT_TIMEOUT_MS = 500
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
  })
  await page.route('**/assets/index-*.js', () => {})
  await page.goto('/', { waitUntil: 'commit' })

  await expect(page.locator('#murajah-boot-trouble')).toBeVisible({ timeout: 2000 })
  await expect(page.locator('#murajah-boot-trouble-text')).toHaveText(
    'You appear to be offline. Please check your connection and try again.',
  )
})

test('JavaScript disabled: shows a plain message instead of a spinner stuck forever', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('/')

  await expect(page.locator('#murajah-noscript')).toBeVisible()
  await expect(page.locator('#murajah-boot')).toBeHidden()
  await context.close()
})
