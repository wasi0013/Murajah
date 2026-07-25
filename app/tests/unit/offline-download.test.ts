import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FontManifest } from '@/core/fonts'

const fontManifest: FontManifest = {
  qpc: { family: 'QPCPage', pathTemplate: 'fonts/qpc-v2/p{page}.woff2', pages: 2 },
  tajweed: { family: 'TajweedPage', pathTemplate: 'fonts/tajweed/p{page}.woff2', pages: 2, color: true },
  indopak: { family: 'IndopakNastaleeq', path: 'fonts/indopak/font.woff2' },
}

const hashes: Record<string, string> = {
  qpc: 'h-qpc',
  indopak: 'h-indopak',
  'tr-en': 'h-tr-en',
  'tr-bn': 'h-tr-bn',
  'tafsir-ar': 'h-tafsir-ar',
  'tafsir-en': 'h-tafsir-en',
  'tafsir-bn': 'h-tafsir-bn',
  morphology: 'h-morphology',
  surahNames: 'h-surahNames',
  tafsirMapQpc: 'h-tafsirMapQpc',
  tafsirMapIndopak: 'h-tafsirMapIndopak',
  navQpc: 'h-navQpc',
  navIndopak: 'h-navIndopak',
}

const getPage = vi.fn((_layout: string, page: number) => Promise.resolve({ page }))
const getTranslations = vi.fn(() => Promise.resolve({}))
const getTafsir = vi.fn(() => Promise.resolve({}))
const getMorphology = vi.fn(() => Promise.resolve({}))
const getSurahNames = vi.fn(() => Promise.resolve({}))
const getTafsirMapping = vi.fn(() => Promise.resolve({}))
const getNavIndex = vi.fn(() => Promise.resolve({}))
const manifestHash = vi.fn((kind: 'dataset' | 'index', name: string) => hashes[name] ?? null)

const dataClient = {
  init: vi.fn(() => Promise.resolve()),
  pageCount: vi.fn((layout: string) => (layout === 'qpc' ? 2 : 3)),
  getPage,
  getTranslations,
  getTafsir,
  getMorphology,
  getSurahNames,
  getTafsirMapping,
  getNavIndex,
  manifestHash,
}

const getPageBlob = vi.fn((page: number) => Promise.resolve(new Blob([`p${page}`])))
const mushafClient = { init: vi.fn(() => Promise.resolve()), pageCount: vi.fn(() => 2), getPageBlob }

const fetchBuffer = vi.fn(() => Promise.resolve(new ArrayBuffer(1)))

vi.mock('@/core/data', () => ({ getDataClient: () => dataClient }))
vi.mock('@/core/mushaf', () => ({ getMushafClient: () => mushafClient }))
vi.mock('@/core/fonts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/fonts')>()
  return {
    ...actual,
    getFontLoader: () => ({ init: vi.fn(() => Promise.resolve(fontManifest)) }),
    getFontCache: () => ({ fetchBuffer }),
  }
})

const prefs = new Map<string, unknown>()
vi.mock('@/core/storage/prefs', () => ({
  getPref: (key: string) => Promise.resolve(prefs.get(key)),
  setPref: (key: string, value: unknown) => {
    prefs.set(key, value)
    return Promise.resolve()
  },
}))

// 2 surah-scoped datasets (tr-en/tr-bn) at 114 surahs each, etc. — the surah
// count is a fixed module constant (matches the real Quran), not mockable.
const SURAH_COUNT = 114

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules() // the composable's `state` is module-scope — isolate it per test
  manifestHash.mockImplementation((_kind, name) => hashes[name] ?? null)
  dataClient.pageCount.mockImplementation((layout: string) => (layout === 'qpc' ? 2 : 3))
  getPage.mockImplementation((_layout: string, page: number) => Promise.resolve({ page }))
  prefs.clear()
})

describe('useOfflineDownload', () => {
  it('downloads every dataset, index, image, and font, then marks the pack done', async () => {
    const { useOfflineDownload } = await import('@/composables/useOfflineDownload')
    const offline = useOfflineDownload()

    await offline.download()

    expect(offline.state.pack.status).toBe('done')
    expect(getPage).toHaveBeenCalledTimes(2 + 3) // qpc + indopak page counts
    expect(getTranslations).toHaveBeenCalledTimes(2 * SURAH_COUNT) // en + bn
    expect(getTafsir).toHaveBeenCalledTimes(3 * SURAH_COUNT) // ar + en + bn
    expect(getMorphology).toHaveBeenCalledTimes(SURAH_COUNT)
    expect(getSurahNames).toHaveBeenCalledTimes(1)
    expect(getTafsirMapping).toHaveBeenCalledTimes(2) // qpc + indopak
    expect(getNavIndex).toHaveBeenCalledTimes(2)
    expect(getPageBlob).toHaveBeenCalledTimes(2) // mushaf.pageCount()
    // 2 qpc font pages + 2 tajweed font pages + 1 indopak font file
    expect(fetchBuffer).toHaveBeenCalledTimes(5)

    const stored = prefs.get('offlinePack') as { complete: boolean; hashes: Record<string, string> }
    expect(stored.complete).toBe(true)
    expect(stored.hashes.qpc).toBe('h-qpc')
    expect(stored.hashes['tr-en']).toBe('h-tr-en')
    // Images/fonts have no comparable hash — never recorded.
    expect(stored.hashes.images).toBeUndefined()
    expect(stored.hashes['font-qpc']).toBeUndefined()
  })

  it('cancel stops before every task completes, and a second call resumes', async () => {
    const { useOfflineDownload } = await import('@/composables/useOfflineDownload')
    const offline = useOfflineDownload()

    // Block exactly the first call (regardless of which layout/page it is for
    // — several tasks share the page-2 number across layouts) so the test
    // deterministically has exactly one in-flight task to unblock.
    let blocked = false
    let resolveBlocked: () => void = () => {}
    getPage.mockImplementation((_layout: string, page: number) => {
      if (!blocked) {
        blocked = true
        return new Promise((resolve) => (resolveBlocked = () => resolve({ page })))
      }
      return Promise.resolve({ page })
    })

    const run = offline.download()
    await new Promise((r) => setTimeout(r, 0))
    offline.cancel()
    resolveBlocked()
    await run

    expect(offline.state.pack.status).toBe('canceled')
    expect(prefs.get('offlinePack')).toBeUndefined()

    getPage.mockImplementation((_layout: string, page: number) => Promise.resolve({ page }))
    await offline.download()
    expect(offline.state.pack.status).toBe('done')
  })

  it('hydrate restores a "done" status from a prior session without re-fetching', async () => {
    prefs.set('offlinePack', { complete: true, hashes })
    const { useOfflineDownload } = await import('@/composables/useOfflineDownload')
    const offline = useOfflineDownload()

    await offline.hydrate()

    expect(offline.state.pack.status).toBe('done')
    expect(getPage).not.toHaveBeenCalled()
  })
})

describe('reconcileOfflinePack', () => {
  it('is a no-op if no full download was ever completed', async () => {
    const { reconcileOfflinePack } = await import('@/composables/useOfflineDownload')
    await reconcileOfflinePack()
    expect(getTafsir).not.toHaveBeenCalled()
  })

  it('is a no-op when every hash still matches the stored record', async () => {
    prefs.set('offlinePack', { complete: true, hashes })
    const { reconcileOfflinePack } = await import('@/composables/useOfflineDownload')
    await reconcileOfflinePack()
    expect(getTafsir).not.toHaveBeenCalled()
    expect(getPage).not.toHaveBeenCalled()
  })

  it('silently re-fetches only the dataset whose hash changed, and updates the record', async () => {
    prefs.set('offlinePack', { complete: true, hashes })
    manifestHash.mockImplementation((_kind, name) =>
      name === 'tafsir-en' ? 'h-tafsir-en-NEW' : (hashes[name] ?? null),
    )

    const { reconcileOfflinePack } = await import('@/composables/useOfflineDownload')
    await reconcileOfflinePack()

    // Only the changed dataset's tasks ran — nothing else.
    expect(getTafsir).toHaveBeenCalledTimes(SURAH_COUNT) // just the en pass, not ar/bn too
    expect(getPage).not.toHaveBeenCalled()
    expect(getTranslations).not.toHaveBeenCalled()
    expect(getMorphology).not.toHaveBeenCalled()

    const stored = prefs.get('offlinePack') as { complete: boolean; hashes: Record<string, string> }
    expect(stored.hashes['tafsir-en']).toBe('h-tafsir-en-NEW')
    expect(stored.hashes.qpc).toBe('h-qpc') // untouched datasets keep their hash
  })
})
