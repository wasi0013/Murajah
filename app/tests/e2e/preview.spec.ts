import { test, expect } from '@playwright/test'

/**
 * `/preview/:surah/:ayah(-:endAyah)?` — the shareable, always-tajweed
 * verse-range viewer (see tasks/plan.md). Ayah ranges below are picked from
 * the real QPC nav index (public/data/nav/qpc.json), not guessed:
 *  - 2:1-5   → page 2 only (single page)
 *  - 2:1-17  → pages 2-4 (3 pages)
 *  - 2:1-84  → pages 2-13, exactly 12 pages (the cap, inclusive)
 *  - 2:1-286 → the whole surah, far past the 12-page cap
 */

const family = (loc: import('@playwright/test').Locator) =>
  loc.evaluate((el) => getComputedStyle(el).fontFamily)

test('single-page range renders with the requested word highlights', async ({ page }) => {
  // Ayah 2:1 ("الم") is 2 words; ayah 2:2 is 8 — real counts from the QPC data.
  await page.goto('/preview/2/1-5?red=1:1&blue=2')
  await expect(page.locator('.surface')).toHaveCount(1)
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })

  // red/hl reuses the existing mistake style verbatim.
  await expect(page.locator('[data-loc="2:1:1"]')).toHaveClass(/state-mistake/)
  // word 2 of ayah 1 was never asked for — no highlight state.
  await expect(page.locator('[data-loc="2:1:2"]')).not.toHaveClass(/state-mistake|state-hl-/)
  // blue=2 (no word bound) is the whole ayah — all 8 of its words.
  await expect(page.locator('[data-loc="2:2:1"]')).toHaveClass(/state-hl-blue/)
  await expect(page.locator('.state-hl-blue')).toHaveCount(8)
})

test('multi-page range stacks pages with a divider; a single page has none', async ({ page }) => {
  await page.goto('/preview/2/1-17') // pages 2-4
  await expect(page.locator('.surface').first()).toBeVisible()
  await expect.poll(() => page.locator('.surface').count(), { timeout: 15_000 }).toBe(3)
  await expect(page.locator('.page-divider')).toHaveCount(2)

  await page.goto('/preview/2/1-5') // page 2 only
  await expect(page.locator('.surface').first()).toBeVisible()
  await expect(page.locator('.surface')).toHaveCount(1)
  await expect(page.locator('.page-divider')).toHaveCount(0)
})

test('a full 12-page range loads — including the last page\'s tajweed font', async ({ page }) => {
  await page.goto('/preview/2/1-84') // pages 2-13, exactly the cap
  await expect(page.locator('.preview-error')).toHaveCount(0)
  await expect.poll(() => page.locator('.surface').count(), { timeout: 20_000 }).toBe(12)
  // The page most likely to be starved if the shared FontLoader's own
  // eviction cap ever collided with the 12-page preview cap (see
  // tasks/plan.md's Architecture Decisions) — assert it, not just the count.
  await expect(family(page.locator('.surface').last())).resolves.toContain('tj-p')
})

test('always renders tajweed, even with a persisted reader.tajweed=false', async ({ page }) => {
  // Seed the same IndexedDB prefs store the normal reader persists to, so a
  // prior visit to `/` with tajweed turned off would otherwise carry over.
  await page.goto('/')
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('murajah-prefs', 1)
        req.onsuccess = () => {
          const tx = req.result.transaction('prefs', 'readwrite')
          tx.objectStore('prefs').put({ layout: 'qpc', tajweed: false }, 'reader')
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        }
        req.onerror = () => reject(req.error)
      }),
  )
  await page.goto('/preview/2/1-5')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  await expect(family(page.locator('.surface'))).resolves.toContain('tj-p')
})

test('the first verse gets the focus wash and is scrolled into view', async ({ page }) => {
  await page.goto('/preview/2/12-45')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  const firstVerse = page.locator('[data-verse="2:12"]').first()
  await expect(firstVerse).toHaveClass(/state-playing/)
  await expect(firstVerse).toBeInViewport()
})

test('a requested highlight wins over the "first verse" wash on the same word', async ({ page }) => {
  // 2:12 is the range's first verse (gets state-playing); also asking for a
  // highlight there must still paint the requested colour, not the "you are
  // here" accent wash underneath it — both classes can legally land on one
  // word, only one `background` should win.
  await page.goto('/preview/2/12-45?blue=12,20')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  const inFirstVerse = page.locator('[data-loc="2:12:1"]')
  const elsewhere = page.locator('[data-loc="2:20:1"]')
  await expect(inFirstVerse).toHaveClass(/state-hl-blue/)
  await expect(inFirstVerse).toHaveClass(/state-playing/)

  const bgIn = await inFirstVerse.evaluate((el) => getComputedStyle(el).backgroundColor)
  const bgElsewhere = await elsewhere.evaluate((el) => getComputedStyle(el).backgroundColor)
  // Same requested colour, on vs. off the first verse — must paint identically.
  expect(bgIn).toBe(bgElsewhere)
})

test('invalid surah shows a friendly error and links home', async ({ page }) => {
  await page.goto('/preview/999/1')
  await expect(page.locator('.preview-error')).toBeVisible()
  await expect(page.locator('.surface')).toHaveCount(0)
  await page.locator('.preview-error-link').click()
  await expect(page).toHaveURL('/')
})

test('invalid range shows a friendly error and links into the reader', async ({ page }) => {
  await page.goto('/preview/2/9999')
  await expect(page.locator('.preview-error')).toBeVisible()
  await expect(page.locator('.surface')).toHaveCount(0)
  await page.locator('.preview-error-link').click()
  await expect(page).toHaveURL(/\/2\/1$/)
})

test('an oversized range shows a friendly error and links into the reader', async ({ page }) => {
  await page.goto('/preview/2/1-286') // ~48 pages, far past the cap
  await expect(page.locator('.preview-error')).toBeVisible()
  await expect(page.locator('.surface')).toHaveCount(0)
  await page.locator('.preview-error-link').click()
  await expect(page).toHaveURL(/\/2\/1$/)
})

test('no shell chrome, and a word tap is inert', async ({ page }) => {
  await page.goto('/preview/2/1-5')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  await expect(page.locator('.shell-tabbar')).toHaveCount(0)

  const before = await page.locator('[data-loc="2:1:1"]').getAttribute('class')
  await page.locator('[data-loc="2:1:1"]').click()
  await expect(page.getByRole('dialog', { name: 'Word morphology' })).toHaveCount(0)
  expect(await page.locator('[data-loc="2:1:1"]').getAttribute('class')).toBe(before)
})

// A shared link is the realistic case: no saved prefs, no completed
// onboarding — a nested describe scopes the unauthenticated storageState to
// just this test, leaving every test above on the suite's normal (onboarded)
// default.
test.describe('fresh visitor (no saved prefs)', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('is not blocked by onboarding', async ({ page }) => {
    await page.goto('/preview/2/1-5')
    await expect(page.getByRole('dialog', { name: 'Choose your language' })).toHaveCount(0)
    await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  })
})
