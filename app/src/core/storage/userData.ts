import { idbGet, openDb, txDone } from './idb'

/**
 * Persistence for migratable user data (mistakes now; memorized pages, perfect
 * revisions, etc. join in Phase 4) — the local-first source of truth that must
 * survive across sessions and stay importable from legacy backups. Stored in its
 * own DB, separate from the regenerable asset cache and from view prefs. Maps and
 * Sets are serialized to plain JSON for storage.
 */
const DB_NAME = 'murajah-userdata'
const DB_VERSION = 1
const STORE = 'data'
const MISTAKES_KEY = 'mistakes'
const PROGRESS_KEY = 'progress'

/** On-disk mistakes shape: `{ "<qpcPage>": wordId[] }` (matches legacy export). */
export type StoredMistakes = Record<string, number[]>

/** SM-2 defaults for a page that has never had a scheduled recall (Phase 5.0). */
const DEFAULT_INTERVAL = 1
const DEFAULT_EASE_FACTOR = 2.5

/** Local calendar date as `YYYY-MM-DD` (storage layer has no store dependency). */
function isoToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * The single per-page review record (Phase 5): recency (`lastReviewDate`,
 * `reviewCount`, feeding weakness scoring) **and** the SM-2 schedule (`interval`,
 * `easeFactor`, `nextReviewDate`, `consecutiveCorrect`, driving the daily revision
 * queue). One record per page — shared by the scorer and the scheduler, never
 * duplicated per-plan. Phase-4 data / legacy backups carry only the recency pair;
 * `normalizeSchedule` fills the SM-2 fields with sane defaults on load.
 */
export interface ReviewSchedule {
  /** Local calendar date of the most recent review, `YYYY-MM-DD`. */
  lastReviewDate: string
  /** Times the page has been reviewed (reading-reward earned or a clean revision). */
  reviewCount: number
  /** Current SM-2 interval in days. */
  interval: number
  /** Current SM-2 ease factor (≥ 1.3). */
  easeFactor: number
  /** Local calendar date the page is next due, `YYYY-MM-DD`. */
  nextReviewDate: string
  /** Consecutive passing recalls (resets to 0 on a failed recall). */
  consecutiveCorrect: number
}

/**
 * Fill a partial record (recency known) with SM-2 defaults, **preserving** any
 * existing schedule fields — so a reading-reward mark bumps recency without
 * resetting spaced-repetition state, and legacy/Phase-4 records hydrate cleanly.
 */
export function normalizeSchedule(
  s: Partial<ReviewSchedule> & { lastReviewDate: string; reviewCount: number },
): ReviewSchedule {
  return {
    lastReviewDate: s.lastReviewDate,
    reviewCount: s.reviewCount,
    interval: s.interval ?? DEFAULT_INTERVAL,
    easeFactor: s.easeFactor ?? DEFAULT_EASE_FACTOR,
    consecutiveCorrect: s.consecutiveCorrect ?? 0,
    nextReviewDate: s.nextReviewDate ?? s.lastReviewDate ?? isoToday(),
  }
}

/**
 * On-disk memorization progress (canonical 604-page Madani scheme). `memorized`
 * and `perfectRevisions` reuse the legacy export keys; `hasanah` is the new
 * cumulative reward counter (Phase 4). `perfectRevisions` is the UI "memorization
 * strength". `reviewData` is the lightweight review history (Phase 4.8; absent in
 * legacy backups → empty).
 */
export interface StoredProgress {
  memorized: number[]
  perfectRevisions: Record<string, number>
  hasanah: number
  reviewData?: Record<string, ReviewSchedule>
}

export interface Progress {
  memorized: Set<number>
  strength: Map<number, number>
  hasanah: number
  reviewData: Map<number, ReviewSchedule>
}

let dbPromise: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDb(DB_NAME, DB_VERSION, (d) => {
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE)
    })
  }
  return dbPromise
}

export function serializeMistakes(map: Map<number, Set<number>>): StoredMistakes {
  const out: StoredMistakes = {}
  for (const [page, set] of map) out[String(page)] = [...set]
  return out
}

export function deserializeMistakes(stored: StoredMistakes | undefined): Map<number, Set<number>> {
  const map = new Map<number, Set<number>>()
  for (const [page, ids] of Object.entries(stored ?? {})) {
    map.set(Number(page), new Set(ids))
  }
  return map
}

/** Load persisted mistakes (empty map if none / on error). */
export async function loadMistakes(): Promise<Map<number, Set<number>>> {
  try {
    const tx = (await db()).transaction(STORE, 'readonly')
    const stored = await idbGet<StoredMistakes>(tx.objectStore(STORE), MISTAKES_KEY)
    await txDone(tx)
    return deserializeMistakes(stored)
  } catch {
    return new Map()
  }
}

/** Persist mistakes (best-effort). */
export async function saveMistakes(map: Map<number, Set<number>>): Promise<void> {
  try {
    const tx = (await db()).transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(serializeMistakes(map), MISTAKES_KEY)
    await txDone(tx)
  } catch {
    /* best-effort */
  }
}

export function serializeProgress(p: Progress): StoredProgress {
  const perfectRevisions: Record<string, number> = {}
  for (const [page, n] of p.strength) if (n > 0) perfectRevisions[String(page)] = n
  // Rebuild plain objects — the store's values may be Vue reactive proxies, which
  // IndexedDB's structured clone cannot serialize.
  const reviewData: Record<string, ReviewSchedule> = {}
  for (const [page, r] of p.reviewData) {
    reviewData[String(page)] = {
      lastReviewDate: r.lastReviewDate,
      reviewCount: r.reviewCount,
      interval: r.interval,
      easeFactor: r.easeFactor,
      nextReviewDate: r.nextReviewDate,
      consecutiveCorrect: r.consecutiveCorrect,
    }
  }
  return {
    memorized: [...p.memorized].sort((a, b) => a - b),
    perfectRevisions,
    hasanah: p.hasanah,
    reviewData,
  }
}

export function deserializeProgress(stored: StoredProgress | undefined): Progress {
  const strength = new Map<number, number>()
  for (const [page, n] of Object.entries(stored?.perfectRevisions ?? {})) strength.set(Number(page), n)
  const reviewData = new Map<number, ReviewSchedule>()
  for (const [page, r] of Object.entries(stored?.reviewData ?? {})) {
    reviewData.set(Number(page), normalizeSchedule(r))
  }
  return {
    memorized: new Set((stored?.memorized ?? []).map(Number)),
    strength,
    hasanah: stored?.hasanah ?? 0,
    reviewData,
  }
}

/** Load persisted progress (empty if none / on error). */
export async function loadProgress(): Promise<Progress> {
  try {
    const tx = (await db()).transaction(STORE, 'readonly')
    const stored = await idbGet<StoredProgress>(tx.objectStore(STORE), PROGRESS_KEY)
    await txDone(tx)
    return deserializeProgress(stored)
  } catch {
    return deserializeProgress(undefined)
  }
}

/** Persist progress (best-effort). */
export async function saveProgress(p: Progress): Promise<void> {
  try {
    const tx = (await db()).transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(serializeProgress(p), PROGRESS_KEY)
    await txDone(tx)
  } catch {
    /* best-effort */
  }
}

/** Test hook: drop the cached connection. */
export function _resetUserDataDb(): void {
  dbPromise = null
}
