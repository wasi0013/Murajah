import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/** Let the segmented-control transition finish so axe samples resting colours. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)))
  })
}

// Memorization progress view (Phase 4). Reached from the shell's Progress tab;
// renders the canonical 604-page grid grouped into 30 juz, with a per-page sheet
// to mark memorized and record clean revisions (which award hasanah). Data
// persists to IndexedDB, so marks survive a reload.

const hasanah = (page: Page) => page.locator('.stat--hasanah .stat-n')

test('the shell nav opens the progress view', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  await expect(page).toHaveURL(/\/progress$/)
  await expect(page.getByRole('heading', { name: 'Memorization', level: 1 })).toBeVisible()
})

test('grid renders 604 pages across 30 juz', async ({ page }) => {
  await page.goto('/progress')
  await expect(page.getByRole('button', { name: 'Page 1, not memorized' })).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.locator('.juz')).toHaveCount(30)
  await expect(page.locator('.cell')).toHaveCount(604)
})

test('marking a page memorized persists across reload', async ({ page }) => {
  await page.goto('/progress')
  const cell = page.getByRole('button', { name: 'Page 5, not memorized' })
  await expect(cell).toBeVisible({ timeout: 10_000 })
  await cell.click()

  // Sheet opens for that page; toggle memorized on.
  await expect(page.getByRole('dialog', { name: 'Page 5' })).toBeVisible()
  await page.getByRole('switch', { name: 'Memorized' }).click()
  await page.keyboard.press('Escape')

  // The cell now reports memorized in its accessible name.
  await expect(page.getByRole('button', { name: 'Page 5, memorized' })).toBeVisible()

  // Persist (debounced) then reload — the mark survives.
  await page.waitForTimeout(500)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Page 5, memorized' })).toBeVisible({
    timeout: 10_000,
  })
})

test('recording a clean revision raises strength and awards hasanah', async ({ page }) => {
  await page.goto('/progress')
  await expect(hasanah(page)).toHaveText('0', { timeout: 10_000 })

  await page.getByRole('button', { name: 'Page 8, not memorized' }).click()
  await expect(page.getByRole('dialog', { name: 'Page 8' })).toBeVisible()

  // "Revised today" records a clean recitation from memory: strength 0 → 1
  // (crossing into the "New" band), hasanah increases. Replaced the old raw
  // stepper's "+" button — see ProgressView.vue's recordRevisedToday.
  await page.getByRole('button', { name: 'Revised today' }).click()
  await expect(page.getByRole('combobox', { name: 'Memorization level' })).toHaveValue('1')
  await page.keyboard.press('Escape')

  await expect(hasanah(page)).not.toHaveText('0')
})

test('bulk range mark memorizes a contiguous range', async ({ page }) => {
  await page.goto('/progress')
  await expect(page.getByRole('button', { name: 'Page 1, not memorized' })).toBeVisible({
    timeout: 10_000,
  })

  await page.getByLabel('From page').fill('1')
  await page.getByLabel('To page').fill('3')
  await page.getByRole('button', { name: 'Memorized', exact: true }).click()

  for (const p of [1, 2, 3]) {
    await expect(page.getByRole('button', { name: `Page ${p}, memorized` })).toBeVisible()
  }
})

test('a juz progress bar segments by strength band instead of one flat colour', async ({ page }) => {
  await page.goto('/progress')
  await expect(page.getByRole('button', { name: 'Page 1, not memorized' })).toBeVisible({
    timeout: 10_000,
  })

  // Bulk-mark credits the Da'if (Weak) floor — pages 1-3 start as one band.
  await page.getByLabel('From page').fill('1')
  await page.getByLabel('To page').fill('3')
  await page.getByRole('button', { name: 'Memorized', exact: true }).click()

  const bar = page.locator('[data-juz="1"] .juz-bar')
  await expect(bar.locator('.juz-fill')).toHaveCount(1)

  // Raise page 1 alone to Mastered — the bar now splits into two segments,
  // strongest first, each a different colour (see juzBandSegments).
  await page.getByRole('button', { name: 'Page 1, memorized', exact: false }).click()
  await page.getByRole('combobox', { name: 'Memorization level' }).selectOption('6')
  await page.keyboard.press('Escape')

  const segments = bar.locator('.juz-fill')
  await expect(segments).toHaveCount(2)
  const [firstBg, secondBg] = await segments.evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor))
  expect(firstBg).not.toBe(secondBg)

  // The colour breakdown is never colour-only — the bar's own aria-label
  // names each band's share, strongest first (same order as the segments
  // themselves), same list-building pattern as a cell's label.
  await expect(bar).toHaveAccessibleName(/Mastered.*Weak/s)
})

// —— Mark memorized by surah/juz (9.x) ————————————————————————————————
test('the surah/juz picker opens, defaults to an empty pick, and confirm stays disabled', async ({
  page,
}) => {
  await page.goto('/progress')
  await expect(page.getByRole('button', { name: 'Page 1, not memorized' })).toBeVisible({
    timeout: 10_000,
  })

  await page.getByRole('button', { name: 'Mark by surah or juz' }).click()
  const sheet = page.getByRole('dialog', { name: 'Mark memorized' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('Nothing selected yet.')).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Mark as memorized' })).toBeDisabled()
})

test('picking a juz marks every page in it memorized, and persists', async ({ page }) => {
  await page.goto('/progress')
  await expect(page.getByRole('button', { name: 'Page 1, not memorized' })).toBeVisible({
    timeout: 10_000,
  })

  await page.getByRole('button', { name: 'Mark by surah or juz' }).click()
  const sheet = page.getByRole('dialog', { name: 'Mark memorized' })
  await sheet.getByRole('button', { name: 'Juz 1', exact: true }).click()
  await expect(sheet.getByText('21 pages selected.')).toBeVisible()

  const confirm = sheet.getByRole('button', { name: 'Mark as memorized' })
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await expect(sheet).toBeHidden()

  // Confirms the reward-side effect fired, not just the sheet closing.
  await expect(page.getByRole('status').getByText('21 pages marked memorized.')).toBeVisible()

  // Juz 1 is pages 1–21 (derived nav index) — first, last, and an interior page.
  for (const p of [1, 10, 21]) {
    await expect(page.getByRole('button', { name: `Page ${p}, memorized` })).toBeVisible()
  }
  // Juz 2 starts right after — untouched.
  await expect(page.getByRole('button', { name: 'Page 22, not memorized' })).toBeVisible()

  await page.waitForTimeout(500)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Page 1, memorized' })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: 'Page 21, memorized' })).toBeVisible()
})

test('picking a surah marks only its pages, via the kind switch', async ({ page }) => {
  await page.goto('/progress')
  await expect(page.getByRole('button', { name: 'Page 1, not memorized' })).toBeVisible({
    timeout: 10_000,
  })

  await page.getByRole('button', { name: 'Mark by surah or juz' }).click()
  const sheet = page.getByRole('dialog', { name: 'Mark memorized' })
  await sheet.getByRole('radio', { name: 'Surahs' }).click()
  // Al-Fatihah — a named checkbox row, not a bare number; also a single-page
  // surah, so this proves the singular copy too.
  await sheet.getByRole('checkbox', { name: /Al-Fatihah/ }).check()
  await expect(sheet.getByText('1 page selected.')).toBeVisible()

  await sheet.getByRole('button', { name: 'Mark as memorized' }).click()
  await expect(page.getByRole('button', { name: 'Page 1, memorized' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Page 2, not memorized' })).toBeVisible()
})

test('the surah list shows names, not just numbers, and supports unchecking', async ({ page }) => {
  await page.goto('/progress')
  await expect(page.getByRole('button', { name: 'Page 1, not memorized' })).toBeVisible({
    timeout: 10_000,
  })

  await page.getByRole('button', { name: 'Mark by surah or juz' }).click()
  const sheet = page.getByRole('dialog', { name: 'Mark memorized' })
  await sheet.getByRole('radio', { name: 'Surahs' }).click()

  const fatihah = sheet.getByRole('checkbox', { name: /Al-Fatihah/ })
  await expect(fatihah).toBeVisible()
  // The Arabic name renders alongside the transliteration — a bare "Surah 1"
  // number is exactly what this list is meant to replace.
  await expect(sheet.getByText('الفاتحة')).toBeVisible()

  await fatihah.check()
  const baqarah = sheet.getByRole('checkbox', { name: /Al-Baqarah/ })
  await baqarah.check()
  await expect(sheet.getByText('49 pages selected.')).toBeVisible() // page 1 + pages 2–49

  await fatihah.uncheck()
  await expect(sheet.getByText('48 pages selected.')).toBeVisible()
  await expect(fatihah).not.toBeChecked()
  await expect(baqarah).toBeChecked()
})

test('a surah shared with an unpicked neighbour contributes no pages until the neighbour joins it', async ({
  page,
}) => {
  await page.goto('/progress')
  await expect(page.getByRole('button', { name: 'Page 1, not memorized' })).toBeVisible({
    timeout: 10_000,
  })

  await page.getByRole('button', { name: 'Mark by surah or juz' }).click()
  const sheet = page.getByRole('dialog', { name: 'Mark memorized' })
  await sheet.getByRole('radio', { name: 'Surahs' }).click()

  // Al-Qiyamah (75) spans only pages 577–578, and both are shared with a
  // neighbour (74 and 76 respectively) — picking it alone must resolve to
  // nothing, with a message explaining why, not a silent "nothing selected".
  await sheet.getByRole('checkbox', { name: /^Al-Qiyamah\b/ }).check()
  await expect(sheet.getByText(/shared with surahs you haven.t picked/)).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Mark as memorized' })).toBeDisabled()

  // Picking its neighbour (Al-Insan, 76) completes page 578 — the two surahs'
  // shared boundary — while leaving 577 (shared with 74, not picked) and 580
  // (shared with 77, not picked) untouched.
  await sheet.getByRole('checkbox', { name: /^Al-Insan\b/ }).check()
  await expect(sheet.getByText('2 pages selected.')).toBeVisible()

  await sheet.getByRole('button', { name: 'Mark as memorized' }).click()
  await expect(sheet).toBeHidden()

  await expect(page.getByRole('button', { name: 'Page 578, memorized' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Page 579, memorized' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Page 577, not memorized' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Page 580, not memorized' })).toBeVisible()
})

test('closing the picker without confirming discards the pick', async ({ page }) => {
  await page.goto('/progress')
  await expect(page.getByRole('button', { name: 'Page 1, not memorized' })).toBeVisible({
    timeout: 10_000,
  })

  await page.getByRole('button', { name: 'Mark by surah or juz' }).click()
  const sheet = page.getByRole('dialog', { name: 'Mark memorized' })
  await sheet.getByRole('button', { name: 'Juz 1', exact: true }).click()
  await expect(sheet.getByText('21 pages selected.')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('button', { name: 'Page 1, not memorized' })).toBeVisible()

  // Reopening starts fresh — the discarded pick doesn't linger.
  await page.getByRole('button', { name: 'Mark by surah or juz' }).click()
  await expect(page.getByRole('dialog', { name: 'Mark memorized' }).getByText('Nothing selected yet.')).toBeVisible()
})

test('the summary reports how many of the pick are already memorized', async ({ page }) => {
  await page.goto('/progress')
  await expect(page.getByRole('button', { name: 'Page 1, not memorized' })).toBeVisible({
    timeout: 10_000,
  })

  // Mark page 1 by hand first — juz 1 (pages 1–21) then partially overlaps it.
  await page.getByLabel('From page').fill('1')
  await page.getByLabel('To page').fill('1')
  await page.getByRole('button', { name: 'Memorized', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Page 1, memorized' })).toBeVisible()

  await page.getByRole('button', { name: 'Mark by surah or juz' }).click()
  const sheet = page.getByRole('dialog', { name: 'Mark memorized' })
  await sheet.getByRole('button', { name: 'Juz 1', exact: true }).click()
  await expect(sheet.getByText('21 pages selected.')).toBeVisible()
  await expect(sheet.getByText('1 of these is already memorized.')).toBeVisible()
})

test('grid cells are a roving-tabindex group navigable by arrow keys', async ({ page }) => {
  await page.goto('/progress')
  const cell1 = page.getByRole('button', { name: 'Page 1, not memorized' })
  await expect(cell1).toBeVisible({ timeout: 10_000 })

  await cell1.focus()
  await expect(cell1).toBeFocused()

  // Left/Right move one page; Home/End jump to the ends.
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Page 2, not memorized' })).toBeFocused()
  await page.keyboard.press('End')
  await expect(page.getByRole('button', { name: 'Page 604, not memorized' })).toBeFocused()
  await page.keyboard.press('Home')
  await expect(cell1).toBeFocused()

  // ArrowDown moves by a whole row (more than one page).
  await page.keyboard.press('ArrowDown')
  await expect(cell1).not.toBeFocused()

  // Enter activates the focused cell (opens its sheet).
  await page.keyboard.press('Home')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Page 1' })).toBeVisible()
})

test('the juz-jump bar scrolls the grid to a juz', async ({ page }) => {
  await page.goto('/progress')
  await expect(page.getByRole('button', { name: 'Page 1, not memorized' })).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.locator('[data-juz="30"]')).not.toBeInViewport()

  await page.getByRole('button', { name: 'Jump to juz 30' }).click()
  await expect(page.locator('[data-juz="30"]')).toBeInViewport()
})

test('a recently-memorized chip opens that page and deep-links into the reader', async ({ page }) => {
  await page.goto('/progress')
  await expect(page.getByRole('button', { name: 'Page 1, not memorized' })).toBeVisible({
    timeout: 10_000,
  })

  // Memorize a few pages — they surface in "Recently memorized".
  await page.getByLabel('From page').fill('1')
  await page.getByLabel('To page').fill('3')
  await page.getByRole('button', { name: 'Memorized', exact: true }).click()

  // The chip (exact "Page 2") is distinct from the grid cell ("Page 2, memorized").
  const chip = page.getByRole('button', { name: 'Page 2', exact: true })
  await expect(chip).toBeVisible()
  await chip.click()

  // Opens the per-page sheet, whose "Open in reader" deep-links /page/2.
  await expect(page.getByRole('dialog', { name: 'Page 2' })).toBeVisible()
  await page.getByRole('button', { name: 'Open in reader' }).click()
  await expect(page).toHaveURL(/\/page\/2$/)
})

// —— Analytics tabs (Phase 9.2) ————————————————————————————————————
test('the Juz and Pages tabs render the ported analytics', async ({ page }) => {
  await page.goto('/progress')
  await expect(page.getByRole('button', { name: 'Page 1, not memorized' })).toBeVisible({
    timeout: 10_000,
  })

  // Juz Progress: 30 cells + a completion estimate. With no plan there's no pace,
  // so it prompts for a goal rather than inventing a date.
  await page.getByRole('radio', { name: 'Juz', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Juz 1:/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Juz 30:/ })).toBeVisible()
  await expect(page.getByText(/Set a daily new-page goal/)).toBeVisible()

  // Page-by-page heatmap: 604 dots grouped into 30 juz boxes; a dot deep-links.
  await page.getByRole('radio', { name: 'Pages', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Page 1 — not started' })).toBeVisible()
  await page.getByRole('button', { name: 'Page 42 — not started' }).click()
  await expect(page).toHaveURL(/\/page\/42$/)
})

// The progress chrome must be axe-clean in all three themes. Colour is never the
// only cue (page numbers + mistake dots + labels), which axe can't verify but the
// design guarantees.
const themes = ['light', 'dark', 'sepia'] as const
for (const theme of themes) {
  test(`progress view has no serious a11y violations — ${theme}`, async ({ page }) => {
    await page.goto('/progress')
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expect(page.getByRole('button', { name: 'Page 1, not memorized' })).toBeVisible({
      timeout: 10_000,
    })

    // Scan all three lenses — the Juz gradient + page-dot ramp are the contrast risk.
    for (const lens of ['Juz', 'Pages', 'Overview'] as const) {
      await page.getByRole('radio', { name: lens, exact: true }).click()
      await settle(page)
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      const serious = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      )
      expect(
        serious,
        `${theme}/${lens}: ${JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.length })))}`,
      ).toEqual([])
    }

    // The surah/juz picker sheet, opened over the Overview lens. The sheet's own
    // slide/fade-in transition can still be mid-flight when `toBeVisible` resolves
    // (opacity isn't part of Playwright's visibility check) — give it a moment to
    // start before `settle` waits out whatever's left, so axe samples resting colours.
    await page.getByRole('button', { name: 'Mark by surah or juz' }).click()
    await expect(page.getByRole('dialog', { name: 'Mark memorized' })).toBeVisible()
    await page.waitForTimeout(250)
    await settle(page)
    const pickerResults = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const pickerSerious = pickerResults.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    )
    expect(
      pickerSerious,
      `${theme}/pick-sheet: ${JSON.stringify(pickerSerious.map((v) => ({ id: v.id, nodes: v.nodes.length })))}`,
    ).toEqual([])

    // The surah checkbox list — new interactive surface (native checkbox +
    // `accent-color`) the juz-default sweep above never reaches.
    await page.getByRole('radio', { name: 'Surahs' }).click()
    await page.waitForTimeout(250)
    await settle(page)
    const surahResults = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const surahSerious = surahResults.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    )
    expect(
      surahSerious,
      `${theme}/pick-sheet-surahs: ${JSON.stringify(surahSerious.map((v) => ({ id: v.id, nodes: v.nodes.length })))}`,
    ).toEqual([])

    await page.keyboard.press('Escape')
  })
}
