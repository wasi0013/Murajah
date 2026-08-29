import { test, expect } from '@playwright/test'
import { openSettings, closeSettings } from './helpers'

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
  // A word tap opens morphology only in Read mode — the app now defaults to
  // Mark mode (mistake-marking), so switch explicitly.
  await openSettings(page)
  await page.getByRole('radio', { name: 'Read' }).click()
  await closeSettings(page)
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

test('a returning user\'s last-read page loads directly, without fetching the store-default page first', async ({
  page,
}) => {
  // Regression test: `useReaderPages` used to start its first load as soon as
  // `data.init()`/`fonts.init()` resolved, racing the *separate* IndexedDB
  // read that restores the last-read page (useReaderPersistence). On a
  // returning user deep in the Quran, `reader.page` was still its store
  // default (1) at that point, so the reader wastefully fetched page 1's
  // chunk + font before ever starting the real page — an extra sequential
  // round trip squarely on the path to first paint. Fixed via `readyGate`
  // (ReaderView.vue → ReaderPager.vue → useReaderPages).
  const TARGET_PAGE = 400
  await page.goto('/')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  await page.evaluate(
    (targetPage) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('murajah-prefs', 1)
        req.onsuccess = () => {
          const tx = req.result.transaction('prefs', 'readwrite')
          tx.objectStore('prefs').put(
            { page: targetPage, layout: 'qpc', tajweed: false, wbw: false, wbwLang: 'en', tafsir: false, tafsirLang: 'en', textSizeStep: 2, mode: 'read' },
            'reader',
          )
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        }
        req.onerror = () => reject(req.error)
      }),
    TARGET_PAGE,
  )

  const requestedPages = new Set<number>()
  page.on('request', (r) => {
    const m = r.url().match(/(?:pages|qpc-v2)\/p?(\d+)/)
    if (m) requestedPages.add(Number(m[1]))
  })

  await page.reload()
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })

  const allowed = new Set([TARGET_PAGE - 1, TARGET_PAGE, TARGET_PAGE + 1])
  const unexpected = [...requestedPages].filter((p) => !allowed.has(p))
  expect(unexpected, 'no page outside the restored page ± its prefetched neighbours').toEqual([])
})

test('page turns work under prefers-reduced-motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/read/qpc/10')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Next page', exact: true }).click()
  await expect(page).toHaveURL(/\/read\/qpc\/11/)
  await expect(page.getByText('Page 11 / 604')).toBeVisible()
})

test('the home page load stays within a low cumulative layout shift budget', async ({ page }) => {
  // Confirmed layout-shift sources this locks in against regressing (measured
  // via the real Layout Instability API, throttled + unthrottled, before the
  // fix landed): the SurahNames header font swapping in late without a
  // preload (design/tokens.css + index.html), and the topbar's page/juz
  // indicator growing from one line to two once the nav index loads
  // (ReaderView.vue's `.indicator`). 0.01 is a generous multiple of the
  // ~0.002 measured locally post-fix — tight enough to catch either
  // regressing, loose enough not to flake on CI jitter.
  await page.addInitScript(() => {
    ;(window as unknown as { __cls: number }).__cls = 0
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
          if (!entry.hadRecentInput) (window as unknown as { __cls: number }).__cls += entry.value
        }
      }).observe({ type: 'layout-shift', buffered: true })
    } catch {
      /* Layout Instability API unavailable (non-Chromium) — nothing to assert */
    }
  })

  await page.goto('/')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  await page.waitForTimeout(500) // let the surah-header line (if any) finish settling

  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls)
  expect(cls).toBeLessThan(0.01)
})
