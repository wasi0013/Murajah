import { test, expect, type Page } from '@playwright/test'

// Today's "Listen along" player — a tab per non-empty daily list (new / revision /
// weak-reinforcement, page grain) plus, once the "Recite 10 verses" habit is
// enabled, a Daily verses tab (verse grain) fed by the habit builder's cursor
// through all 6236 verses. Audio bytes stream from external CDNs and can't play
// deterministically in CI, so these assert the wiring (tab visibility, the docked
// mini-player, the habit's link into the player) and the cursor's persistence —
// not audible playback. Mirrors the seeding pattern in today.spec.ts.

const PROGRESS = {
  memorized: [1, 2, 3],
  perfectRevisions: {},
  hasanah: 0,
  reviewData: {},
}

// Pin the clock — see today.spec.ts for why (a smart plan rests on Fridays). Every
// date assertion below uses this literal rather than the *Node* process's real
// clock (`new Date()` here would read the test runner's date, not the faked one
// the browser page sees).
const WEDNESDAY = new Date('2026-07-15T09:00:00')
const TODAY_STR = '2026-07-15'

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(WEDNESDAY)
})

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
    startDate: TODAY_STR,
    createdAt: new Date().toISOString(),
    ...over,
  }
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

async function open(page: Page, records: Record<string, unknown>) {
  await page.goto('/today')
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible()
  await seed(page, records)
  await page.reload()
}

test('only tabs for lists that have work today appear', async ({ page }) => {
  await open(page, { progress: PROGRESS, plan: plan() })
  await expect(page.getByRole('heading', { name: 'Revision' })).toBeVisible({ timeout: 10_000 })

  await expect(page.getByRole('radio', { name: 'Revision' })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'New' })).toHaveCount(0)
  await expect(page.getByRole('radio', { name: 'Reinforce' })).toHaveCount(0)
  await expect(page.getByRole('radio', { name: 'Daily verses' })).toHaveCount(0)
})

test('selecting a list tab docks a page-grain mini-player with no grain toggle', async ({ page }) => {
  await open(page, { progress: PROGRESS, plan: plan() })
  await page.getByRole('radio', { name: 'Revision' }).click()

  await expect(page.locator('.player')).toBeVisible()
  await expect(page.locator('.now')).toHaveText('Page 1')
  // These lists are always page grain — Today never offers the reader's toggle.
  await expect(page.getByRole('radiogroup', { name: 'Playback grain' })).toHaveCount(0)
})

test('a page-grain list tab hides the (non-functional) repeat/spaced-drill controls', async ({ page }) => {
  // BUG regression: the tray used to show Repeat-count/Spaced-drill in every
  // context, including page grain, where they have no effect on playback at all.
  await open(page, { progress: PROGRESS, plan: plan() })
  await page.getByRole('radio', { name: 'Revision' }).click()
  await expect(page.locator('.player')).toBeVisible()
  await page.getByRole('button', { name: 'More controls' }).click()
  await expect(page.getByText('Repetition')).toHaveCount(0)
})

test('enabling the habit adds a Daily verses tab starting at 1:1', async ({ page }) => {
  await open(page, { progress: PROGRESS, plan: plan({ habits: ['recite-ayahs'] }) })
  const versesTab = page.getByRole('radio', { name: 'Daily verses' })
  await expect(versesTab).toBeVisible({ timeout: 10_000 })

  await versesTab.click()
  await expect(page.locator('.player')).toBeVisible()
  await expect(page.locator('.now')).toHaveText('Ayah 1:1')

  // Verse grain here is the one Today context that actually wires repeat-count/
  // spaced-drill into playback (see useTodayPlayer.ts), so the tray shows them.
  await page.getByRole('button', { name: 'More controls' }).click()
  await expect(page.getByText('Repetition')).toBeVisible()
})

test('the habit row links straight into the Daily verses tab', async ({ page }) => {
  await open(page, { progress: PROGRESS, plan: plan({ habits: ['recite-ayahs'] }) })
  await expect(page.getByText('Recite 10 verses')).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Open verses of the day in the player' }).click()
  await expect(page.locator('.now')).toHaveText('Ayah 1:1')
})

test('checking the habit advances the verse cursor by 10 and survives reload', async ({ page }) => {
  await open(page, { progress: PROGRESS, plan: plan({ habits: ['recite-ayahs'] }) })
  const habit = page.getByRole('switch', { name: 'Recite 10 verses' })
  await expect(habit).toBeVisible({ timeout: 10_000 })

  await habit.click()
  await page.waitForTimeout(500) // the debounced write

  const cursor = await readKey<{ completedThrough: number; lastAdvanceDate: string | null }>(
    page,
    'habitVerses',
  )
  expect(cursor).toEqual({ completedThrough: 10, lastAdvanceDate: TODAY_STR })

  // Today's assigned window is frozen: even though the cursor moved on to the
  // next 10, today still shows 1:1 (the window that was just completed).
  await page.reload()
  await page.getByRole('radio', { name: 'Daily verses' }).click()
  await expect(page.locator('.now')).toHaveText('Ayah 1:1')
})

test('un-checking the habit the same day rolls the cursor back', async ({ page }) => {
  await open(page, { progress: PROGRESS, plan: plan({ habits: ['recite-ayahs'] }) })
  const habit = page.getByRole('switch', { name: 'Recite 10 verses' })
  await expect(habit).toBeVisible({ timeout: 10_000 })

  await habit.click()
  await expect(habit).toHaveAttribute('aria-checked', 'true')
  await habit.click()
  await expect(habit).toHaveAttribute('aria-checked', 'false')
  await page.waitForTimeout(500)

  const cursor = await readKey<{ completedThrough: number; lastAdvanceDate: string | null }>(
    page,
    'habitVerses',
  )
  expect(cursor).toEqual({ completedThrough: 0, lastAdvanceDate: null })
})
