import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Journal (Phase 12) — the daily practice calendar + reflection notes, the 4th
// segment on /progress, reachable directly at /progress?tab=journal (Today's
// repointed streak button). Seeds IndexedDB's `dayLog` and per-date
// `journal:<date>` keys directly (see `seed`), matching how today.spec.ts
// seeds `dayLog`/`progress`/`plan` — the calendar reads real storage, not a
// component-level fixture.

const PINNED = new Date('2026-08-23T09:00:00') // a Sunday — exercises week padding

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(PINNED)
})

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

async function open(page: Page, records: Record<string, unknown> = {}) {
  await page.goto('/progress?tab=journal')
  await expect(page.getByRole('region', { name: 'Journal' })).toBeVisible()
  if (Object.keys(records).length) {
    await seed(page, records)
    await page.reload()
    await expect(page.getByRole('region', { name: 'Journal' })).toBeVisible()
  }
}

const journal = (page: Page) => page.getByRole('region', { name: 'Journal' })

test('a direct link to ?tab=journal lands on the calendar, not Overview', async ({ page }) => {
  await open(page)
  // August 2026 has 31 days — the pinned clock's month, no navigation needed.
  await expect(journal(page).locator('td[data-date]')).toHaveCount(31)
  await expect(journal(page).locator('[data-date="2026-08-23"] .cell-today')).toBeAttached()
})

test('month navigation moves forward and back correctly, including a year boundary', async ({ page }) => {
  await open(page)
  await expect(journal(page).locator('h2')).toContainText('August 2026')

  await journal(page).getByRole('button', { name: 'Next month' }).click()
  await expect(journal(page).locator('h2')).toContainText('September 2026')

  await journal(page).getByRole('button', { name: 'Previous month' }).click()
  await journal(page).getByRole('button', { name: 'Previous month' }).click()
  await expect(journal(page).locator('h2')).toContainText('July 2026')
})

test('tapping a day opens the detail sheet showing every populated section', async ({ page }) => {
  await open(page, {
    dayLog: {
      '2026-08-10': {
        date: '2026-08-10',
        completed: true,
        newMemorization: [22],
        revision: [10, 11],
        weak: [5],
        habits: ['recite-ayahs'],
      },
    },
    'journal:2026-08-10': {
      date: '2026-08-10',
      note: 'Great session today',
      noteUpdatedAt: '2026-08-10T09:00:00.000Z',
      events: [{ id: 'e1', type: 'band-up', page: 22, fromRank: 0, toRank: 1, createdAt: '2026-08-10T09:00:00.000Z' }],
      eventsOverflow: 0,
    },
  })

  await journal(page).locator('[data-date="2026-08-10"] button').click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()

  await expect(sheet.getByText('New memorization')).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Page 22' }).first()).toBeVisible()
  await expect(sheet.getByText('Revision', { exact: true })).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Page 10' })).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Page 11' })).toBeVisible()
  await expect(sheet.getByText('Weak-page reinforcement')).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Page 5' })).toBeVisible()
  await expect(sheet.getByText('Daily habits')).toBeVisible()
  await expect(sheet).toContainText('Recite 10 verses')
  await expect(sheet.getByText('Progress changes')).toBeVisible()
  await expect(sheet).toContainText('New (جديد)') // strengthBand.jadid — the band the event crossed into
  await expect(sheet.locator('textarea')).toHaveValue('Great session today')
})

test('a day with nothing recorded shows the empty state, not a blank sheet', async ({ page }) => {
  await open(page)
  await journal(page).locator('[data-date="2026-08-05"] button').click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('Nothing recorded this day.')
})

test('a reflection note autosaves and survives a reload', async ({ page }) => {
  await open(page)
  await journal(page).locator('[data-date="2026-08-23"] button').click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()

  await sheet.locator('textarea').fill('Alhamdulillah, smooth today.')
  // Debounced (300ms) — give it time to flush before reloading.
  await page.waitForTimeout(500)
  await page.reload()

  await journal(page).locator('[data-date="2026-08-23"] button').click()
  await expect(page.getByRole('dialog').locator('textarea')).toHaveValue('Alhamdulillah, smooth today.')
})

test('the Journal panel has no serious a11y violations in light, dark, and sepia', async ({ page }) => {
  for (const theme of ['light', 'dark', 'sepia'] as const) {
    await open(page, {
      dayLog: {
        '2026-08-10': { date: '2026-08-10', completed: true, newMemorization: [1], revision: [], weak: [], habits: [] },
        '2026-08-11': { date: '2026-08-11', completed: false, newMemorization: [], revision: [1], weak: [], habits: [] },
      },
    })
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expectAxeClean(page, `${theme} — journal calendar`)

    // The day-detail sheet carries its own band-change/section content.
    await journal(page).locator('[data-date="2026-08-10"] button').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expectAxeClean(page, `${theme} — journal day sheet`)
    await page.keyboard.press('Escape')
  }
})

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
