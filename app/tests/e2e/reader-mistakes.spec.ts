import { test, expect } from '@playwright/test'
import { openSettings, closeSettings } from './helpers'

const firstWord = (page: import('@playwright/test').Page) =>
  page.locator('.surface .word').first()

test('mark mode toggles a persisted mistake; read mode still opens morphology', async ({ page }) => {
  await page.goto('/')
  await expect(firstWord(page)).not.toBeEmpty({ timeout: 10_000 })

  // Switch to mark mode (in settings), then mark the first word.
  await openSettings(page)
  await page.getByRole('radio', { name: 'Mark' }).click()
  await closeSettings(page)
  await firstWord(page).click()
  await expect(firstWord(page)).toHaveClass(/state-mistake/)

  // Persist (debounced) then reload — the mark survives.
  await page.waitForTimeout(500)
  await page.reload()
  await expect(firstWord(page)).not.toBeEmpty({ timeout: 10_000 })
  await expect(firstWord(page)).toHaveClass(/state-mistake/)

  // Mode also persisted (still 'mark'): tapping again unmarks.
  await firstWord(page).click()
  await expect(firstWord(page)).not.toHaveClass(/state-mistake/)

  // Read mode: the same tap opens morphology instead of marking.
  await openSettings(page)
  await page.getByRole('radio', { name: 'Read' }).click()
  await closeSettings(page)
  await firstWord(page).click()
  await expect(page.getByRole('dialog', { name: 'Word morphology' })).toBeVisible({ timeout: 10_000 })
  await expect(firstWord(page)).not.toHaveClass(/state-mistake/)
})

test.describe('mark-color palette', () => {
  test('shows 6 swatches with red selected by default, and hides in read mode', async ({ page }) => {
    await page.goto('/')
    await expect(firstWord(page)).not.toBeEmpty({ timeout: 10_000 })

    const bar = page.getByRole('radiogroup', { name: 'Mark color' })
    await expect(bar).toBeVisible()
    await expect(bar.getByRole('radio')).toHaveCount(6)
    await expect(bar.getByRole('radio', { name: 'Red' })).toHaveAttribute('aria-checked', 'true')

    await openSettings(page)
    await page.getByRole('radio', { name: 'Read' }).click()
    await closeSettings(page)
    await expect(bar).toBeHidden()
  })

  test('paints a tap with the selected color; an already-marked word un-marks regardless of selection', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(firstWord(page)).not.toBeEmpty({ timeout: 10_000 })

    const bar = page.getByRole('radiogroup', { name: 'Mark color' })
    await bar.getByRole('radio', { name: 'Amber' }).click()
    await firstWord(page).click()
    await expect(firstWord(page)).toHaveClass(/state-hl-amber/)
    await expect(firstWord(page)).not.toHaveClass(/state-mistake\b/)

    // Switching the active swatch doesn't repaint an existing mark — tapping
    // the already-marked word just un-marks it, ignoring 'Teal' being active.
    await bar.getByRole('radio', { name: 'Teal' }).click()
    await firstWord(page).click()
    await expect(firstWord(page)).not.toHaveClass(/state-hl-amber|state-hl-teal|state-mistake/)
  })

  test('a mark color survives reload', async ({ page }) => {
    await page.goto('/')
    await expect(firstWord(page)).not.toBeEmpty({ timeout: 10_000 })

    const bar = page.getByRole('radiogroup', { name: 'Mark color' })
    await bar.getByRole('radio', { name: 'Green' }).click()
    await firstWord(page).click()
    await expect(firstWord(page)).toHaveClass(/state-hl-green/)

    await page.waitForTimeout(500) // debounced persistence
    await page.reload()
    await expect(firstWord(page)).not.toBeEmpty({ timeout: 10_000 })
    await expect(firstWord(page)).toHaveClass(/state-hl-green/)

    // The active-swatch selection itself is session-only — back to Red.
    await expect(bar.getByRole('radio', { name: 'Red' })).toHaveAttribute('aria-checked', 'true')
  })
})

// Every other spec runs against the shared onboarded storageState, so the
// reader boots at its real default (mark-mistake) there too — this is the
// one place exercising the real, unseeded first visit end to end.
test.describe('first-time visitor (unseeded storage)', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  // A genuinely fresh visitor hits the non-dismissible language-picker
  // onboarding modal first (see onboarding.spec.ts) — clear it before
  // asserting anything about the reader underneath.
  async function completeOnboarding(page: import('@playwright/test').Page) {
    await page.getByRole('radio', { name: /English/ }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.locator('[role="dialog"]')).toBeHidden()
  }

  test('defaults to mark-mistake mode: a fresh tap marks a word, not morphology', async ({ page }) => {
    await page.goto('/')
    await completeOnboarding(page)
    await expect(firstWord(page)).not.toBeEmpty({ timeout: 10_000 })

    await firstWord(page).click()
    await expect(firstWord(page)).toHaveClass(/state-mistake/)
    await expect(page.getByRole('dialog', { name: 'Word morphology' })).toBeHidden()
  })

  test('defaults to the sepia theme', async ({ page }) => {
    await page.goto('/')
    await completeOnboarding(page)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia')
  })
})
