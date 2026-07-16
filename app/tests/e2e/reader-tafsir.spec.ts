import { test, expect } from '@playwright/test'

test('verse-study panel: translations upfront, Arabic tafsir on demand, mushaf untouched', async ({
  page,
}) => {
  const tafReqs: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/data/tafsir/')) tafReqs.push(r.url())
  })

  await page.goto('/read/qpc/22') // Al-Baqarah 142-145
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  await expect(page.locator('.study')).toHaveCount(0)

  await page.getByRole('switch', { name: 'Tafsir and translations' }).click()

  const study = page.locator('.study')
  await expect(study).toBeVisible({ timeout: 10_000 })
  // One card per page verse, each with Arabic + both translations + attributions.
  await expect(study.locator('.verse')).toHaveCount(4)
  const first = study.locator('.verse').first()
  await expect(first.locator('.badge')).toHaveText('2:142')
  await expect(first.locator('.arabic')).not.toBeEmpty()
  await expect(first.getByText('— Saheeh International')).toBeVisible()
  await expect(first.getByText('— Dr. Abu Bakr Muhammad Zakaria')).toBeVisible()

  // Only en + bn translations load upfront; the (large) Arabic tafsir does NOT.
  expect(tafReqs.some((u) => u.endsWith('/data/tafsir/en/2.json'))).toBe(true)
  expect(tafReqs.some((u) => u.endsWith('/data/tafsir/bn/2.json'))).toBe(true)
  expect(tafReqs.some((u) => u.includes('/tafsir/ar/'))).toBe(false)

  // Expanding a verse's Tafsir loads the Arabic tafsir on demand.
  await first.locator('.tafsir-summary').click()
  await expect(first.locator('.tafsir-html')).toBeVisible({ timeout: 10_000 })
  expect(tafReqs.some((u) => u.endsWith('/data/tafsir/ar/2.json'))).toBe(true)

  // The 15-line mushaf above is untouched.
  await expect(page.locator('.col[aria-hidden="false"] .surface .word').first()).not.toBeEmpty()

  await page.getByRole('switch', { name: 'Tafsir and translations' }).click()
  await expect(page.locator('.study')).toHaveCount(0)
})
