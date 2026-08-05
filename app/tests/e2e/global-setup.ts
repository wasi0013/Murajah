import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { chromium, type FullConfig } from '@playwright/test'

/**
 * Seeds `onboardingCompleted` into a shared storage-state snapshot that every
 * spec uses by default (see playwright.config.ts's `use.storageState`). The
 * onboarding modal (App.vue → OnboardingModal.vue) is non-dismissible and
 * covers the whole UI until a language is picked — without this, every spec
 * that isn't specifically testing onboarding would need its own workaround.
 * `onboarding.spec.ts` opts back into a fresh, unseeded context to exercise
 * the real first-run flow.
 *
 * Deliberately does *not* seed a reader `mode` pref: doing so once made
 * `restore()` flip `mode` away from its now-default 'mark-mistake' during the
 * boot-time hydrate race in `useReaderRouteSync` (its store→URL watcher
 * depends on the whole `reader.snapshot()`, mode included, even though only
 * layout/page/tajweed/wbw/tafsir affect the URL) — silently redirecting a
 * fresh '/' to '/read/qpc/1' in specs that never touch the reader at all.
 * Specs that need read mode (morphology/wbw-tap tests) switch to it
 * explicitly via the Settings UI instead — see reader-morphology.spec.ts etc.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const { baseURL, storageState } = config.projects[0].use
  const browser = await chromium.launch()
  const page = await browser.newPage()
  // A real navigation (not e.g. `about:blank`) is needed to get same-origin
  // access to IndexedDB — but it also boots the actual app, which starts
  // fetching/caching Quran data and fonts into `murajah-assets`/`murajah-fonts`
  // as a side effect. `indexedDB: true` below would capture those too,
  // silently pre-warming every spec's cache — most sharply data-worker.spec.ts,
  // which asserts *no* cache hit on a fresh first load. Seed only what's needed.
  await page.goto(baseURL!)
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('murajah-prefs', 1)
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains('prefs')) req.result.createObjectStore('prefs')
        }
        req.onsuccess = () => {
          const tx = req.result.transaction('prefs', 'readwrite')
          tx.objectStore('prefs').put(true, 'onboardingCompleted')
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        }
        req.onerror = () => reject(req.error)
      }),
  )
  const state = await page.context().storageState({ indexedDB: true })
  for (const origin of state.origins) {
    origin.indexedDB = origin.indexedDB?.filter((db) => db.name === 'murajah-prefs')
  }
  const path = storageState as string
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(state, null, 2))
  await browser.close()
}
