import { test, expect } from '@playwright/test'

// Regression: navigating *from* a reader page to a surah/juz/page must actually
// move the reader there. The saved last page used to clobber the deep-link — e.g.
// sitting on page 50, tapping An-Naba landed the URL on /78 but the sync snapped
// it back to /read/qpc/50 and the reader stayed on page 50. (contents.spec only
// checked the URL, so it never caught this.) The fix: a URL that names a location
// wins over the persisted page on load.

// Put the reader on page 50 with that page persisted to storage, exactly like a
// user who has been reading there, then reload so it comes back from storage.
async function settleOnPage50(page: import('@playwright/test').Page) {
  await page.goto('/page/50')
  await expect(page.getByText(/Page 50 \//)).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(500) // debounced pref write
  await page.reload()
  await expect(page.getByText(/Page 50 \//)).toBeVisible({ timeout: 10_000 })
}

test('from page 50 → Surahs → An-Naba opens Naba, not page 50', async ({ page }) => {
  await settleOnPage50(page)
  await page.getByRole('button', { name: 'Surahs' }).click()
  await expect(page).toHaveURL(/\/contents$/)
  await page.getByRole('button', { name: /^An-Naba/ }).click()
  await expect(page).toHaveURL(/\/78$/)
  // An-Naba (surah 78) is the first surah of juz 30 → QPC page 582.
  await expect(page.getByText(/Page 582 \//)).toBeVisible({ timeout: 10_000 })
})

test('from page 50 → Surahs → Juz 30 opens its page, not page 50', async ({ page }) => {
  await settleOnPage50(page)
  await page.getByRole('button', { name: 'Surahs' }).click()
  await page.getByRole('radio', { name: 'Juz' }).click()
  await page.getByRole('button', { name: /^Juz 30/ }).click()
  // Juz 30 starts at 78:1 — routed through the ayah friendly URL (not /page/582)
  // so the reader also scrolls to the exact line, not just the page.
  await expect(page).toHaveURL(/\/78\/1$/)
  await expect(page.getByText(/Page 582 \//)).toBeVisible({ timeout: 10_000 })
})

test('from page 50 → Surahs → Page 100 opens page 100, not page 50', async ({ page }) => {
  await settleOnPage50(page)
  await page.getByRole('button', { name: 'Surahs' }).click()
  await page.getByRole('radio', { name: 'Page' }).click()
  await page.getByRole('button', { name: 'Page 100', exact: true }).click()
  await expect(page).toHaveURL(/\/page\/100$/)
  await expect(page.getByText(/Page 100 \//)).toBeVisible({ timeout: 10_000 })
})

test('the bare reader home still reopens on the last-read page', async ({ page }) => {
  await settleOnPage50(page)
  // Opening `/` (no location in the URL) restores the persisted last page.
  await page.goto('/')
  await expect(page.getByText(/Page 50 \//)).toBeVisible({ timeout: 10_000 })
})
