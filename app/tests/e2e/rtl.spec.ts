import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// RTL audit (Phase 9.5.2). Choosing Arabic paints <html dir="rtl">, and because
// that lives on the document root it carries across SPA navigation to every
// surface. These smoke checks confirm the direction propagates and the chrome
// still renders and stays a11y-clean once the layout mirrors — the CSS uses
// logical properties (margin/padding/border-inline, text-align: start) so no
// surface should clip or overlap in RTL.

async function switchToArabic(page: import('@playwright/test').Page) {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible({
    timeout: 10_000,
  })
  await page.getByRole('radio', { name: 'العربية' }).click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
}

test('RTL direction carries across navigation to the reader and progress', async ({ page }) => {
  await switchToArabic(page)
  const html = page.locator('html')

  await page.goto('/progress')
  await expect(html).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('heading', { name: 'الحفظ', level: 1 })).toBeVisible({
    timeout: 10_000,
  })

  await page.goto('/')
  await expect(html).toHaveAttribute('dir', 'rtl')
  // The reader top bar reads its labels from the catalog, so its controls carry
  // Arabic accessible names once ar is active.
  await expect(page.getByRole('button', { name: 'إعدادات القارئ' })).toBeVisible({
    timeout: 10_000,
  })
})

test('Quiz externalises its chrome — the title and setup copy are Arabic under ar', async ({
  page,
}) => {
  await switchToArabic(page)
  await page.goto('/quiz')
  await expect(page.getByRole('heading', { name: 'اختبار' })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('التدرّب من')).toBeVisible()
  await expect(page.getByRole('button', { name: 'ابدأ التدرّب' })).toBeVisible()
})

test('Audio player externalises its chrome — controls carry Arabic accessible names under ar', async ({
  page,
}) => {
  await switchToArabic(page)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'تلاوة صوتية' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'تلاوة صوتية' }).click()
  await expect(page.getByRole('radiogroup', { name: 'وحدة التشغيل' })).toBeVisible()
})

test('Today externalises its chrome — the set-up heading is Arabic under ar', async ({ page }) => {
  await switchToArabic(page)
  await page.goto('/today')
  // No plan yet, so the empty-state call to action shows; its heading proves the
  // Today surface reads from the catalog rather than a hardcoded English string.
  await expect(page.getByRole('heading', { name: 'جهّز جلستك', level: 2 })).toBeVisible({
    timeout: 10_000,
  })
})

test('progress surface has no serious a11y violations in RTL', async ({ page }) => {
  await switchToArabic(page)
  await page.goto('/progress')
  await expect(page.getByRole('heading', { name: 'الحفظ', level: 1 })).toBeVisible({
    timeout: 10_000,
  })
  await page.waitForTimeout(300)

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  )
  expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([])
})
