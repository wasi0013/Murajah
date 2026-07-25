import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { resetApp, clearResourceCache } from '@/core/storage/resetApp'
import { getPref, setPref } from '@/core/storage/prefs'
import { _resetPrefsDb } from '@/core/storage/prefs'

// Every connection is closed immediately after use — `resetApp.ts`'s
// `deleteDatabase()` resolves on `onblocked` rather than hanging, but a stray
// open connection left by this test helper would still block a real deletion
// from ever completing until closed, which isn't what these tests mean to
// exercise.
function seedDb(name: string, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1)
    req.onupgradeneeded = () => req.result.createObjectStore('data')
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction('data', 'readwrite')
      tx.objectStore('data').put(value, key)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        reject(tx.error)
      }
    }
    req.onerror = () => reject(req.error)
  })
}

function readDb(name: string, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name)
    req.onsuccess = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('data')) {
        db.close()
        resolve(undefined)
        return
      }
      const tx = db.transaction('data', 'readonly')
      const getReq = tx.objectStore('data').get(key)
      getReq.onsuccess = () => {
        db.close()
        resolve(getReq.result)
      }
      getReq.onerror = () => {
        db.close()
        reject(getReq.error)
      }
    }
    req.onerror = () => reject(req.error)
  })
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetPrefsDb()
  localStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe('clearResourceCache', () => {
  it('wipes regenerable caches but never touches user data or other prefs', async () => {
    await seedDb('murajah-userdata', 'progress', { sentinel: 'keep-me' })
    await seedDb('murajah-assets', 'x', { sentinel: 'wipe-me' })
    await seedDb('murajah-images', 'y', { sentinel: 'wipe-me' })
    await seedDb('murajah-fonts', 'z', { sentinel: 'wipe-me' })
    await setPref('theme', 'dark')
    await setPref('offlinePack', { complete: true, hashes: {} })

    await clearResourceCache()

    expect(await readDb('murajah-userdata', 'progress')).toEqual({ sentinel: 'keep-me' })
    expect(await readDb('murajah-assets', 'x')).toBeUndefined()
    expect(await readDb('murajah-images', 'y')).toBeUndefined()
    expect(await readDb('murajah-fonts', 'z')).toBeUndefined()
    expect(await getPref('theme')).toBe('dark') // untouched pref survives
    expect(await getPref('offlinePack')).toBeUndefined() // completion record cleared
  })

  it('deletes every Cache Storage bucket when available', async () => {
    const deleted: string[] = []
    vi.stubGlobal('caches', {
      keys: vi.fn(async () => ['murajah-app-data-v3', 'murajah-app-fonts-v3', 'murajah-app-manifest']),
      delete: vi.fn(async (key: string) => {
        deleted.push(key)
        return true
      }),
    })

    await clearResourceCache()

    expect(deleted.sort()).toEqual(
      ['murajah-app-data-v3', 'murajah-app-fonts-v3', 'murajah-app-manifest'].sort(),
    )
  })
})

describe('resetApp', () => {
  it('wipes everything, including user data, all prefs, and localStorage', async () => {
    await seedDb('murajah-userdata', 'progress', { sentinel: 'gone' })
    await setPref('theme', 'dark')
    localStorage.setItem('murajah:reader', 'off')

    await resetApp()

    expect(await readDb('murajah-userdata', 'progress')).toBeUndefined()
    expect(localStorage.getItem('murajah:reader')).toBeNull()
  })

  it('unregisters every service worker registration', async () => {
    const unregister = vi.fn(async () => true)
    vi.stubGlobal('navigator', {
      ...navigator,
      serviceWorker: { getRegistrations: vi.fn(async () => [{ unregister }, { unregister }]) },
    })

    await resetApp()

    expect(unregister).toHaveBeenCalledTimes(2)
  })
})
