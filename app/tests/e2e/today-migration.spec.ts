import { test, expect, type Page } from '@playwright/test'

// Migrated-plan parity, browser side (Phase 5.7.2). Seeds IndexedDB with exactly
// what `migrateLegacyPlans` produces from the committed legacy fixture — the
// unified plan, one ReviewSchedule per page, and the day log carried over from
// legacy's daily goals — then loads /today and checks the user lands somewhere
// sane on day one: the streak survived, the queue is reasonable, and finishing a
// task sticks.
//
// The arithmetic of the import is proven by tests/unit/planMigration.test.ts; this
// is about what a migrated user actually sees.

// Legacy's last recorded day was 2026-04-30; the user opens the app on 1 May.
const MIGRATION_DAY = new Date('2026-05-01T09:00:00')

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(MIGRATION_DAY)
})

// —— The migrated records, as they land on disk ————————————————

const PROGRESS = {
  memorized: [1, 2, 3, 4, 5, 6, 7, 8, 582, 583, 584],
  perfectRevisions: { '1': 4, '582': 6 },
  hasanah: 98765,
  reviewData: {
    // Real review history, merged one-per-page across the legacy plans.
    '1': {
      lastReviewDate: '2026-04-30',
      nextReviewDate: '2026-05-03',
      interval: 3,
      easeFactor: 2.5,
      reviewCount: 2,
      consecutiveCorrect: 2,
    },
    '582': {
      lastReviewDate: '2026-04-28',
      nextReviewDate: '2026-05-05',
      interval: 7,
      easeFactor: 2.6,
      reviewCount: 4,
      consecutiveCorrect: 3,
    },
  },
}

const PLAN = {
  scope: { kind: 'juz', juz: [1, 2, 30] },
  newFront: null,
  pace: {
    newPagesPerDay: 0,
    revisionPagesPerDay: 20,
    weakPagesPerDay: 2,
    daysPerWeek: 7,
    offDays: [],
  },
  habits: ['recite-ayahs', 'quick-test'],
  startDate: '2026-03-01',
  createdAt: '2026-03-01T08:00:00.000Z',
}

const DAY_LOG = {
  '2026-04-29': {
    date: '2026-04-29',
    completed: true,
    newMemorization: [],
    revision: [4, 5],
    weak: [],
    habits: ['recite-ayahs'],
  },
  '2026-04-30': {
    date: '2026-04-30',
    completed: true,
    newMemorization: [],
    revision: [6, 7],
    weak: [],
    habits: ['recite-ayahs', 'quick-test'],
  },
}

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

async function openMigrated(page: Page) {
  await page.goto('/today')
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible()
  await seed(page, { progress: PROGRESS, plan: PLAN, dayLog: DAY_LOG })
  await page.reload()
}

const ring = (page: Page) => page.locator('.ring-text')
const section = (page: Page, name: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) })

test('a migrated plan loads and shows a sane day-one queue', async ({ page }) => {
  await openMigrated(page)

  await expect(section(page, 'Revision')).toBeVisible({ timeout: 10_000 })

  // Migration doesn't carry an SM-2 "due" concept into the rotation — the murajah
  // cycle starts fresh at the first scoped page regardless of any migrated review
  // history. Pages 1 and 582 keep their real `reviewData` (it still feeds weakness
  // scoring), but that history no longer gates their place in the rotation.
  const rows = section(page, 'Revision').locator('.row')
  await expect(rows.first()).toContainText('Page 1')

  // The whole scope is juz 1, 2 and 30 — nothing outside it is queued.
  await expect(page.getByText('Page 100')).toHaveCount(0)
  // Migrated habits render.
  await expect(page.getByRole('switch', { name: 'Recite 10 verses' })).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Do a quick test' })).toBeVisible()
})

test('the streak survives migration and shows on day one', async ({ page }) => {
  await openMigrated(page)

  // 29 + 30 April completed; 1 May is under way, so the run is alive at 2.
  await expect(page.locator('.streak-n')).toHaveText('2 days', { timeout: 10_000 })
  await expect(page.locator('.streak-sub')).toContainText('Finish today to keep it')

  // HistorySheet is retired (Phase 12.4.4/12.8.2) — the same button now
  // navigates to the Journal calendar on /progress instead of opening a dialog.
  await page.getByRole('button', { name: 'View your practice history' }).click()
  await expect(page).toHaveURL(/\/progress\?tab=journal/)
  const journal = page.getByRole('region', { name: 'Journal' })
  await expect(journal.locator('.stat', { hasText: 'Current streak' }).locator('.stat-n')).toHaveText('2')

  // The calendar opens on "today"'s month (May); April 29/30 are the previous month.
  await journal.getByRole('button', { name: 'Previous month' }).click()
  await expect(journal.locator('[data-date="2026-04-30"] .cell-completed')).toBeAttached()
  await expect(journal.locator('[data-date="2026-04-29"] .cell-completed')).toBeAttached()
})

test('completing a task on a migrated plan advances it and persists', async ({ page }) => {
  await openMigrated(page)
  await expect(ring(page)).toBeVisible({ timeout: 10_000 })

  const hasanahBefore = 98765
  const pageTwoRow = section(page, 'Revision').locator('.row').filter({ hasText: 'Page 2' })
  await page.getByRole('button', { name: 'Page 2 recited cleanly' }).click()
  await expect(pageTwoRow).toContainText('Done')
  // Page 1 is in the same rotation chunk but wasn't touched — still pending.
  const pageOneRow = section(page, 'Revision').locator('.row').filter({ hasText: 'Page 1' })
  await expect(pageOneRow).not.toContainText('Done')

  await page.waitForTimeout(500)
  await page.reload()

  // The completion stuck, and it built on the migrated hasanah rather than resetting it.
  await expect(section(page, 'Revision').locator('.row').filter({ hasText: 'Page 2' })).toContainText(
    'Done',
    { timeout: 10_000 },
  )
  const stored = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('murajah-userdata', 1)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const get = req.result.transaction('data', 'readonly').objectStore('data').get('progress')
          get.onsuccess = () => resolve(get.result)
          get.onerror = () => reject(get.error)
        }
      }),
  )
  const p = stored as { hasanah: number; reviewData: Record<string, { nextReviewDate: string }> }
  expect(p.hasanah).toBeGreaterThan(hasanahBefore)
  expect(p.reviewData['2'].nextReviewDate).toBe('2026-05-02') // entered the SM-2 cycle
  expect(p.reviewData['1'].nextReviewDate).toBe('2026-05-03') // untouched migrated history
})
