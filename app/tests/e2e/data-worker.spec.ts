import { test, expect } from '@playwright/test'

test('reader loads page 1 data + fonts through the Web Worker', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (r) => {
    const url = r.url()
    if (url.includes('/data/') || url.includes('/fonts/')) requests.push(url)
  })

  await page.goto('/')

  // Page 1 renders only after the DataClient fetches + the font resolves.
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })

  // Data was actually fetched (manifest + page 1 chunk) through the worker.
  // Dataset/index URLs carry a `?v=<hash>` cache-buster (manifest.json itself
  // deliberately does not — it's the trust anchor those hashes are checked
  // against, so it stays at a fixed, unversioned path).
  expect(requests.some((u) => u.endsWith('/data/manifest.json'))).toBe(true)
  expect(requests.some((u) => /\/data\/qpc\/pages\/1\.json\?v=/.test(u))).toBe(true)

  // Tajweed is on by default, so the coloured tajweed font loads for the current
  // page (+ the prefetched neighbour) — never the whole 604-page set.
  await expect
    .poll(() => requests.filter((u) => u.includes('/fonts/tajweed/')).length)
    .toBeGreaterThanOrEqual(1)
  expect(requests.some((u) => u.endsWith('/fonts/tajweed/p1.woff2'))).toBe(true)
  expect(requests.some((u) => u.endsWith('/fonts/tajweed/p2.woff2'))).toBe(true)
  const fontReqs = requests.filter((u) => u.includes('/fonts/'))
  expect(fontReqs.length).toBeLessThan(6) // window + prefetch, not 604
})
