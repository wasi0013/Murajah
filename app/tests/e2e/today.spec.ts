import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Today (Phase 5.4) — the merged practice loop. Seeds IndexedDB with memorized
// pages + a plan, then drives the queue: completing a revision advances the ring
// and survives a reload, pages deep-link into the reader, and the off-day /
// no-plan states render. Storage shapes are the `progress` / `plan` keys of
// murajah-userdata (see core/storage/userData).

const PROGRESS = {
  memorized: [1, 2, 3],
  perfectRevisions: {},
  hasanah: 0,
  reviewData: {},
}

/** `YYYY-MM-DD` for the browser's local today — plans and the day log are local-dated. */
function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function plan(over: Record<string, unknown> = {}) {
  return {
    scope: { kind: 'all-memorized' },
    newFront: null,
    pace: {
      newPagesPerDay: 0,
      revisionPagesPerDay: 5,
      weakPagesPerDay: 0,
      daysPerWeek: 7,
      offDays: [],
    },
    habits: [],
    startDate: localToday(),
    createdAt: new Date().toISOString(),
    ...over,
  }
}

/** Write records straight into the app's IndexedDB store. */
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

/** Read one record back out of the app's store. */
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

const ring = (page: Page) => page.locator('.ring-text')

test('the Today tab in the reader opens the practice loop', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Today' }).click()
  await expect(page).toHaveURL(/\/today$/)
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible()
})

test('with a plan and memorized pages, Today renders the revision queue', async ({ page }) => {
  await open(page, { progress: PROGRESS, plan: plan() })

  await expect(page.getByRole('heading', { name: 'Revision' })).toBeVisible({ timeout: 10_000 })
  // Never-reviewed memorized pages fill a fresh plan's first cycle.
  await expect(page.locator('.row')).toHaveCount(3)
  await expect(ring(page)).toHaveText('0/3')
})

test('completing a revision advances the ring and persists across reload', async ({ page }) => {
  await open(page, { progress: PROGRESS, plan: plan() })
  await expect(ring(page)).toHaveText('0/3', { timeout: 10_000 })

  await page.getByRole('button', { name: 'Page 1 recited cleanly' }).click()
  await expect(ring(page)).toHaveText('1/3')
  // The page stays on the list, marked done — it must not vanish and be replaced.
  await expect(page.locator('.row')).toHaveCount(3)
  await expect(page.locator('.row').first()).toContainText('Done')

  await page.waitForTimeout(500) // the debounced write
  await page.reload()

  await expect(ring(page)).toHaveText('1/3', { timeout: 10_000 })
  await expect(page.locator('.row').first()).toContainText('Done')
})

test('finishing every task completes the day and lights the streak', async ({ page }) => {
  await open(page, { progress: PROGRESS, plan: plan() })
  await expect(ring(page)).toHaveText('0/3', { timeout: 10_000 })

  for (const p of [1, 2, 3]) {
    await page.getByRole('button', { name: `Page ${p} recited cleanly` }).click()
  }

  await expect(ring(page)).toHaveText('3/3')
  await expect(page.getByText('Today is complete')).toBeVisible()
  await expect(page.locator('.streak-n')).toHaveText('1 day') // day one counts
})

test('a shaky recall is recorded without vanishing from the day', async ({ page }) => {
  await open(page, { progress: PROGRESS, plan: plan() })
  await expect(ring(page)).toHaveText('0/3', { timeout: 10_000 })

  await page.getByRole('button', { name: 'Page 2 needed work' }).click()
  await expect(ring(page)).toHaveText('1/3') // it was still revised today
})

test('a task deep-links into the reader', async ({ page }) => {
  await open(page, { progress: PROGRESS, plan: plan() })
  await expect(ring(page)).toHaveText('0/3', { timeout: 10_000 })

  await page.getByRole('button', { name: 'Open page 2 in the reader' }).click()
  await expect(page).toHaveURL(/\/read\/qpc\/2$/)
})

test('new memorization renders its own section and walks the front forward', async ({ page }) => {
  await open(page, {
    progress: PROGRESS,
    plan: plan({ newFront: { layout: 'qpc', nextPage: 40 }, pace: { ...plan().pace, newPagesPerDay: 1 } }),
  })

  await expect(page.getByRole('heading', { name: 'New memorization' })).toBeVisible({
    timeout: 10_000,
  })
  await page.getByRole('button', { name: 'Mark page 40 Memorized' }).click()
  await expect(page.locator('.row').first()).toContainText('Done')

  await page.waitForTimeout(500) // the debounced write
  // The plan's front moved on to 41 — but today's one new page is spent, so 41 is
  // tomorrow's work and must not appear now.
  const stored = await readKey<{ newFront: { nextPage: number } }>(page, 'plan')
  expect(stored.newFront.nextPage).toBe(41)

  await page.reload()
  await expect(page.getByRole('button', { name: 'Mark page 40 Memorized' })).toBeHidden({
    timeout: 10_000,
  })
  await expect(page.getByText('Page 41')).toHaveCount(0)
  await expect(page.locator('.row').first()).toContainText('Done') // 40, still checked off
})

test('an off day rests new memorization but keeps revision', async ({ page }) => {
  const everyDayOff = [0, 1, 2, 3, 4, 5, 6]
  await open(page, {
    progress: PROGRESS,
    plan: plan({
      newFront: { layout: 'qpc', nextPage: 40 },
      pace: { ...plan().pace, newPagesPerDay: 1, offDays: everyDayOff },
    }),
  })

  await expect(page.getByText('Rest day')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('heading', { name: 'New memorization' })).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Revision' })).toBeVisible()
})

test('habits render alongside the pages and toggle independently', async ({ page }) => {
  await open(page, { progress: PROGRESS, plan: plan({ habits: ['recite-ayahs'] }) })

  await expect(page.getByRole('heading', { name: 'Habits' })).toBeVisible({ timeout: 10_000 })
  await expect(ring(page)).toHaveText('0/4') // 3 pages + 1 habit

  const habit = page.getByRole('switch', { name: 'Recite 10 verses' })
  await habit.click()
  await expect(ring(page)).toHaveText('1/4')
  await habit.click() // habits carry no reward, so they un-check freely
  await expect(ring(page)).toHaveText('0/4')
})

test('with no plan, Today shows the set-up call to action', async ({ page }) => {
  await page.goto('/today')
  await expect(page.getByRole('heading', { name: 'Set up your practice' })).toBeVisible()
  await expect(page.locator('.ring')).toHaveCount(0)
})

// Today is the app's primary surface — it must be axe-clean in all three themes.
// Colour is never the only cue: done rows carry a check glyph and the word "Done",
// and the streak state is spelled out in text beside the flame.
const themes = ['light', 'dark', 'sepia'] as const
for (const theme of themes) {
  test(`today view has no serious a11y violations — ${theme}`, async ({ page }) => {
    await open(page, { progress: PROGRESS, plan: plan({ habits: ['recite-ayahs', 'quick-test'] }) })
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expect(page.getByRole('heading', { name: 'Revision' })).toBeVisible({ timeout: 10_000 })

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    )
    expect(
      serious,
      JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.length }))),
    ).toEqual([])
  })
}
