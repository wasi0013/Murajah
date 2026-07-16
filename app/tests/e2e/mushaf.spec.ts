import { test, expect, type Page } from '@playwright/test'

const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 900 }

/** Wait for a mushaf page image to be decoded (natural size > 0). */
async function expectPageLoaded(page: Page, n: number) {
  const img = page.locator(`img[alt="Mushaf page ${n}"]`)
  await expect(img).toBeVisible()
  await expect
    .poll(async () => img.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 10_000 })
    .toBeGreaterThan(0)
}

test.describe('mushaf image surface', () => {
  test('deep-link opens the requested page (single, mobile)', async ({ page }) => {
    await page.setViewportSize(PHONE)
    await page.goto('/mushaf/50')
    await expect(page.getByText('Page 50 / 604')).toBeVisible()
    await expectPageLoaded(page, 50)
    // exactly one page shown on a phone
    await expect(page.locator('img[alt^="Mushaf page"]')).toHaveCount(1)
  })

  test('shows a 2-up spread on desktop (RTL: lower page on the right)', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/mushaf/50')
    // spread for page 50 is (49,50)
    await expect(page.getByText('Pages 49–50 / 604')).toBeVisible()
    await expectPageLoaded(page, 49)
    await expectPageLoaded(page, 50)
    // right (lower) page sits to the right of the left (higher) page in RTL
    const right = (await page.locator('img[alt="Mushaf page 49"]').boundingBox())!
    const left = (await page.locator('img[alt="Mushaf page 50"]').boundingBox())!
    expect(right.x).toBeGreaterThan(left.x)
  })

  test('keyboard pages RTL — one page on mobile, a whole spread on desktop', async ({ page }) => {
    await page.setViewportSize(PHONE)
    await page.goto('/mushaf/50')
    await expect(page.getByText('Page 50 / 604')).toBeVisible()
    await page.keyboard.press('ArrowLeft') // RTL → next
    await expect(page.getByText('Page 51 / 604')).toBeVisible()
    await expect(page).toHaveURL(/\/mushaf\/51/)

    await page.setViewportSize(DESKTOP)
    await page.goto('/mushaf/50')
    await expect(page.getByText('Pages 49–50 / 604')).toBeVisible()
    await page.keyboard.press('ArrowLeft') // next spread, not next page
    await expect(page.getByText('Pages 51–52 / 604')).toBeVisible()
  })

  test('shared quick-jump lands on the right mushaf page', async ({ page }) => {
    await page.setViewportSize(PHONE)
    await page.goto('/mushaf/1')
    await page.getByRole('button', { name: 'Go to page, ayah or surah' }).click()
    await page.getByRole('textbox', { name: 'Quick jump' }).fill('page 100')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Page 100 / 604')).toBeVisible()
    await expectPageLoaded(page, 100)
  })

  test('revisiting a page serves the image from cache (no second fetch)', async ({ page }) => {
    const hits: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/img/mushaf/60.webp')) hits.push(r.url())
    })
    await page.setViewportSize(PHONE)
    await page.goto('/mushaf/60')
    await expectPageLoaded(page, 60)
    expect(hits.length).toBe(1)

    // Navigate away and back; the Blob now comes from IndexedDB.
    await page.goto('/mushaf/300')
    await expectPageLoaded(page, 300)
    await page.goto('/mushaf/60')
    await expectPageLoaded(page, 60)
    expect(hits.length).toBe(1) // still one — served from cache
  })

  test('entry point: open from the reader and return', async ({ page }) => {
    await page.setViewportSize(PHONE)
    await page.goto('/read/qpc/5')
    await page.getByRole('button', { name: 'Mushaf scan view' }).click()
    await expect(page).toHaveURL(/\/mushaf\/5/)
    await expectPageLoaded(page, 5)
    await page.getByRole('button', { name: 'Back to reader' }).click()
    await expect(page).toHaveURL(/\/(read\/qpc\/\d+)?$|\/$/)
  })
})
