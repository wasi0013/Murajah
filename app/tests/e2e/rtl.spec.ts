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

test('shared chrome externalises — the tab bar and quick-jump palette are Arabic under ar', async ({
  page,
}) => {
  await switchToArabic(page)
  await page.goto('/')
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  await expect(page.getByRole('navigation', { name: 'التنقل الرئيسي' })).toBeVisible()

  await page.getByRole('button', { name: 'انتقل إلى صفحة أو آية أو سورة' }).click()
  await expect(page.getByRole('dialog', { name: 'الانتقال السريع' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'الانتقال السريع' })).toBeVisible()
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

test('the habit catalog (data layer) resolves through the catalog under ar', async ({ page }) => {
  await switchToArabic(page)
  await page.goto('/today')
  await expect(page.getByRole('heading', { name: 'جهّز جلستك', level: 2 })).toBeVisible({
    timeout: 10_000,
  })
  await page.getByRole('button', { name: 'أعدّها بنفسي' }).click()
  // The habit names live in a plain data module (HABIT_CATALOG); this proves they
  // resolve as translation keys rather than frozen English at module-eval time.
  await expect(page.getByRole('switch', { name: 'اتلُ ١٠ آيات' })).toBeVisible()
  await expect(page.getByRole('switch', { name: 'اختبار سريع' })).toBeVisible()
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

// Journal (Phase 12.4.2/12.7.2) — the calendar's own RTL coverage. Mirroring
// comes from the page's own `direction: rtl` (no JS-level weekday reordering,
// see JournalCalendar.vue), so this mainly proves the catalog is wired
// end-to-end (tab label, section headers, event/note copy) and that the
// mirrored grid stays a11y-clean, not just visually plausible.
test('the Journal segment renders in Arabic and stays a11y-clean under RTL', async ({ page }) => {
  await switchToArabic(page)
  const journal = page.getByRole('region', { name: 'اليوميات' })

  await page.goto('/progress?tab=journal')
  await expect(journal).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(journal.getByText('السلسلة الحالية')).toBeVisible()

  // A day cell opens the (Arabic) detail sheet — proves the day-sheet's own
  // catalog wiring, not just the calendar shell.
  const anyCell = journal.locator('td[data-date] button').first()
  await anyCell.click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('خاطرة')).toBeVisible() // the reflection-note section header
  await page.keyboard.press('Escape')

  await page.waitForTimeout(300)
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([])
})
