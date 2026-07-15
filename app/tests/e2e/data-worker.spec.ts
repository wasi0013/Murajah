import { test, expect } from '@playwright/test'

test('reader loads page 1 data through the Web Worker', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (r) => {
    const url = r.url()
    if (url.includes('/data/') || url.includes('/fonts/')) requests.push(url)
  })

  await page.goto('/')

  // The status line is populated only after the DataClient fetches the chunk.
  await expect(page.getByTestId('page-status')).toHaveText(/page 1 · \d+ words · \d+ lines/, {
    timeout: 10_000,
  })

  // The first QPC glyph rendered (non-empty Arabic text).
  await expect(page.getByTestId('first-word')).not.toBeEmpty()

  // Data was actually fetched (manifest + page chunk) through the worker.
  expect(requests.some((u) => u.endsWith('/data/manifest.json'))).toBe(true)
  expect(requests.some((u) => u.endsWith('/data/qpc/pages/1.json'))).toBe(true)

  // Only the current page's font loads eagerly (not all 604), plus a prefetch
  // of the next page — never the whole set.
  await expect
    .poll(() => requests.filter((u) => u.includes('/fonts/qpc-v2/')).length)
    .toBeGreaterThanOrEqual(1)
  expect(requests.some((u) => u.endsWith('/fonts/qpc-v2/p1.woff2'))).toBe(true)
  expect(requests.some((u) => u.endsWith('/fonts/qpc-v2/p2.woff2'))).toBe(true)
  const qpcFontReqs = requests.filter((u) => u.includes('/fonts/qpc-v2/'))
  expect(qpcFontReqs.length).toBeLessThan(5) // current + prefetch, not 604
})
