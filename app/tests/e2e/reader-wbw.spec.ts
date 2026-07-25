import { test, expect } from '@playwright/test'
import { openSettings } from './helpers'

test('word-by-word: toggle shows glosses, only the page surah loads, en↔bn swaps', async ({
  page,
}) => {
  const trReqs: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/data/tr/')) trReqs.push(r.url())
  })

  await page.goto('/') // page 1 = Al-Fatiha (surah 1)
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
  await expect(page.locator('.gloss')).toHaveCount(0) // off by default
  await openSettings(page)

  await page.getByRole('switch', { name: 'Word-by-word translation' }).click()

  // Glosses appear with English text; only surah 1's chunk is fetched.
  const firstGloss = page.locator('.gloss').first()
  await expect(firstGloss).not.toBeEmpty({ timeout: 10_000 })
  const en = await firstGloss.innerText()
  // Dataset URLs carry a `?v=<hash>` cache-buster (see paths.ts).
  expect(trReqs.some((u) => /\/data\/tr\/en\/1\.json\?v=/.test(u))).toBe(true)
  // Only the window's surahs load (p1=Fatiha s1, prefetched p2=Baqarah s2) —
  // never the whole set of 114.
  expect(trReqs.every((u) => /\/tr\/en\/[12]\.json\?v=/.test(u))).toBe(true)

  // Switch to Bengali → text changes, bn chunk loads.
  await page.getByRole('radio', { name: 'বাংলা' }).click()
  await expect.poll(() => firstGloss.innerText()).not.toBe(en)
  expect(trReqs.some((u) => /\/data\/tr\/bn\/1\.json\?v=/.test(u))).toBe(true)

  // Toggle off → glosses removed.
  await page.getByRole('switch', { name: 'Word-by-word translation' }).click()
  await expect(page.locator('.gloss')).toHaveCount(0)
})
