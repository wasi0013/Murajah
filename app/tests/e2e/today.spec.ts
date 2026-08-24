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

// Pin the browser's clock to a Wednesday. A smart plan rests on Fridays by
// convention, so on a real clock the beginner case would quietly flip to a rest
// day once a week. `setFixedTime` fakes the date but leaves timers running, so the
// app's debounced writes still fire.
const WEDNESDAY = new Date('2026-07-15T09:00:00')

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(WEDNESDAY)
})

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

/** The task section under a given heading — rows are only meaningful in context. */
const section = (page: Page, name: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) })

test('the Today tab in the reader opens the practice loop', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Today' }).click()
  await expect(page).toHaveURL(/\/today$/)
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible()
})

test('the top-bar back button returns to the reader', async ({ page }) => {
  await page.goto('/today')
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible({
    timeout: 10_000,
  })
  await page.getByRole('button', { name: 'Back to reader' }).click()
  await expect(page).toHaveURL(/\/$/)
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

test('the revision rotation advances to disk and resumes the next chunk on reload', async ({ page }) => {
  await open(page, {
    progress: { memorized: Array.from({ length: 10 }, (_, i) => i + 1), perfectRevisions: {}, hasanah: 0, reviewData: {} },
    plan: plan({ pace: { ...plan().pace, revisionPagesPerDay: 2 } }),
  })
  await expect(ring(page)).toHaveText('0/2', { timeout: 10_000 })

  await page.getByRole('button', { name: 'Page 1 recited cleanly' }).click()
  await page.getByRole('button', { name: 'Page 2 recited cleanly' }).click()
  await expect(ring(page)).toHaveText('2/2')

  await page.waitForTimeout(500) // the debounced write
  const stored = await readKey<{ revisionCursor: { lastPage: number; lastAdvanceDate: string } }>(
    page,
    'plan',
  )
  expect(stored.revisionCursor.lastPage).toBe(2)

  await page.reload()
  // The chunk stays frozen on reload rather than jumping ahead...
  await expect(ring(page)).toHaveText('2/2', { timeout: 10_000 })
  await expect(page.locator('.row')).toContainText(['Page 1', 'Page 2'])

  // ...but a new day resumes right where the rotation left off.
  await page.clock.setFixedTime(new Date('2026-07-16T09:00:00'))
  await page.reload()
  await expect(ring(page)).toHaveText('0/2', { timeout: 10_000 })
  await expect(page.locator('.row')).toContainText(['Page 3', 'Page 4'])
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
  await expect(page).toHaveURL(/\/page\/2$/)
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

test('one tap builds a smart plan from existing data and Today populates', async ({ page }) => {
  await open(page, { progress: PROGRESS }) // memorized pages, but no plan

  await expect(page.getByRole('heading', { name: 'Set up your practice' })).toBeVisible()
  // The CTA states what the tap will do, read from the user's own data.
  await expect(page.locator('.empty-summary')).toContainText('Maintain your 3 memorized pages')

  await page.getByRole('button', { name: 'Create my plan' }).click()

  // A partially-memorized user maintains what they know *and* keeps growing: the
  // three memorized pages to revise, plus the next unmemorized page as the front.
  await expect(section(page, 'Revision').locator('.row')).toHaveCount(3)
  await expect(section(page, 'New memorization').locator('.row')).toContainText(['Page 4'])
  await expect(page.getByRole('switch', { name: 'Recite 10 verses' })).toBeVisible()
  await expect(ring(page)).toHaveText('0/5') // 3 revision + 1 new + the standing habit

  // It's a real plan: it survives a reload.
  await page.waitForTimeout(500)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Revision' })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('heading', { name: 'Set up your practice' })).toBeHidden()
})

test('a first-run user with nothing memorized gets a beginner plan at Juz 30', async ({ page }) => {
  await page.goto('/today')
  await expect(page.locator('.empty-summary')).toContainText('Start with Juz 30', {
    timeout: 10_000,
  })

  await page.getByRole('button', { name: 'Create my plan' }).click()

  // Nothing to revise yet — the plan opens the memorization front instead.
  await expect(page.getByRole('heading', { name: 'New memorization' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Revision' })).toBeHidden()
  // Juz 30 starts at page 582 in the canonical scheme (from the derived nav index).
  await expect(page.locator('.row').first()).toContainText('Page 582')
})

// —— Weak reinforcement ————————————————————————————————

test('a page the rotation hasn’t reached yet but the evidence calls weak gets its own lane', async ({
  page,
}) => {
  // 10 pages memorized, 2 revised a day — the rotation's first chunk is [1, 2],
  // so it won't reach page 3 for another day. Pages 4-10 are given a clean, recent
  // history so weakness scoring leaves them alone (an untouched page defaults to
  // looking maximally "weak" — recency and low-review-count both maxed out — so
  // without this they'd swamp page 3's signal). Page 3 has never been revised
  // cleanly and carries 30 word-mistakes, scoring ~57 (WEAK_THRESHOLD 50). Catching
  // exactly this page — one the rotation schedule hasn't gotten to yet — is why the
  // reinforcement lane exists, independent of where the rotation currently stands.
  const healthy = { lastReviewDate: before(1), nextReviewDate: before(-30), interval: 30, easeFactor: 2.6, reviewCount: 10, consecutiveCorrect: 8 }
  await open(page, {
    progress: {
      memorized: Array.from({ length: 10 }, (_, i) => i + 1),
      perfectRevisions: { 4: 10, 5: 10, 6: 10, 7: 10, 8: 10, 9: 10, 10: 10 },
      hasanah: 0,
      reviewData: {
        '3': {
          lastReviewDate: before(20),
          nextReviewDate: before(-1),
          interval: 21,
          easeFactor: 2.5,
          reviewCount: 5,
          consecutiveCorrect: 0,
        },
        '4': healthy,
        '5': healthy,
        '6': healthy,
        '7': healthy,
        '8': healthy,
        '9': healthy,
        '10': healthy,
      },
    },
    mistakes: { '3': Array.from({ length: 30 }, (_, i) => i + 1) },
    plan: plan({ pace: { ...plan().pace, revisionPagesPerDay: 2, weakPagesPerDay: 2 } }),
  })

  await expect(section(page, 'Needs reinforcement').locator('.row')).toContainText(['Page 3'], {
    timeout: 10_000,
  })
  // It's reinforcement, not revision — page 3 isn't in today's rotation chunk, so
  // it must not be in both. Pages 1 and 2 are the rotation's first chunk.
  await expect(section(page, 'Revision').locator('.row')).toContainText(['Page 1', 'Page 2'])

  // The lane is actionable, and the reward loop runs through it like any other:
  // one write moves hasanah, the schedule and the day's progress together.
  await page.getByRole('button', { name: 'Page 3 recited cleanly' }).click()
  await expect(section(page, 'Needs reinforcement').locator('.row').first()).toContainText('Done')

  await page.waitForTimeout(500)
  const stored = await readKey<{
    hasanah: number
    reviewData: Record<string, { lastReviewDate: string }>
  }>(page, 'progress')
  expect(stored.hasanah).toBeGreaterThan(0)
  expect(stored.reviewData['3'].lastReviewDate).toBe(before(0)) // rescheduled from today
})

// —— Milestones (5.5.2) ————————————————————————————————

test('memorizing the last page of a juz celebrates it, once', async ({ page }) => {
  // Juz 1 is pages 1–21 in the derived nav index; 1–20 are already known, so the
  // front sits on the page that completes it.
  const memorized = Array.from({ length: 20 }, (_, i) => i + 1)
  await open(page, {
    progress: { ...PROGRESS, memorized },
    plan: plan({
      newFront: { layout: 'qpc', nextPage: 21 },
      pace: { ...plan().pace, newPagesPerDay: 1, revisionPagesPerDay: 0 },
    }),
  })

  await expect(page.getByRole('button', { name: 'Mark page 21 Memorized' })).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.getByText('Juz 1 complete')).toHaveCount(0) // not yet — 21 is unmemorized

  await page.getByRole('button', { name: 'Mark page 21 Memorized' }).click()
  await expect(page.getByText('Juz 1 complete')).toBeVisible()

  // The announcement is recorded, not re-derived: reopening must not re-celebrate a
  // juz that is simply still complete.
  await page.waitForTimeout(500)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible()
  await expect(page.getByText('Juz 1 complete')).toHaveCount(0)
})

test('a user who arrives with juz already complete is not celebrated for history', async ({
  page,
}) => {
  // The migrated-hafiz case: everything is already done on first open. That's
  // history, not something just earned — 30 toasts would be a bug, not a party.
  await page.goto('/today')
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible()
  await seed(page, {
    progress: { ...PROGRESS, memorized: Array.from({ length: 604 }, (_, i) => i + 1) },
    plan: plan(),
  })
  await page.reload()

  await expect(page.getByRole('heading', { name: 'Revision' })).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.toast')).toHaveCount(0)
})

// —— Plan setup (5.5.1) ————————————————————————————————

const sheet = (page: Page) => page.getByRole('dialog', { name: 'Your plan' })

test('setting scope and pace by hand creates a plan Today reflects', async ({ page }) => {
  await open(page, { progress: PROGRESS })

  await page.getByRole('button', { name: 'Set it up myself' }).click()
  await expect(sheet(page)).toBeVisible()

  // Maintain everything memorized, no new pages, 2 revisions a day.
  await sheet(page).getByLabel('Pages to revise').fill('2')
  await page.getByRole('button', { name: 'Create plan' }).click()
  await expect(sheet(page)).toBeHidden()

  // The pace is honoured: 2 of the 3 memorized pages are queued today.
  await expect(section(page, 'Revision').locator('.row')).toHaveCount(2)
})

test('a juz scope needs at least one juz before it can be saved', async ({ page }) => {
  await open(page, { progress: PROGRESS })
  await page.getByRole('button', { name: 'Set it up myself' }).click()

  await sheet(page).getByRole('radio', { name: 'Pick juz' }).click()
  // An empty juz scope would maintain nothing at all — saving is blocked until it's fixed.
  await expect(page.getByText('Pick at least one juz')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create plan' })).toBeDisabled()

  await sheet(page).getByRole('button', { name: 'Juz 1', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Create plan' })).toBeEnabled()
  await page.getByRole('button', { name: 'Create plan' }).click()

  // Juz 1 is pages 1–21; all three memorized pages fall inside it.
  await expect(section(page, 'Revision').locator('.row')).toHaveCount(3)
})

test('Smart defaults pre-fills the form from existing data', async ({ page }) => {
  await open(page, { progress: PROGRESS })
  await page.getByRole('button', { name: 'Set it up myself' }).click()

  await expect(sheet(page).getByLabel('Pages to revise')).toHaveValue('5')
  await page.getByRole('button', { name: 'Smart defaults' }).click()

  // A partially-memorized user: keeps growing, and rests Fridays by convention.
  await expect(sheet(page).getByRole('switch', { name: 'Memorizing new pages?' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(sheet(page).getByLabel('Start at page')).toHaveValue('4')
  await expect(sheet(page).getByRole('button', { name: 'Rest on Fri' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('editing the pace re-generates the queue and persists', async ({ page }) => {
  await open(page, { progress: PROGRESS, plan: plan() })
  await expect(section(page, 'Revision').locator('.row')).toHaveCount(3)

  await page.getByRole('button', { name: 'Edit your plan' }).click()
  await sheet(page).getByLabel('Pages to revise').fill('1')
  await page.getByRole('button', { name: 'Save changes' }).click()

  await expect(section(page, 'Revision').locator('.row')).toHaveCount(1)

  await page.waitForTimeout(500)
  await page.reload()
  await expect(section(page, 'Revision').locator('.row')).toHaveCount(1, { timeout: 10_000 })
})

test('enabling new memorization schedules a page even from a zero-pace plan', async ({ page }) => {
  // The seeded plan has no new front and 0 new pages/day — the exact shape that
  // made the toggle look like it did nothing (9.3.1 regression).
  await open(page, { progress: PROGRESS, plan: plan() })
  await expect(page.getByRole('heading', { name: 'Revision' })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('heading', { name: 'New memorization' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Edit your plan' }).click()
  await sheet(page).getByRole('switch', { name: 'Memorizing new pages?' }).click()
  // Turning it on must give it a daily budget — the "New pages" field shows 1.
  await expect(sheet(page).getByRole('spinbutton', { name: 'New pages' })).toHaveValue('1')
  await page.getByRole('button', { name: 'Save changes' }).click()

  // The section now renders with the next un-memorized page (memorized 1–3 → 4).
  // It's the plan's front page, so it opens the marking view, not the reader
  // (see plans/partial-page-tracking.md) — the row's own label says so.
  await expect(section(page, 'New memorization').locator('.row')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Open page 4 to mark memorized verses' })).toBeVisible()
})

test('plan setup no longer offers a script choice for new memorization', async ({ page }) => {
  await open(page, { progress: PROGRESS, plan: plan() })
  await page.getByRole('button', { name: 'Edit your plan' }).click()
  await sheet(page).getByRole('switch', { name: 'Memorizing new pages?' }).click()
  await expect(sheet(page).getByLabel('Start at page')).toBeVisible()
  // The Uthmani/Indopak segmented control is gone — the reader's script is used (9.3.3).
  await expect(sheet(page).getByRole('radio', { name: 'Uthmani' })).toHaveCount(0)
})

test('an abandoned edit leaves the live plan untouched', async ({ page }) => {
  await open(page, { progress: PROGRESS, plan: plan() })
  await expect(section(page, 'Revision').locator('.row')).toHaveCount(3)

  await page.getByRole('button', { name: 'Edit your plan' }).click()
  await sheet(page).getByLabel('Pages to revise').fill('1')
  await page.keyboard.press('Escape') // dismissed without saving
  await expect(sheet(page)).toBeHidden()

  await expect(section(page, 'Revision').locator('.row')).toHaveCount(3) // still 3
})

// —— History → Journal (Phase 12.4.4) ————————————————————————————
// HistorySheet is retired — its streak numbers + heatmap are a strict subset
// of the Journal calendar (Phase 12), reached by the same button, which now
// navigates to `/progress?tab=journal` instead of opening a dialog. See
// tests/e2e/journal.spec.ts for the calendar's own dedicated coverage
// (month nav, day-expand, note persistence); these two cover only the
// entry-point wiring + that the seeded/session dayLog reaches the calendar.

const journal = (page: Page) => page.getByRole('region', { name: 'Journal' })

/** `YYYY-MM-DD` N days before the pinned Wednesday. */
function before(n: number): string {
  const d = new Date(WEDNESDAY)
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayRecord(date: string, completed: boolean, revision: number[] = []) {
  return { date, completed, newMemorization: [], revision, weak: [], habits: [] }
}

test('the streak button opens the Journal calendar of the seeded day log', async ({ page }) => {
  // Three completed days ending yesterday, a partial day before them, and a gap.
  // All within July 2026 (the pinned WEDNESDAY's month) — no month nav needed.
  const dayLog = {
    [before(5)]: dayRecord(before(5), true, [1]),
    [before(4)]: dayRecord(before(4), false, [1]), // worked, didn't finish
    [before(3)]: dayRecord(before(3), true, [1]),
    [before(2)]: dayRecord(before(2), true, [1]),
    [before(1)]: dayRecord(before(1), true, [1]),
  }
  await open(page, { progress: PROGRESS, plan: plan(), dayLog })

  await page.getByRole('button', { name: 'View your practice history' }).click()
  await expect(page).toHaveURL(/\/progress\?tab=journal/)
  await expect(journal(page)).toBeVisible()

  // Streak survives today being outstanding; the gap caps it at 3.
  await expect(journal(page).locator('.stat', { hasText: 'Current streak' }).locator('.stat-n')).toHaveText('3')
  await expect(journal(page).locator('.stat', { hasText: 'Longest streak' }).locator('.stat-n')).toHaveText('3')

  // July 2026 has 31 days, each a real cell.
  await expect(journal(page).locator('td[data-date]')).toHaveCount(31)
  await expect(journal(page).locator('.cell-completed')).toHaveCount(4)
  await expect(journal(page).locator('.cell-partial')).toHaveCount(1)
  await expect(journal(page).locator(`[data-date="${before(1)}"] .cell-completed`)).toBeAttached()
  await expect(journal(page).locator(`[data-date="${before(4)}"] .cell-partial`)).toBeAttached()
  await expect(journal(page).locator(`[data-date="${before(0)}"] .cell-today`)).toBeAttached()

  // Each day's state is spelled out for screen readers — never colour alone.
  await expect(journal(page).locator(`[data-date="${before(1)}"]`)).toContainText('completed')
  await expect(journal(page).locator(`[data-date="${before(4)}"]`)).toContainText('partly done')
  await expect(journal(page).locator(`[data-date="${before(0)}"]`)).toContainText('nothing recorded')
})

test('the Journal calendar reflects work done in the session', async ({ page }) => {
  await open(page, { progress: PROGRESS, plan: plan() })

  await page.getByRole('button', { name: 'Page 1 recited cleanly' }).click() // 1 of 3
  await page.getByRole('button', { name: 'View your practice history' }).click()

  await expect(journal(page).locator(`[data-date="${before(0)}"]`)).toContainText('partly done')
  await expect(journal(page).locator('.stat', { hasText: 'Current streak' }).locator('.stat-n')).toHaveText('0')
})

// Today is the app's primary surface — it must be axe-clean in all three themes.
// Colour is never the only cue: done rows carry a check glyph and the word "Done",
// and the streak state is spelled out in text beside the flame.
const themes = ['light', 'dark', 'sepia'] as const
for (const theme of themes) {
  test(`today view has no serious a11y violations — ${theme}`, async ({ page }) => {
    // Seed a day log so the calendar renders every cell state. An empty log would
    // paint 90 identical blanks and check nothing that can actually fail.
    await open(page, {
      progress: PROGRESS,
      plan: plan({ habits: ['recite-ayahs', 'quick-test'] }),
      dayLog: {
        [before(2)]: dayRecord(before(2), true, [1]),
        [before(1)]: dayRecord(before(1), false, [1]),
      },
    })
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expect(page.getByRole('heading', { name: 'Revision' })).toBeVisible({ timeout: 10_000 })

    await expectAxeClean(page, `${theme} — queue`)

    // The calendar encodes state as colour, so it carries the most contrast risk
    // on the surface — and its text alternatives are the reason it's readable at all.
    // (HistorySheet retired, Phase 12.4.4/12.8.2 — the button now navigates to
    // the Journal calendar; its own themed a11y coverage lives in journal.spec.ts,
    // but this scan stays here too since it's reached from Today's own button.)
    await page.getByRole('button', { name: 'View your practice history' }).click()
    await expect(page).toHaveURL(/\/progress\?tab=journal/)
    await expect(page.getByRole('region', { name: 'Journal' })).toBeVisible()
    await expectAxeClean(page, `${theme} — journal`)
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Revision' })).toBeVisible({ timeout: 10_000 })

    // The setup sheet is the other half of the surface: a juz grid, weekday
    // toggles and number fields, all of which have to be reachable and labelled.
    await page.getByRole('button', { name: 'Edit your plan' }).click()
    await expect(sheet(page)).toBeVisible()
    await sheet(page).getByRole('radio', { name: 'Pick juz' }).click()
    await expectAxeClean(page, `${theme} — plan setup`)
  })
}

/**
 * Wait for every running transition to finish. Axe samples *computed* colours, so a
 * control caught mid-`transition-colors` reports a blend frame that is not a state
 * the design ever shows — a real source of flaky contrast failures.
 *
 * The two frames matter: Vue's <Transition> renders with the `*-enter-from` class and
 * only swaps to `*-enter-to` on the next frame, and a sheet starts at `opacity: 0` —
 * which Playwright counts as visible. So `getAnimations()` called the instant a sheet
 * opens is still empty, and awaiting it would return immediately, mid-fade.
 */
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
  expect(
    serious,
    `${label}: ${JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.length })))}`,
  ).toEqual([])
}
