import { test, expect, type Locator } from '@playwright/test'
import { openSettings, closeSettings } from './helpers'

// Surah/juz jumps land on the right *page* even for a surah/juz that starts
// mid-page, but historically only that — the reader never scrolled down to the
// actual start line, leaving the user to hunt for it. These assert the exact
// line ends up onscreen, not just the page. A phone-sized viewport is used
// deliberately: a full mushaf page can otherwise fit inside a tall desktop
// viewport with no scrolling needed at all, which would make this assertion
// pass regardless of whether the scroll-into-view logic actually ran.
test.use({ viewport: { width: 390, height: 667 } })

async function expectOnscreen(locator: Locator) {
  await expect(locator).toBeVisible({ timeout: 10_000 })
  await expect(async () => {
    const box = await locator.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y + box!.height).toBeLessThanOrEqual(667)
  }).toPass({ timeout: 2_000 })
}

test('jumping to a surah that starts mid-page scrolls to its exact line', async ({ page }) => {
  // Al-Ma'idah (5) starts partway down QPC page 106 (juz 4 ends above it).
  await page.goto('/5')
  await expect(page).toHaveURL(/\/5$/)
  await expect(page.getByText(/Page 106 \//)).toBeVisible({ timeout: 10_000 })
  await expectOnscreen(page.locator('.word[data-verse="5:1"]').first())
})

test('jumping to a juz that starts mid-page scrolls to its exact line', async ({ page }) => {
  await page.goto('/contents')
  await page.getByRole('radio', { name: 'Juz' }).click()
  // Juz 4 starts at 3:93, partway down QPC page 62.
  const juz4 = page.getByRole('button', { name: /^Juz 4/ })
  await expect(juz4).toBeVisible({ timeout: 10_000 })
  await juz4.click()
  await expect(page).toHaveURL(/\/3\/93$/)
  await expect(page.getByText(/Page 62 \//)).toBeVisible({ timeout: 10_000 })
  await expectOnscreen(page.locator('.word[data-verse="3:93"]').first())
})

test('an ayah deep-link off the initial screen still scrolls into view', async ({ page }) => {
  // The last ayah on QPC page 42 — reproduces the pre-existing gap where the
  // scroll watcher never fired on a fresh mount (non-immediate watch + the
  // surface remounting with activeVerse already set).
  await page.goto('/2/256')
  await expect(page).toHaveURL(/\/2\/256$/)
  await expectOnscreen(page.locator('.word[data-verse="2:256"]').first())
})

test('jumping to a mid-page surah while in tafsir mode still scrolls to its exact verse', async ({
  page,
}) => {
  // Reproduces the tafsir-view gap: useVerseStudy loads a page's entries
  // asynchronously, so a jump can set the target verse before that page's
  // `.verse` elements exist in the DOM yet — a scroll that only reacts to the
  // verse key (not to entries finishing loading) silently misses, with no retry.
  await page.goto('/read/qpc/1')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  await openSettings(page)
  await page.getByRole('switch', { name: 'Tafsir and translations' }).click()
  await closeSettings(page)
  await expect(page.locator('.study')).toBeVisible({ timeout: 10_000 })

  await page.goto('/contents')
  await page.getByRole('radio', { name: 'Juz' }).click()
  // Juz 4 starts at 3:93, partway down QPC page 62.
  const juz4 = page.getByRole('button', { name: /^Juz 4/ })
  await expect(juz4).toBeVisible({ timeout: 10_000 })
  await juz4.click()
  await expect(page).toHaveURL(/\/3\/93$/)

  const study = page.locator('.study')
  await expect(study).toBeVisible({ timeout: 10_000 })
  // The verse *card* can be taller than the viewport (Arabic + two translations),
  // so `block: 'center'` can't always fit the whole thing on phone-sized screens —
  // check its badge (a small, unambiguous anchor) instead of the whole card.
  await expectOnscreen(study.locator('.verse[data-verse="3:93"] .badge'))
})
