import { describe, it, expect, vi, beforeEach } from 'vitest'

const getPage = vi.fn((_layout: string, page: number) => Promise.resolve({ page }))
const getPageBlob = vi.fn((page: number) => Promise.resolve(new Blob([`p${page}`])))
const dataClient = { init: vi.fn(() => Promise.resolve()), pageCount: vi.fn(() => 10), getPage }
const mushafClient = { init: vi.fn(() => Promise.resolve()), pageCount: vi.fn(() => 10), getPageBlob }

vi.mock('@/core/data', () => ({ getDataClient: () => dataClient }))
vi.mock('@/core/mushaf', () => ({ getMushafClient: () => mushafClient }))

const prefs = new Map<string, unknown>()
vi.mock('@/core/storage/prefs', () => ({
  getPref: (key: string) => Promise.resolve(prefs.get(key)),
  setPref: (key: string, value: unknown) => {
    prefs.set(key, value)
    return Promise.resolve()
  },
}))

describe('useOfflineDownload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules() // the composable's `state` is module-scope — isolate it per test
    dataClient.pageCount.mockReturnValue(10)
    getPage.mockImplementation((_layout: string, page: number) => Promise.resolve({ page }))
    prefs.clear()
  })

  it('downloads every page and marks the pack done', async () => {
    const { useOfflineDownload } = await import('@/composables/useOfflineDownload')
    const offline = useOfflineDownload()

    await offline.downloadText()

    expect(getPage).toHaveBeenCalledTimes(10)
    expect(offline.state.text.status).toBe('done')
    expect(offline.state.text.done).toBe(10)
    expect(prefs.get('offlineTextDownloaded')).toBe(true)
  })

  it('cancel stops before every page is fetched, and a second call resumes', async () => {
    const { useOfflineDownload } = await import('@/composables/useOfflineDownload')
    const offline = useOfflineDownload()

    let resolvePage3: () => void = () => {}
    getPage.mockImplementation((_layout: string, page: number) => {
      if (page === 3) return new Promise((resolve) => (resolvePage3 = () => resolve({ page })))
      return Promise.resolve({ page })
    })

    const run = offline.downloadText()
    // Let pages ahead of the blocked one settle, then cancel while page 3 is in flight.
    await new Promise((r) => setTimeout(r, 0))
    offline.cancelText()
    resolvePage3()
    await run

    expect(offline.state.text.status).toBe('canceled')
    expect(prefs.get('offlineTextDownloaded')).toBeUndefined()

    // Resuming re-runs the pool — already-cached pages resolve instantly via
    // the client's own cache (simulated here by the mock just resolving fast
    // again), and it completes normally.
    getPage.mockImplementation((_layout: string, page: number) => Promise.resolve({ page }))
    await offline.downloadText()
    expect(offline.state.text.status).toBe('done')
  })

  it('images pack is independent of the text pack', async () => {
    const { useOfflineDownload } = await import('@/composables/useOfflineDownload')
    const offline = useOfflineDownload()

    await offline.downloadImages()

    expect(getPageBlob).toHaveBeenCalledTimes(10)
    expect(offline.state.images.status).toBe('done')
    expect(offline.state.text.status).toBe('idle')
  })

  it('hydrate restores a "done" status from a prior session without re-fetching', async () => {
    prefs.set('offlineTextDownloaded', true)
    const { useOfflineDownload } = await import('@/composables/useOfflineDownload')
    const offline = useOfflineDownload()

    await offline.hydrate()

    expect(offline.state.text.status).toBe('done')
    expect(getPage).not.toHaveBeenCalled()
  })
})
