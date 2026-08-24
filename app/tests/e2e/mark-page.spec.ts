import { test, expect, type Page } from '@playwright/test'

// Partial-page memorization tracking (plans/partial-page-tracking.md) — the
// one flow none of the unit/component tests exercise: the real
// `MarkPageView.vue` UI, reached from Today, across a simulated day change.
// `mark-page-view.test.ts` covers the component in isolation; this walks the
// same two-day story `tasks/plan.md`'s final checkpoint flagged as the
// remaining gap — mark verses on day one, advance the clock, reopen
// `/memorize` and see prior marks pre-highlighted from disk (not a session
// artifact), finish the page, and watch the front advance, all through
// Today's streak, journal, and calendar surfaces.
//
// Page 40 (from today.spec.ts's own "new memorization" precedent) has three
// ayahs across its 15 lines: 2:246 (lines 1-5, plus half of 6), 2:247 (the
// other half of 6, lines 7-11), 2:248 (lines 12-15) — so marking 246 alone
// lands on a clean "5 of 15 lines" and marking 247 on top lands on "11 of 15".

const WEDNESDAY = new Date('2026-07-15T09:00:00')
const THURSDAY = new Date('2026-07-16T09:00:00')
const DAY1 = '2026-07-15'
const DAY2 = '2026-07-16'

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(WEDNESDAY)
})

function plan(over: Record<string, unknown> = {}) {
  return {
    scope: { kind: 'all-memorized' },
    newFront: { layout: 'qpc', nextPage: 40 },
    pace: { newPagesPerDay: 1, revisionPagesPerDay: 0, weakPagesPerDay: 0, daysPerWeek: 7, offDays: [] },
    habits: [],
    startDate: DAY1,
    createdAt: `${DAY1}T00:00:00.000Z`,
    ...over,
  }
}

const PROGRESS = { memorized: [], perfectRevisions: {}, hasanah: 0, reviewData: {} }

async function seed(page: Page, records: Record<string, unknown>) {
  await page.evaluate(
    (recs) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('murajah-userdata', 1)
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains('data')) req.result.createObjectStore('data')
        }
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const tx = req.result.transaction('data', 'readwrite')
          for (const [key, value] of Object.entries(recs)) tx.objectStore('data').put(value, key)
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        }
      }),
    records,
  )
}

async function readKey<T>(page: Page, key: string): Promise<T> {
  return page.evaluate(
    (k) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('murajah-userdata', 1)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const get = req.result.transaction('data', 'readonly').objectStore('data').get(k)
          get.onsuccess = () => resolve(get.result)
          get.onerror = () => reject(get.error)
        }
      }),
    key,
  ) as Promise<T>
}

/** Boot once so the DB exists, seed, then reload so hydration reads the records. */
async function open(page: Page, records: Record<string, unknown>) {
  await page.goto('/today')
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible()
  await seed(page, records)
  await page.reload()
}

const journal = (page: Page) => page.getByRole('region', { name: 'Journal' })
const wordAt = (page: Page, verse: string) => page.locator(`[data-verse="${verse}"]`).first()

test('marking verses across two days tracks the streak, journal, and page graduation from real disk state', async ({
  page,
}) => {
  await open(page, { progress: PROGRESS, plan: plan() })
  await expect(page.getByRole('heading', { name: 'New memorization' })).toBeVisible({ timeout: 10_000 })

  // —— Day 1: open the marking view from Today, mark the first verse ——
  await page.getByRole('button', { name: 'Open page 40 to mark memorized verses' }).click()
  await expect(page).toHaveURL(/\/memorize$/)
  await expect(page.getByText('Page 40', { exact: true })).toBeVisible()
  await expect(page.getByText('Tap a verse to mark it memorized.')).toBeVisible()

  const words246 = page.locator('[data-verse="2:246"]')
  await expect(words246.first()).toBeVisible()
  await expect(words246.first()).not.toHaveClass(/state-hl-green/)

  await wordAt(page, '2:246').click()
  await expect(words246.first()).toHaveClass(/state-hl-green/)
  await expect(page.getByText('5 of 15 lines')).toBeVisible()

  await page.waitForTimeout(500) // the debounced write
  const day1Progress = await readKey<{ page: number; marks: { surah: number; ayah: number }[] }>(
    page,
    'partialProgress',
  )
  expect(day1Progress).toEqual({ page: 40, marks: [{ surah: 2, ayah: 246 }] })

  // —— Back to Today: the row shows the fill visual but stays open, and the
  // day still completes (this plan's only task today is the front page) ——
  await page.getByRole('link', { name: 'Back to Today' }).click()
  await expect(page).toHaveURL(/\/today$/)

  await expect(page.locator('.line-fill-label')).toHaveText('5 of 15 lines')
  await expect(page.locator('.row').first()).not.toContainText('Done')
  await expect(page.getByText('Today is complete')).toBeVisible()
  await expect(page.locator('.streak-n')).toHaveText('1 day') // partial progress still completes the streak

  // —— The journal narrates it, and the calendar shows a completed day ——
  await page.getByRole('button', { name: 'View your practice history' }).click()
  await expect(page).toHaveURL(/\/progress\?tab=journal/)
  await expect(journal(page).locator(`[data-date="${DAY1}"] .cell-completed`)).toBeAttached()

  await journal(page).locator(`[data-date="${DAY1}"] button`).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('Progress changes')).toBeVisible()
  await expect(sheet).toContainText('Verse 246 memorized')
  await expect(sheet.getByRole('button', { name: 'Page 40' })).toBeVisible()
  await page.keyboard.press('Escape')

  // —— Day 2: a fresh visit (not a same-session navigation) must hydrate the
  // prior mark from disk, not lose it ——
  await page.clock.setFixedTime(THURSDAY)
  await page.goto('/memorize')
  await expect(page.getByText('Page 40', { exact: true })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('5 of 15 lines')).toBeVisible()
  await expect(page.locator('[data-verse="2:246"]').first()).toHaveClass(/state-hl-green/)

  // Finish the page: the second verse, then the third graduates it.
  await wordAt(page, '2:247').click()
  await expect(page.getByText('11 of 15 lines')).toBeVisible()
  await wordAt(page, '2:248').click()

  // The view flows to the new front page automatically — no redirect needed.
  await expect(page.getByText('Page 41', { exact: true })).toBeVisible({ timeout: 10_000 })

  await page.waitForTimeout(500) // the debounced write
  const storedPlan = await readKey<{ newFront: { nextPage: number } }>(page, 'plan')
  expect(storedPlan.newFront.nextPage).toBe(41)
  const storedProgress = await readKey<{ memorized: number[] }>(page, 'progress')
  expect(storedProgress.memorized).toContain(40)
  const storedPartial = await readKey<undefined>(page, 'partialProgress')
  expect(storedPartial).toBeUndefined() // cleared (the key is deleted) once the page graduated

  // —— Today reflects the graduation: page 40 is Done, not tomorrow's page 41
  // (today's one-new-page budget is already spent), and the streak carries
  // over both days ——
  await page.goto('/today')
  await expect(page.getByRole('heading', { name: 'New memorization' })).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.row').first()).toContainText('Page 40')
  await expect(page.locator('.row').first()).toContainText('Done')
  await expect(page.getByText('Page 41', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Today is complete')).toBeVisible()
  await expect(page.locator('.streak-n')).toHaveText('2 days')

  // Day 2's journal entry reflects only that day's own delta (248 was the
  // last verse newly covered by this session's taps), same "current page
  // only" narration as day one.
  await page.getByRole('button', { name: 'View your practice history' }).click()
  await journal(page).locator(`[data-date="${DAY2}"] button`).click()
  await expect(page.getByRole('dialog')).toContainText('Verse 248 memorized')
})
