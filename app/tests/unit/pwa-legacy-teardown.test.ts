import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  unregisterLegacyServiceWorkers,
  deleteLegacyCaches,
  teardownLegacyPwa,
} from '@/core/pwa/legacyTeardown'
import { openDb, idbGet, txDone } from '@/core/storage/idb'

interface StubRegistration {
  active: { scriptURL: string } | null
  waiting: { scriptURL: string } | null
  installing: { scriptURL: string } | null
  unregister: () => Promise<boolean>
}

function legacyReg(unregister = vi.fn(() => Promise.resolve(true))): StubRegistration {
  return { active: { scriptURL: 'http://localhost/sw.js' }, waiting: null, installing: null, unregister }
}

function ownReg(unregister = vi.fn(() => Promise.resolve(true))): StubRegistration {
  return { active: { scriptURL: 'http://localhost/service-worker.js?platform=ios' }, waiting: null, installing: null, unregister }
}

function stubServiceWorker(getRegistrations: () => Promise<StubRegistration[]>) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistrations },
  })
}

function stubCaches(keys: string[], deleteSpy: (key: string) => void) {
  vi.stubGlobal('caches', {
    keys: () => Promise.resolve(keys),
    delete: (key: string) => {
      deleteSpy(key)
      return Promise.resolve(true)
    },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'serviceWorker')
})

describe('unregisterLegacyServiceWorkers', () => {
  it('unregisters a legacy (non-own) registration and reports it found one', async () => {
    const unregister = vi.fn(() => Promise.resolve(true))
    stubServiceWorker(() => Promise.resolve([legacyReg(unregister)]))

    await expect(unregisterLegacyServiceWorkers()).resolves.toBe(true)
    expect(unregister).toHaveBeenCalledTimes(1)
  })

  it('is a no-op when there is no existing registration', async () => {
    stubServiceWorker(() => Promise.resolve([]))
    await expect(unregisterLegacyServiceWorkers()).resolves.toBe(false)
  })

  it('never unregisters the app’s own registration (query-string variants included) — regression: this once caused a reload loop where every boot tore down the registration the previous boot had just created', async () => {
    const unregister = vi.fn(() => Promise.resolve(true))
    stubServiceWorker(() => Promise.resolve([ownReg(unregister)]))

    await expect(unregisterLegacyServiceWorkers()).resolves.toBe(false)
    expect(unregister).not.toHaveBeenCalled()
  })
})

describe('deleteLegacyCaches', () => {
  it('deletes only murajah-cache-*/murajah-fonts-* keys, never the new app’s own buckets', async () => {
    const deleted: string[] = []
    stubCaches(
      ['murajah-cache-v26.05.31', 'murajah-fonts-v26.05.31', 'workbox-precache-v2-https://example/', 'murajah-app-data'],
      (key) => deleted.push(key),
    )

    await deleteLegacyCaches()

    expect(deleted.sort()).toEqual(['murajah-cache-v26.05.31', 'murajah-fonts-v26.05.31'])
  })
})

describe('teardownLegacyPwa', () => {
  it('never touches IndexedDB — data written before teardown survives untouched', async () => {
    stubServiceWorker(() => Promise.resolve([legacyReg()]))
    stubCaches([], () => {})

    const db = await openDb('murajah-teardown-test', 1, (d) => {
      if (!d.objectStoreNames.contains('data')) d.createObjectStore('data')
    })
    const tx = db.transaction('data', 'readwrite')
    tx.objectStore('data').put({ 1: [1, 2, 3] }, 'mistakes')
    await txDone(tx)

    await expect(teardownLegacyPwa()).resolves.toBe(true)

    const readTx = db.transaction('data', 'readonly')
    const value = await idbGet(readTx.objectStore('data'), 'mistakes')
    expect(value).toEqual({ 1: [1, 2, 3] })
  })
})
