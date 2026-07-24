import { reactive } from 'vue'
import { getDataClient } from '@/core/data'
import { getMushafClient } from '@/core/mushaf'
import { getPref, setPref } from '@/core/storage/prefs'

/**
 * Offline download manager (plan §10.5): opt-in prefetch of the reader's QPC
 * page data into the existing `murajah-assets` AssetCache, and — separately,
 * because it's ~8x larger — the mushaf page scans into `murajah-images`. Both
 * caches already exist (Phase 1); this only drives them across every page.
 *
 * Resumable "for free": each `getPage`/`getPageBlob` call checks its own
 * persistent cache first, so re-running after a reload or a prior cancel just
 * fast-skips whatever's already downloaded rather than re-fetching it — no
 * separate progress-index bookkeeping needed. A `DOWNLOADED_PREF` flag per
 * pack short-circuits full re-verification on a later visit once complete.
 *
 * Sizes are static estimates (data-pipeline build output), not measured
 * per-request — good enough for "size shown" without instrumenting every
 * fetch, and the two packs are what §10.5 splits: fonts are deliberately not
 * bundled in — they're small per-page (~190KB) and already cache themselves
 * via the SW's `/fonts/*` stale-while-revalidate route (§10.1) as the reader
 * actually visits pages, so bulk-downloading the full ~145MB font set as part
 * of a "default pack" would be a poor default, not a gap.
 */
const TEXT_SIZE_ESTIMATE_MB = 8
const IMAGES_SIZE_ESTIMATE_MB = 68
const TEXT_DONE_PREF = 'offlineTextDownloaded'
const IMAGES_DONE_PREF = 'offlineImagesDownloaded'
const CONCURRENCY = 6

export type DownloadStatus = 'idle' | 'downloading' | 'done' | 'canceled' | 'error'

interface PackState {
  status: DownloadStatus
  done: number
  total: number
  sizeEstimateMb: number
}

const state = reactive({
  text: { status: 'idle', done: 0, total: 0, sizeEstimateMb: TEXT_SIZE_ESTIMATE_MB } as PackState,
  images: { status: 'idle', done: 0, total: 0, sizeEstimateMb: IMAGES_SIZE_ESTIMATE_MB } as PackState,
})

let textCancel = false
let imagesCancel = false

/** Run `fn` over `1..count`, `concurrency` at a time, calling `onProgress` after each. */
async function runPool(
  count: number,
  concurrency: number,
  isCanceled: () => boolean,
  fn: (page: number) => Promise<void>,
  onProgress: () => void,
): Promise<boolean> {
  let next = 1
  async function worker(): Promise<void> {
    while (next <= count) {
      if (isCanceled()) return
      const page = next++
      await fn(page).catch(() => {}) // one bad page shouldn't abort the pack
      onProgress()
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, count) }, worker))
  return !isCanceled()
}

export function useOfflineDownload() {
  async function hydrate(): Promise<void> {
    if ((await getPref<boolean>(TEXT_DONE_PREF)) && state.text.status === 'idle') {
      state.text.status = 'done'
    }
    if ((await getPref<boolean>(IMAGES_DONE_PREF)) && state.images.status === 'idle') {
      state.images.status = 'done'
    }
  }

  async function downloadText(): Promise<void> {
    if (state.text.status === 'downloading') return
    textCancel = false
    state.text.status = 'downloading'
    const client = getDataClient()
    await client.init()
    const total = client.pageCount('qpc')
    state.text.total = total
    state.text.done = 0
    const completed = await runPool(
      total,
      CONCURRENCY,
      () => textCancel,
      (page) => client.getPage('qpc', page).then(() => {}),
      () => state.text.done++,
    )
    if (completed) {
      state.text.status = 'done'
      void setPref(TEXT_DONE_PREF, true)
    } else {
      state.text.status = 'canceled'
    }
  }

  async function downloadImages(): Promise<void> {
    if (state.images.status === 'downloading') return
    imagesCancel = false
    state.images.status = 'downloading'
    const client = getMushafClient()
    await client.init()
    const total = client.pageCount()
    state.images.total = total
    state.images.done = 0
    const completed = await runPool(
      total,
      CONCURRENCY,
      () => imagesCancel,
      (page) => client.getPageBlob(page).then(() => {}),
      () => state.images.done++,
    )
    if (completed) {
      state.images.status = 'done'
      void setPref(IMAGES_DONE_PREF, true)
    } else {
      state.images.status = 'canceled'
    }
  }

  function cancelText(): void {
    textCancel = true
  }
  function cancelImages(): void {
    imagesCancel = true
  }

  return { state, hydrate, downloadText, downloadImages, cancelText, cancelImages }
}
