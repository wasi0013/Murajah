import { test, expect } from '@playwright/test'

test('reader loads page 1 data through the Web Worker', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (r) => {
    const url = r.url()
    if (url.includes('/data/')) requests.push(url)
  })

  await page.goto('/')

  // The status line is populated only after the DataClient fetches the chunk.
  await expect(page.getByTestId('page-status')).toHaveText(/page 1 · \d+ words · \d+ lines/, {
    timeout: 10_000,
  })

  // The first QPC glyph rendered (non-empty Arabic text).
  await expect(page.getByTestId('first-word')).not.toBeEmpty()

  // Data was actually fetched (manifest + page chunk).
  expect(requests.some((u) => u.endsWith('/data/manifest.json'))).toBe(true)
  expect(requests.some((u) => u.endsWith('/data/qpc/pages/1.json'))).toBe(true)
})
