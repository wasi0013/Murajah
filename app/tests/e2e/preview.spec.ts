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
  // Each divider names the page it introduces, in order (pages 2-4 → the two
  // dividers introduce pages 3 and 4).
  await expect(page.locator('.page-divider').nth(0)).toContainText('3')
  await expect(page.locator('.page-divider').nth(1)).toContainText('4')

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

test('the scroll to the first verse is unaffected by a slower later page', async ({ page }) => {
  // Pages load independently and in parallel (usePreviewPages), and the range's
  // first verse is always on the first (topmost) page in the stack. A slower
  // page further down staying a skeleton longer can never shift anything
  // above it (ordinary block layout), so the first page's own scroll-into-view
  // — fired as soon as *it* is ready, the same mechanism a surah/juz jump uses
  // — settles correctly regardless of how long a later page takes. Delaying
  // page 4's fetch is the regression guard for that invariant.
  await page.route(/\/pages\/4\.json/, async (route) => {
    await new Promise((r) => setTimeout(r, 800))
    await route.continue()
  })
  await page.goto('/preview/2/1-17') // pages 2-4
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  // Still mid-flight: the slow page's skeleton is up right now — the checks
  // below happen while that's true, not after everything has settled.
  await expect(page.locator('.page-skeleton')).toHaveCount(1)

  const firstVerse = page.locator('[data-verse="2:1"]').first()
  await expect(firstVerse).toHaveClass(/state-playing/)
  await expect(firstVerse).toBeInViewport()

  await expect.poll(() => page.locator('.surface').count(), { timeout: 15_000 }).toBe(3)
})

test('a requested highlight\'s underline is still visible on the "first verse"', async ({ page }) => {
  // 2:12 is the range's first verse (gets state-playing, a background wash);
  // a highlight there is a colour + wavy underline (same channel as
  // .state-mistake), a different visual property, so it never has to fight
  // the wash for the same pixel — assert the underline colour actually
  // renders identically on vs. off the first verse.
  await page.goto('/preview/2/12-45?blue=12,20')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  const inFirstVerse = page.locator('[data-loc="2:12:1"]')
  const elsewhere = page.locator('[data-loc="2:20:1"]')
  await expect(inFirstVerse).toHaveClass(/state-hl-blue/)
  await expect(inFirstVerse).toHaveClass(/state-playing/)

  const underlineIn = await inFirstVerse.evaluate((el) => getComputedStyle(el).textDecorationColor)
  const underlineElsewhere = await elsewhere.evaluate((el) => getComputedStyle(el).textDecorationColor)
  expect(underlineIn).toBe(underlineElsewhere)
  expect(underlineIn).not.toBe('rgba(0, 0, 0, 0)') // actually coloured, not the inherited default
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

test('the header logo links to /download', async ({ page }) => {
  await page.goto('/preview/2/1-5')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  await expect(page.locator('.preview-header .logo-link')).toHaveAttribute('href', '/download')
})

test('share sheet: the URL includes the highlight params, and copy works', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/preview/2/12-45?red=12:1&blue=20')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Share' }).click()
  const sheet = page.getByRole('dialog', { name: 'Share this link' })
  await expect(sheet).toBeVisible()

  const shareUrl = await sheet.locator('.share-url').inputValue()
  expect(shareUrl).toContain('/preview/2/12-45')
  expect(shareUrl).toContain('red=12:1')
  expect(shareUrl).toContain('blue=20')

  // Social targets carry the same URL, not a reconstructed/simplified one.
  const whatsappHref = await sheet.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')
  expect(whatsappHref).toContain(encodeURIComponent(shareUrl))

  await sheet.getByRole('button', { name: 'Copy link' }).click()
  await expect(page.getByText('Link copied')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(shareUrl)
})

test('the jump sheet navigates to a different surah/range and drops stale highlight params', async ({
  page,
}) => {
  await page.goto('/preview/2/12-45?red=12:1')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Choose a different range' }).click()
  const sheet = page.getByRole('dialog', { name: 'Go to a range' })
  await expect(sheet).toBeVisible()

  await sheet.getByLabel('Surah').selectOption('1')
  await sheet.getByLabel('From ayah').selectOption('2')
  await sheet.getByLabel('To ayah').selectOption('4')
  await sheet.getByRole('button', { name: 'Go' }).click()

  await expect(page).toHaveURL('/preview/1/2-4')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  // The old range's highlight query is gone — it belonged to different words.
  await expect(page).not.toHaveURL(/red=/)
})

test('the jump sheet resets the ayah range when the surah changes', async ({ page }) => {
  await page.goto('/preview/2/12-45')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Choose a different range' }).click()
  const sheet = page.getByRole('dialog', { name: 'Go to a range' })
  const fromSelect = sheet.getByLabel('From ayah')
  await fromSelect.selectOption('20')
  await sheet.getByLabel('Surah').selectOption('1') // only 7 ayahs — 20 is no longer valid
  await expect(fromSelect).toHaveValue('1')
  await expect(sheet.getByLabel('To ayah')).toHaveValue('1')
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
