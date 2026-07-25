import { reactive } from 'vue'
import { getDataClient } from '@/core/data'
import { getMushafClient } from '@/core/mushaf'
import { getFontLoader, getFontCache, fontPath, fontPageCount } from '@/core/fonts'
import type { FontManifest } from '@/core/fonts'
import type { Layout } from '@/core/data/types'
import { getPref, setPref } from '@/core/storage/prefs'

/**
 * Offline download manager: a single "download for offline" pack covering
 * everything the app can read — both layouts' text, both QPC font variants +
 * the Indopak font, mushaf page scans, translations, tafsir, morphology, nav
 * indexes, surah names, and tafsir mappings (~272MB). This all goes through
 * the same persistent caches normal reading already uses (AssetCache-backed
 * JSON/image/font caches), so completing it just means those caches are warm
 * for every page instead of only the ones a user happened to visit.
 *
 * Resumable "for free": each fetch checks its own cache first, so re-running
 * after a reload or a prior cancel fast-skips whatever's already downloaded.
 *
 * Self-healing: every JSON dataset/index carries a content hash (see
 * data-pipeline/src/lib/manifest.mjs + core/data/paths.ts's `?v=` hashing).
 * `reconcileOfflinePack()` compares the hashes captured at last full download
 * against the freshly-fetched manifest's current ones and silently re-fetches
 * only the datasets that actually changed — so a later data correction (e.g. a
 * tafsir fix) reaches a completed offline pack automatically, the next time
 * the app boots online, with no user action and no full re-download. Images
 * and fonts aren't part of this reconciliation: they're static reference
 * assets (mushaf scans / per-page glyph fonts) with no comparable per-URL
 * content hash today, and in practice don't change.
 */
const SIZE_ESTIMATE_MB = 272
const OFFLINE_PACK_PREF = 'offlinePack'
const CONCURRENCY = 6
const SURAH_COUNT = 114
const WBW_LANGS = ['en', 'bn'] as const
const TAFSIR_LANGS = ['ar', 'en', 'bn'] as const
const LAYOUTS: Layout[] = ['qpc', 'indopak']

export type DownloadStatus = 'idle' | 'downloading' | 'done' | 'canceled' | 'error'

interface PackState {
  status: DownloadStatus
  done: number
  total: number
  sizeEstimateMb: number
}

/** Per-dataset/index hash captured at the last successful full download —
 * `null` for groups with no comparable content hash (images, fonts). */
interface OfflinePackRecord {
  complete: boolean
  hashes: Record<string, string>
}

interface Group {
  /** Matches a `manifest.datasets`/`manifest.indexes` key, or a synthetic
   * name (images/fonts) that's simply never reconciled. */
  name: string
  hash: string | null
  tasks: Array<() => Promise<void>>
}

const state = reactive({
  pack: { status: 'idle', done: 0, total: 0, sizeEstimateMb: SIZE_ESTIMATE_MB } as PackState,
})

let cancelFlag = false

/** Run a heterogeneous task list, `concurrency` at a time. One failing task
 * never aborts the rest of the pack. */
async function runTaskPool(
  tasks: Array<() => Promise<void>>,
  concurrency: number,
  isCanceled: () => boolean,
  onProgress: () => void,
): Promise<boolean> {
  let next = 0
  async function worker(): Promise<void> {
    while (next < tasks.length) {
      if (isCanceled()) return
      const task = tasks[next++]
      await task().catch(() => {})
      onProgress()
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker))
  return !isCanceled()
}

/** Build every dataset/index/image/font as its own named group, so a full
 * download can flatten all of them while reconciliation can re-run just one. */
async function buildGroups(): Promise<Group[]> {
  const data = getDataClient()
  await data.init()
  const mushaf = getMushafClient()
  await mushaf.init()
  const fontManifest: FontManifest = await getFontLoader().init()
  const fontCache = getFontCache()

  const surahs = Array.from({ length: SURAH_COUNT }, (_, i) => i + 1)
  const groups: Group[] = []

  for (const layout of LAYOUTS) {
    const count = data.pageCount(layout)
    groups.push({
      name: layout,
      hash: data.manifestHash('dataset', layout),
      tasks: Array.from({ length: count }, (_, i) => {
        const page = i + 1
        return () => data.getPage(layout, page).then(() => {})
      }),
    })
  }

  for (const lang of WBW_LANGS) {
    groups.push({
      name: `tr-${lang}`,
      hash: data.manifestHash('dataset', `tr-${lang}`),
      tasks: surahs.map((surah) => () => data.getTranslations(lang, surah).then(() => {})),
    })
  }

  for (const lang of TAFSIR_LANGS) {
    groups.push({
      name: `tafsir-${lang}`,
      hash: data.manifestHash('dataset', `tafsir-${lang}`),
      tasks: surahs.map((surah) => () => data.getTafsir(lang, surah).then(() => {})),
    })
  }

  groups.push({
    name: 'morphology',
    hash: data.manifestHash('dataset', 'morphology'),
    tasks: surahs.map((surah) => () => data.getMorphology(surah).then(() => {})),
  })

  groups.push({
    name: 'surahNames',
    hash: data.manifestHash('index', 'surahNames'),
    tasks: [() => data.getSurahNames().then(() => {})],
  })

  for (const layout of LAYOUTS) {
    const indexName = layout === 'qpc' ? 'tafsirMapQpc' : 'tafsirMapIndopak'
    groups.push({
      name: indexName,
      hash: data.manifestHash('index', indexName),
      tasks: [() => data.getTafsirMapping(layout).then(() => {})],
    })
  }

  for (const layout of LAYOUTS) {
    const indexName = layout === 'qpc' ? 'navQpc' : 'navIndopak'
    groups.push({
      name: indexName,
      hash: data.manifestHash('index', indexName),
      tasks: [() => data.getNavIndex(layout).then(() => {})],
    })
  }

  const imageCount = mushaf.pageCount()
  groups.push({
    name: 'images',
    hash: null,
    tasks: Array.from({ length: imageCount }, (_, i) => {
      const page = i + 1
      return () => mushaf.getPageBlob(page).then(() => {})
    }),
  })

  const qpcFontCount = fontPageCount(fontManifest, 'qpc', false)
  groups.push({
    name: 'font-qpc',
    hash: null,
    tasks: Array.from({ length: qpcFontCount }, (_, i) => {
      const page = i + 1
      return () => fontCache.fetchBuffer(fontPath(fontManifest, { layout: 'qpc', page, tajweed: false })).then(() => {})
    }),
  })

  const tajweedFontCount = fontPageCount(fontManifest, 'qpc', true)
  groups.push({
    name: 'font-tajweed',
    hash: null,
    tasks: Array.from({ length: tajweedFontCount }, (_, i) => {
      const page = i + 1
      return () => fontCache.fetchBuffer(fontPath(fontManifest, { layout: 'qpc', page, tajweed: true })).then(() => {})
    }),
  })

  groups.push({
    name: 'font-indopak',
    hash: null,
    tasks: [() => fontCache.fetchBuffer(fontPath(fontManifest, { layout: 'indopak', page: 1 })).then(() => {})],
  })

  return groups
}

export function useOfflineDownload() {
  async function hydrate(): Promise<void> {
    const record = await getPref<OfflinePackRecord>(OFFLINE_PACK_PREF)
    if (record?.complete && state.pack.status === 'idle') {
      state.pack.status = 'done'
    }
  }

  async function download(): Promise<void> {
    if (state.pack.status === 'downloading') return
    cancelFlag = false
    state.pack.status = 'downloading'

    // Best effort, right when the user commits to a large download — this is
    // the moment with the best odds of the browser granting persistent
    // storage, which keeps the OS from evicting it all under pressure later.
    void navigator.storage?.persist?.().catch(() => {})

    try {
      const groups = await buildGroups()
      const tasks = groups.flatMap((g) => g.tasks)
      state.pack.total = tasks.length
      state.pack.done = 0

      const completed = await runTaskPool(
        tasks,
        CONCURRENCY,
        () => cancelFlag,
        () => state.pack.done++,
      )

      if (completed) {
        state.pack.status = 'done'
        const hashes: Record<string, string> = {}
        for (const g of groups) if (g.hash !== null) hashes[g.name] = g.hash
        void setPref(OFFLINE_PACK_PREF, { complete: true, hashes } satisfies OfflinePackRecord)
      } else {
        state.pack.status = 'canceled'
      }
    } catch {
      state.pack.status = 'error'
    }
  }

  function cancel(): void {
    cancelFlag = true
  }

  return { state, hydrate, download, cancel }
}

/**
 * Silently re-fetch just the datasets/indexes whose content changed since the
 * last completed full download. No-op if no download was ever completed, and
 * never touches `state.pack` — this is a background correctness pass, not a
 * user-visible download. Safe to call on every app boot; cheap when nothing
 * changed (a handful of hash comparisons, no network beyond the manifest
 * fetch `DataClient.init()` already dedupes).
 */
export async function reconcileOfflinePack(): Promise<void> {
  const record = await getPref<OfflinePackRecord>(OFFLINE_PACK_PREF)
  if (!record?.complete) return

  const groups = await buildGroups()
  const changed = groups.filter((g) => g.hash !== null && record.hashes[g.name] !== g.hash)
  if (changed.length === 0) return

  const nextHashes = { ...record.hashes }
  await Promise.all(
    changed.map(async (g) => {
      const ok = await runTaskPool(g.tasks, CONCURRENCY, () => false, () => {})
      if (ok && g.hash !== null) nextHashes[g.name] = g.hash
    }),
  )
  void setPref(OFFLINE_PACK_PREF, { complete: true, hashes: nextHashes } satisfies OfflinePackRecord)
}
