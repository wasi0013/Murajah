import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Audio (Phase 7). Drives the real player UI against the built app. Actual audio
// bytes stream from external CDNs and can't play deterministically in CI, so these
// assert the wiring and UI states (grain, reciter, AB-repeat, layout gating, live,
// record) rather than audible playback — which is unit-covered by the engine tests.

async function openReaderPlayer(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Recitation audio' }).click()
  await expect(page.locator('.player')).toBeVisible()
}

/**
 * A minimal valid mono PCM WAV (silence), long enough to actually let a real
 * `<audio>` element's `currentTime` advance for a few seconds of real playback.
 * Browsers determine playability from the response's `Content-Type`, not the
 * request's URL suffix, so this can stand in for a `.mp3` request. Used to test
 * real elapsed-time behavior (e.g. AB-repeat marking two genuinely different
 * timestamps) without depending on the external CDNs actually being reachable
 * from CI — this suite otherwise deliberately avoids relying on that (see the
 * top-of-file note).
 */
function silentWav(seconds: number, sampleRate = 8000): Buffer {
  const frames = seconds * sampleRate
  const dataSize = frames * 2 // 16-bit mono
  const buf = Buffer.alloc(44 + dataSize)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28) // byte rate
  buf.writeUInt16LE(2, 32) // block align
  buf.writeUInt16LE(16, 34) // bits per sample
  buf.write('data', 36)
  buf.writeUInt32LE(dataSize, 40)
  // Remaining bytes are already zeroed (silence) by Buffer.alloc.
  return buf
}

/** Serve every recitation-audio request as real, locally-decodable silence. */
async function mockPlayableAudio(page: Page, seconds = 5): Promise<void> {
  const wav = silentWav(seconds)
  await page.route(/\.mp3(\?.*)?$/, (route) =>
    route.fulfill({ status: 200, contentType: 'audio/wav', body: wav }),
  )
}

test('the headphones control opens the mini-player', async ({ page }) => {
  await openReaderPlayer(page)
  await expect(page.getByRole('radio', { name: 'Verse' })).toBeVisible()
})

test('the grain toggle switches between Verse and Page', async ({ page }) => {
  await openReaderPlayer(page)
  const verse = page.getByRole('radio', { name: 'Verse' })
  const pageGrain = page.getByRole('radio', { name: 'Page' })
  await expect(verse).toHaveAttribute('aria-checked', 'true')
  await pageGrain.click()
  await expect(pageGrain).toHaveAttribute('aria-checked', 'true')
})

test('the tray shows repeat/spaced-drill controls in verse grain and hides them in page grain', async ({ page }) => {
  // BUG regression: these used to render unconditionally, including in page
  // grain, where useQariPlayer never wires repeatCount/spaced into playback.
  await openReaderPlayer(page)
  await expect(page.getByRole('radio', { name: 'Verse' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: 'More controls' }).click()
  await expect(page.getByText('Repetition')).toBeVisible()

  await page.getByRole('radio', { name: 'Page' }).click()
  await expect(page.getByText('Repetition')).toHaveCount(0)
})

test('page mode is disabled in Indopak layout (decision 6)', async ({ page }) => {
  // Deep-link to an Indopak page, then open the player.
  await page.goto('/read/indopak/3')
  await page.getByRole('button', { name: 'Recitation audio' }).click()
  await expect(page.locator('.player')).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Page' })).toBeDisabled()
  await expect(page.getByRole('radio', { name: 'Verse' })).toBeEnabled()
})

test('the reciter picker lists reciters and selecting one updates the player', async ({ page }) => {
  await openReaderPlayer(page)
  await page.locator('.reciter').click()
  const option = page.getByRole('option', { name: 'Mishary Rashid Al Afasy' })
  await expect(option).toBeVisible()
  await option.click()
  await expect(page.locator('.reciter')).toHaveText('Mishary Rashid Al Afasy')
})

test('AB-repeat: setting A then B starts the loop (decision 7a)', async ({ page }) => {
  // Marking A and B needs two genuinely different timestamps to produce a real,
  // loopable region (a same-instant double-mark is a degenerate zero-width region
  // and correctly does NOT arm a loop — see the abRepeat.ts zero-width-region
  // fix). Real elapsed playback time is what a user would naturally produce, but
  // this suite can't rely on the external CDNs being reachable from CI, so a
  // locally-served silent WAV stands in for the recitation audio.
  await mockPlayableAudio(page)
  await openReaderPlayer(page)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.getByRole('button', { name: 'More controls' }).click()
  const a = page.locator('.chip.ab').first()
  const b = page.locator('.chip.ab').nth(1)
  const loop = page.getByRole('button', { name: 'Loop' })
  await expect(loop).toHaveAttribute('aria-pressed', 'false')
  await a.click()
  await page.waitForTimeout(1000)
  await b.click()
  await expect(loop).toHaveAttribute('aria-pressed', 'true') // auto-on when both set
})

test('AB-repeat: the Loop button is always usable, even before any A/B marker is set', async ({ page }) => {
  // Regression: Loop used to be disabled until a marker existed, making "just loop
  // the whole thing" impossible without first fiddling with A/B. What it does when
  // pressed (loop the whole item vs. from a marker) is unit-covered in
  // audio-engine.test.ts, since it depends on the track's duration.
  await openReaderPlayer(page)
  await page.getByRole('button', { name: 'More controls' }).click()
  const loop = page.getByRole('button', { name: 'Loop' })
  await expect(loop).toBeEnabled()
})

test('the reader tags words with their verse for highlight sync', async ({ page }) => {
  await page.goto('/')
  // Words render from real data; each carries a data-verse anchor (7.4 mapping).
  const firstWord = page.locator('.surface .word').first()
  await expect(firstWord).toBeVisible({ timeout: 15_000 })
  await expect(firstWord).toHaveAttribute('data-verse', /^\d+:\d+$/)
})

test('a toggle changed right before closing the reader player still persists (BUG: dispose used to drop the debounced write)', async ({ page }) => {
  // Unlike Today/Listen, the reader/mushaf's AudioHost — and its persistence
  // instance — is mounted only while `audio.open` is true (v-if in ReaderView/
  // MushafView). Closing the player unmounts it immediately, well inside the
  // 300ms debounce, so this is the one path that actually exercises dispose()'s
  // flush rather than the normal debounced save.
  await openReaderPlayer(page)
  await page.getByRole('button', { name: 'More controls' }).click()
  const loopList = page.getByLabel('Loop list')
  await expect(loopList).not.toBeChecked()
  await loopList.check()
  await page.getByRole('button', { name: 'Close player' }).click() // no wait — inside the debounce
  await expect(page.locator('.player')).toHaveCount(0)

  await page.reload()
  await page.getByRole('button', { name: 'Recitation audio' }).click()
  await page.getByRole('button', { name: 'More controls' }).click()
  await expect(page.getByLabel('Loop list')).toBeChecked()
})

test('the mushaf view opens the player over its visible spread', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/mushaf/3')
  await page.getByRole('button', { name: 'Recitation audio' }).click()
  await expect(page.locator('.player')).toBeVisible()
  // In QPC page numbering the mushaf offers page grain (double-page is unit-covered).
  await expect(page.getByRole('radio', { name: 'Page' })).toBeEnabled()
})

test('record panel opens with a record control', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Record your recitation' }).click()
  // Chromium supports MediaRecorder, so the record button shows (we don't capture).
  await expect(page.getByRole('button', { name: /Record page/ })).toBeVisible()
})

test('live recitation opens as a full view from More and a channel starts the embed', async ({ page }) => {
  // "More" is a mobile-only affordance — desktop unpacks it as an inline rail tab.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('button', { name: /Live recitation/ }).click()
  await expect(page).toHaveURL(/\/live$/)
  await page.getByRole('button', { name: /Makkah Live/ }).click()
  await expect(page.locator('iframe[title="Live recitation stream"]')).toBeVisible()
})

/** Wait for running transitions so axe samples resting colours. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)))
    await frame()
    await frame()
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)))
  })
}

async function expectAxeClean(page: Page, label: string) {
  await settle(page)
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(serious, `${label}: ${JSON.stringify(serious.map((v) => v.id))}`).toEqual([])
}

for (const theme of ['light', 'dark', 'sepia'] as const) {
  test(`player has no serious a11y violations — ${theme}`, async ({ page }) => {
    await openReaderPlayer(page)
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expectAxeClean(page, `${theme} — player`)
    // Expand the advanced tray and re-check.
    await page.getByRole('button', { name: 'More controls' }).click()
    await expect(page.getByRole('button', { name: 'Loop' })).toBeVisible()
    await expectAxeClean(page, `${theme} — tray`)
  })
}
