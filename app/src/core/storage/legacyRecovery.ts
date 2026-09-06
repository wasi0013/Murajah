// Recovers a returning legacy user's memorization data straight from the
// still-present `murajah-db` IndexedDB database (see plans/archive/legacy-schema.md) —
// no export/import file required. Surfaced as a Settings → Danger zone option,
// visible only while `hasLegacyData()` is true.
//
// Scope is deliberately the same portable subset `exportImport.ts`'s
// `fromLegacy` bridge already carries: memorized pages, strength
// (perfectRevisions), mistakes, and the reader layout/tajweed prefs. `notes`
// has no home in the new app (Phase 8 dropped notes/journal); the legacy
// `dailyGoals` streak and `plans`/`planHistory` don't map onto the new
// DayLog/PlanConfig shapes (see exportImport.ts's own comment on this) — none
// of those are recoverable here, by the same boundary the JSON export/import
// path already draws.
//
// Recovered data is MERGED onto whatever's already in the new app's stores,
// never replaced: a returning user may have already started fresh (marked
// pages, logged mistakes) before finding this option, and that work must
// survive the merge untouched. Only after the merge is verified on disk does
// this delete the legacy database — and only a genuine deletion counts: a
// blocked delete (another tab still has `murajah-db` open) leaves it in place
// so the option stays visible and safe to retry.

import {
  readImport,
  buildExport,
  type ExportSnapshot,
} from './exportImport'
import {
  loadProgress,
  saveProgress,
  deserializeProgress,
  backfillReviewDates,
  loadMistakes,
  saveMistakes,
  deserializeMistakes,
  type Progress,
} from './userData'
import { getPref, setPref } from './prefs'
import { downloadBackup } from './backupFile'
import { LEGACY_EXPORT_VERSION, type LegacyExport } from './legacyExport'
import type { ReaderPrefs } from '@/stores/reader'

export const LEGACY_DB_NAME = 'murajah-db'
const APPDATA_STORE = 'appData'
const APPDATA_KEY = 'murajah-data'
const READER_PREF_KEY = 'reader'

interface LegacyAppData {
  id: string
  memorized?: number[]
  perfectRevisions?: Record<string, number>
  mistakes?: Record<string, number[]>
  settings?: Record<string, unknown>
}

/**
 * True if the legacy database still exists in this browser. Read-only by
 * design: `indexedDB.databases()` never opens anything, unlike
 * `indexedDB.open(name)` with no matching database, which would *create* one
 * as a side effect and make this check corrupt its own answer.
 */
export async function hasLegacyData(): Promise<boolean> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return false
  try {
    const dbs = await indexedDB.databases()
    return dbs.some((d) => d.name === LEGACY_DB_NAME)
  } catch {
    return false
  }
}

/**
 * Open the legacy database at whatever version it's already at. Deliberately
 * passes no version: an explicit version could throw `VersionError` against a
 * real device's DB (whose version we don't control), and — critically — if
 * the database didn't exist, `indexedDB.open(name, version)` would create it.
 */
function openLegacyDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    const req = indexedDB.open(LEGACY_DB_NAME)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
  })
}

function readLegacyAppData(db: IDBDatabase): Promise<LegacyAppData | null> {
  if (!db.objectStoreNames.contains(APPDATA_STORE)) return Promise.resolve(null)
  return new Promise((resolve) => {
    const tx = db.transaction(APPDATA_STORE, 'readonly')
    const req = tx.objectStore(APPDATA_STORE).get(APPDATA_KEY)
    req.onsuccess = () => resolve((req.result as LegacyAppData | undefined) ?? null)
    req.onerror = () => resolve(null)
  })
}

/**
 * Merge incoming progress onto the current store: union memorized pages, take
 * the higher strength per page (never lower what a fresh session already
 * built up), leave hasanah as-is — legacy carries no hasanah equivalent (see
 * `exportImport.ts`'s `fromLegacy`, which makes the same choice), so recovery
 * doesn't mint any either.
 */
async function mergeProgress(incoming: Progress | null): Promise<void> {
  if (!incoming) return
  const current = await loadProgress()
  const strength = new Map(current.strength)
  for (const [page, n] of incoming.strength) {
    strength.set(page, Math.max(strength.get(page) ?? 0, n))
  }
  // Carry over incoming review dates (backfilled to today by the caller, since
  // legacy exports never carry `reviewData`) for pages the current session
  // doesn't already track — never overwrite real, already-tracked history.
  const reviewData = new Map(current.reviewData)
  for (const [page, r] of incoming.reviewData) {
    if (!reviewData.has(page)) reviewData.set(page, r)
  }
  // Same "current wins, incoming only fills gaps" rule as reviewData above —
  // in practice incoming is always empty here (legacy exports predate this
  // field entirely), but merges the same way if that ever changes.
  const memorizedAt = new Map(current.memorizedAt)
  for (const [page, ts] of incoming.memorizedAt) {
    if (!memorizedAt.has(page)) memorizedAt.set(page, ts)
  }
  await saveProgress({
    memorized: new Set([...current.memorized, ...incoming.memorized]),
    strength,
    hasanah: current.hasanah,
    reviewData,
    memorizedAt,
  })
}

/** Merge incoming mistakes onto the current store: union per-page word ids. */
async function mergeMistakes(incoming: Map<number, Set<number>> | null): Promise<void> {
  if (!incoming) return
  const current = await loadMistakes()
  const merged = new Map(current)
  for (const [page, words] of incoming) {
    merged.set(page, new Set([...(merged.get(page) ?? []), ...words]))
  }
  await saveMistakes(merged)
}

/** Merge incoming reader prefs onto the existing ones — never a blind replace. */
async function mergeReaderPrefs(reader: Partial<ReaderPrefs> | undefined): Promise<void> {
  if (!reader) return
  const existing = (await getPref<ReaderPrefs>(READER_PREF_KEY)) ?? {}
  await setPref(READER_PREF_KEY, { ...existing, ...reader })
}

/**
 * Deletes the legacy database. `onblocked` (another tab still has it open) is
 * reported distinctly from success — the caller must not treat it as "gone."
 */
function deleteLegacyDatabase(): Promise<'ok' | 'blocked' | 'error'> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(LEGACY_DB_NAME)
    req.onsuccess = () => resolve('ok')
    req.onerror = () => resolve('error')
    req.onblocked = () => resolve('blocked')
  })
}

export type RecoveryResult =
  | { status: 'recovered' }
  | { status: 'no-data' }
  | { status: 'delete-blocked' }
  | { status: 'error' }

/**
 * Recover a returning legacy user's memorization data straight from
 * `murajah-db`: merge it onto whatever's already in the new app, download a
 * JSON backup of what was recovered (the only remaining copy once the legacy
 * database is gone), verify the merge landed, then delete `murajah-db`.
 */
export async function recoverLegacyData(): Promise<RecoveryResult> {
  const legacyDb = await openLegacyDb()
  if (!legacyDb) return { status: 'no-data' }

  const appData = await readLegacyAppData(legacyDb)
  legacyDb.close()
  if (!appData) return { status: 'no-data' }

  const legacyExport: Partial<LegacyExport> = {
    version: LEGACY_EXPORT_VERSION,
    memorized: appData.memorized ?? [],
    perfectRevisions: appData.perfectRevisions ?? {},
    mistakes: appData.mistakes ?? {},
    settings: appData.settings ?? {},
  }

  let snap: ExportSnapshot
  try {
    snap = readImport(legacyExport)
  } catch {
    return { status: 'error' }
  }

  // floorStrength: false — this is the isolated incoming side, about to be
  // `Math.max`-merged onto the current store in `mergeProgress` below; see
  // `backfillReviewDates`'s doc comment for why flooring it here would risk
  // raising a page's real current strength. Whoever next calls the plain
  // `loadProgress()` on the true, post-merge state — the app, on the reload
  // that follows a successful recovery — applies the floor once, correctly.
  const incomingProgress = snap.progress
    ? backfillReviewDates(deserializeProgress(snap.progress), undefined, { floorStrength: false }).progress
    : null
  const incomingMistakes = snap.mistakes ? deserializeMistakes(snap.mistakes) : null

  try {
    await Promise.all([
      mergeProgress(incomingProgress),
      mergeMistakes(incomingMistakes),
      mergeReaderPrefs(snap.reader),
    ])

    // Verify the merge actually landed before touching the only other copy.
    if (incomingProgress) {
      const after = await loadProgress()
      for (const page of incomingProgress.memorized) {
        if (!after.memorized.has(page)) throw new Error('recovery verification failed')
      }
    }
  } catch {
    return { status: 'error' }
  }

  // Safety-net copy of what was recovered — the only record of it once the
  // legacy database below is gone.
  downloadBackup(buildExport(snap))

  const deleted = await deleteLegacyDatabase()
  if (deleted === 'blocked') return { status: 'delete-blocked' }
  if (deleted === 'error') return { status: 'error' }
  return { status: 'recovered' }
}
