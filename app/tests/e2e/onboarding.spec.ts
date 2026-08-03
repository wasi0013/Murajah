import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// First-run onboarding: a required language pick before anything else. Every
// other spec runs against a storageState pre-seeded with `onboardingCompleted`
// (see global-setup.ts) so this is the one place exercising the real,
// unseeded first visit — a genuinely empty browser storage.
test.use({ storageState: { cookies: [], origins: [] } })

test('shows on first visit, blocks the app, and applies the pick live', async ({ page }) => {
  await page.goto('/')
  // Locale-independent — the dialog's accessible name is `t('onboarding.title')`,
  // which switches to Arabic the moment a language is picked below, so a
  // name-scoped locator would silently stop matching (and any `toBeHidden`
  // assertion against it would pass vacuously, proving nothing).
  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible()

  // Non-dismissible: neither Escape nor a scrim click closes it.
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await page.mouse.click(10, 10)
  await expect(dialog).toBeVisible()

  const html = page.locator('html')
  const continueBtn = page.getByRole('button', { name: 'Continue' })
  await expect(continueBtn).toBeDisabled()

  await page.getByRole('radio', { name: 'العربية' }).click()
  await expect(html).toHaveAttribute('dir', 'rtl')
  await expect(html).toHaveAttribute('lang', 'ar')
  // The modal's own copy re-renders in the picked language too.
  await expect(page.getByRole('button', { name: 'متابعة' })).toBeEnabled()

  await page.getByRole('button', { name: 'متابعة' }).click()
  await expect(dialog).toBeHidden()

  // Persists — no re-prompt, language sticks — across a reload.
  await page.waitForTimeout(300) // let the fire-and-forget pref write commit
  await page.reload()
  await expect(dialog).toBeHidden()
  await expect(html).toHaveAttribute('dir', 'rtl')
})

test('has no serious a11y violations', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[role="dialog"]')).toBeVisible()
  await page.waitForTimeout(350) // let the fade-in settle before measuring

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([])
})
