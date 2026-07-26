import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Phase 10.7.3 — the cutover rehearsal plans/phase-10-pwa-migration.md
// required before Phase 11: run the migration against the *actual* legacy
// `sw.js` (not a stub) plus realistic IndexedDB fixtures shaped like
// plans/legacy-schema.md, and prove every fixture survives byte-identical.
// This is the authoritative test of §10.2's teardown — pwa.spec.ts covers the
// registration/gate logic with a trivial stub, but real legacy has a very
// different lifecycle (conditional skipWaiting gated on all critical
// resources caching successfully, heavy Blob-based install) worth exercising
// for real.
//
// `source/` (the legacy monolith) was deleted from the repo once the redesign
// replaced it in production — Phase 11 has happened. But the teardown code
// this test guards (`core/pwa/legacyTeardown.ts`) is still live in every
// build: any user who hasn't yet reconnected since the cutover still carries
// the real legacy service worker and will run this exact migration on their
// next boot. So the rehearsal stays, sourcing the last real `source/sw.js`
// bytes (captured before deletion, commit 11747411^) from a static fixture
// instead of the live tree — see fixtures/legacy-sw.js.
const LEGACY_SW_SOURCE = readFileSync(
  fileURLToPath(new URL('./fixtures/legacy-sw.js', import.meta.url)),
  'utf-8',
)

const LEGACY_DB_NAME = 'murajah-db'
const LEGACY_DB_VERSION = 6

test('rehearsal: migrating from the real legacy sw.js preserves murajah-db byte-identical', async ({ page }) => {
  // Legacy's own install handler refuses to skipWaiting unless every
  // CRITICAL_RESOURCES fetch succeeds (see source/sw.js) — none of those
  // `./resources/**` paths exist in the new app's dist, so stub them a real
  // 200 (content is never executed; legacy's shell is never actually
  // navigated to in this test, only cached).
  // Exact pathname matches only — a loose `**/manifest.json` glob also
  // matched the new app's own `/data/manifest.json` (the data pipeline's real
  // manifest) and broke it, a lesson from a first pass at this test.
  await page.context().route(
    (url) => url.pathname.startsWith('/resources/'),
    (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: 'stub' }),
  )
  await page.context().route(
    (url) => url.pathname === '/quiz.html' || url.pathname === '/privacy.html' || url.pathname === '/manifest.json',
    (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html>' }),
  )
  // The SW script itself: serve real bytes read from disk. (Unlike
  // pwa.spec.ts's stub, this is a one-shot registration+teardown within a
  // single test, not exercised across repeated reloads, so the CDP-
  // interception update-check artifact documented there doesn't apply here.)
  await page.context().route(
    (url) => url.pathname === '/sw.js',
    (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: LEGACY_SW_SOURCE }),
  )

  await page.goto('/')

  // Register the real legacy worker (as `source/index.html` does, scope '/')
  // and wait for it to actually activate — proves its CRITICAL_RESOURCES
  // install gate was satisfied by the stubs above, not just "registered".
  await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(regs.map((r) => r.unregister()))
    await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  })
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const reg = await navigator.serviceWorker.getRegistration('/')
          return reg?.active?.scriptURL
        }),
      { timeout: 15_000 },
    )
    .toMatch(/\/sw\.js$/)

  // Seed realistic legacy fixtures: the exact DB/store/keyPath shape from
  // plans/legacy-schema.md §1, populated with representative memorization,
  // plan, and streak data.
  const fixtureSnapshot = await page.evaluate(
    async ({ dbName, dbVersion }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion)
        req.onupgradeneeded = () => {
          const d = req.result
          d.createObjectStore('appData', { keyPath: 'id' })
          d.createObjectStore('recordings', { keyPath: 'id', autoIncrement: true })
          d.createObjectStore('dailyGoals', { keyPath: 'date' })
          d.createObjectStore('quranCache', { keyPath: 'id' })
          d.createObjectStore('resourceCache', { keyPath: 'id' })
          d.createObjectStore('notes', { keyPath: 'id' })
          const planStore = d.createObjectStore('plans', { keyPath: 'id' })
          planStore.createIndex('status', 'status')
          planStore.createIndex('type', 'type')
          const historyStore = d.createObjectStore('planHistory', { keyPath: 'id' })
          historyStore.createIndex('planId', 'planId')
          historyStore.createIndex('date', 'date')
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })

      const appData = {
        id: 'murajah-data',
        memorized: [1, 2, 3, 604],
        perfectRevisions: { 1: 5, 2: 3 },
        mistakes: { 3: [1, 4, 7] },
      }
      const dailyGoal = { date: '2026-07-20', streak: 4, longestStreak: 12, selectedTasks: ['recite', 'review'] }
      const plan = { id: 'plan-1', status: 'active', type: 'memorize', name: 'Juz Amma' }
      const historyEntry = { id: 'hist-1', planId: 'plan-1', date: '2026-07-20', completed: true }
      const note = { id: 'note-1', page: 1, text: 'Focus on tajweed here.' }

      const tx = db.transaction(['appData', 'dailyGoals', 'plans', 'planHistory', 'notes'], 'readwrite')
      tx.objectStore('appData').put(appData)
      tx.objectStore('dailyGoals').put(dailyGoal)
      tx.objectStore('plans').put(plan)
      tx.objectStore('planHistory').put(historyEntry)
      tx.objectStore('notes').put(note)
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
      db.close()

      return { appData, dailyGoal, plan, historyEntry, note }
    },
    { dbName: LEGACY_DB_NAME, dbVersion: LEGACY_DB_VERSION },
  )

  // New boot: teardown must retire the real legacy worker + its cache
  // buckets, and register the new app's own worker — without ever touching
  // murajah-db. Legacy is still the active controller of this document at
  // the moment of navigation, so the new worker parks behind it and only
  // takes over once the first-handoff nudge's `applyUpdate()` fires (see
  // pwa.spec.ts's `gotoAndSettle`) — wait for that follow-up reload, not just
  // `serviceWorker.ready` (which can resolve against the *old* controller).
  let loadCount = 0
  page.on('load', () => loadCount++)
  await page.goto('/')
  await expect.poll(() => loadCount, { timeout: 15_000 }).toBeGreaterThanOrEqual(2)

  const after = await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations()
    return { scriptURLs: regs.map((r) => r.active?.scriptURL) }
  })
  expect(after.scriptURLs.some((u) => u?.endsWith('/sw.js') && !u.includes('service-worker'))).toBe(false)
  expect(after.scriptURLs.some((u) => u?.endsWith('/service-worker.js'))).toBe(true)

  // Every legacy fixture must be byte-identical to what was seeded — the
  // safety guarantee this whole phase is organized around.
  const survived = await page.evaluate(
    async ({ dbName, dbVersion }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      const get = <T>(store: string, key: IDBValidKey) =>
        new Promise<T>((resolve, reject) => {
          const tx = db.transaction(store, 'readonly')
          const req = tx.objectStore(store).get(key)
          req.onsuccess = () => resolve(req.result as T)
          req.onerror = () => reject(req.error)
        })
      const result = {
        appData: await get('appData', 'murajah-data'),
        dailyGoal: await get('dailyGoals', '2026-07-20'),
        plan: await get('plans', 'plan-1'),
        historyEntry: await get('planHistory', 'hist-1'),
        note: await get('notes', 'note-1'),
      }
      db.close()
      return result
    },
    { dbName: LEGACY_DB_NAME, dbVersion: LEGACY_DB_VERSION },
  )

  expect(survived.appData).toEqual(fixtureSnapshot.appData)
  expect(survived.dailyGoal).toEqual(fixtureSnapshot.dailyGoal)
  expect(survived.plan).toEqual(fixtureSnapshot.plan)
  expect(survived.historyEntry).toEqual(fixtureSnapshot.historyEntry)
  expect(survived.note).toEqual(fixtureSnapshot.note)

  // And the app itself still renders normally post-migration.
  await expect(page.locator('.surface .word').first()).not.toBeEmpty({ timeout: 10_000 })
})
