import type { Layout } from '@/core/data/types'
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
const PLAN_KEY = 'plan'
const DAYLOG_KEY = 'dayLog'
const QUIZ_KEY = 'quiz'
const AUDIO_KEY = 'audio'
const RECORDINGS_KEY = 'recordings'

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

/**
 * The single daily-practice plan (Phase 5) — one editable plan, not a list.
 * `scope` is which pages you maintain; `newFront` is where you're adding new
 * memorization (null = maintenance only, e.g. a hafiz); `pace` is the daily
 * budgets + off days; `habits` are enabled standing-habit ids. The legacy
 * beginner/hafiz/mixed taxonomy collapses into "scope + are you adding new pages?".
 */
export type PlanScope = { kind: 'all-memorized' } | { kind: 'juz'; juz: number[] }

export interface NewFront {
  /** Reading layout the new pages are memorized in. */
  layout: Layout
  /** Next page to memorize (canonical 604-page scheme). */
  nextPage: number
}

export interface PlanPace {
  newPagesPerDay: number
  revisionPagesPerDay: number
  weakPagesPerDay: number
  daysPerWeek: number
  /** Weekday numbers to skip new memorization on (0 = Sunday … 6 = Saturday). */
  offDays: number[]
}

export interface PlanConfig {
  scope: PlanScope
  newFront: NewFront | null
  pace: PlanPace
  /** Ids of enabled standing-habit tasks (recite ayahs, quick test, …). */
  habits: string[]
  startDate: string
  createdAt: string
}

/** On-disk plan shape — identical to {@link PlanConfig} (already JSON-safe). */
export type StoredPlan = PlanConfig

const DEFAULT_PACE: PlanPace = {
  newPagesPerDay: 1,
  revisionPagesPerDay: 5,
  weakPagesPerDay: 2,
  daysPerWeek: 7,
  offDays: [],
}

/**
 * One day's completion record in the day log (Phase 5) — drives streaks + the
 * history calendar. `completed` = every planned task was done that day; the arrays
 * are the pages actually finished per section (canonical scheme), habits by id.
 */
export interface DayRecord {
  date: string
  completed: boolean
  newMemorization: number[]
  revision: number[]
  weak: number[]
  habits: string[]
}

/** Date (`YYYY-MM-DD`) → that day's completion record. */
export type DayLog = Map<string, DayRecord>
export type StoredDayLog = Record<string, DayRecord>

export function serializePlan(p: PlanConfig | null): StoredPlan | null {
  if (!p) return null
  // Rebuild plain objects/arrays — the store's values may be Vue reactive proxies.
  const scope: PlanScope =
    p.scope.kind === 'juz' ? { kind: 'juz', juz: [...p.scope.juz] } : { kind: 'all-memorized' }
  return {
    scope,
    newFront: p.newFront ? { layout: p.newFront.layout, nextPage: p.newFront.nextPage } : null,
    pace: {
      newPagesPerDay: p.pace.newPagesPerDay,
      revisionPagesPerDay: p.pace.revisionPagesPerDay,
      weakPagesPerDay: p.pace.weakPagesPerDay,
      daysPerWeek: p.pace.daysPerWeek,
      offDays: [...p.pace.offDays],
    },
    habits: [...p.habits],
    startDate: p.startDate,
    createdAt: p.createdAt,
  }
}

export function deserializePlan(stored: StoredPlan | null | undefined): PlanConfig | null {
  if (!stored) return null
  const scope: PlanScope =
    stored.scope?.kind === 'juz'
      ? { kind: 'juz', juz: [...(stored.scope.juz ?? [])] }
      : { kind: 'all-memorized' }
  const nf = stored.newFront
  const newFront: NewFront | null =
    nf && typeof nf.nextPage === 'number' ? { layout: nf.layout, nextPage: nf.nextPage } : null
  return {
    scope,
    newFront,
    pace: { ...DEFAULT_PACE, ...(stored.pace ?? {}), offDays: [...(stored.pace?.offDays ?? [])] },
    habits: [...(stored.habits ?? [])],
    startDate: stored.startDate ?? isoToday(),
    createdAt: stored.createdAt ?? isoToday(),
  }
}

/** Load the persisted plan (null if none / on error). */
export async function loadPlan(): Promise<PlanConfig | null> {
  try {
    const tx = (await db()).transaction(STORE, 'readonly')
    const stored = await idbGet<StoredPlan>(tx.objectStore(STORE), PLAN_KEY)
    await txDone(tx)
    return deserializePlan(stored)
  } catch {
    return null
  }
}

/** Persist the plan, or clear it when null (best-effort). */
export async function savePlan(p: PlanConfig | null): Promise<void> {
  try {
    const tx = (await db()).transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    if (p) store.put(serializePlan(p), PLAN_KEY)
    else store.delete(PLAN_KEY)
    await txDone(tx)
  } catch {
    /* best-effort */
  }
}

export function serializeDayLog(log: DayLog): StoredDayLog {
  const out: StoredDayLog = {}
  for (const [date, r] of log) {
    out[date] = {
      date: r.date,
      completed: r.completed,
      newMemorization: [...r.newMemorization],
      revision: [...r.revision],
      weak: [...r.weak],
      habits: [...r.habits],
    }
  }
  return out
}

export function deserializeDayLog(stored: StoredDayLog | undefined): DayLog {
  const map: DayLog = new Map()
  for (const [date, r] of Object.entries(stored ?? {})) {
    map.set(date, {
      date: r.date ?? date,
      completed: !!r.completed,
      newMemorization: [...(r.newMemorization ?? [])],
      revision: [...(r.revision ?? [])],
      weak: [...(r.weak ?? [])],
      habits: [...(r.habits ?? [])],
    })
  }
  return map
}

/** Load the persisted day log (empty map if none / on error). */
export async function loadDayLog(): Promise<DayLog> {
  try {
    const tx = (await db()).transaction(STORE, 'readonly')
    const stored = await idbGet<StoredDayLog>(tx.objectStore(STORE), DAYLOG_KEY)
    await txDone(tx)
    return deserializeDayLog(stored)
  } catch {
    return new Map()
  }
}

/** Persist the day log (best-effort). */
export async function saveDayLog(log: DayLog): Promise<void> {
  try {
    const tx = (await db()).transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(serializeDayLog(log), DAYLOG_KEY)
    await txDone(tx)
  } catch {
    /* best-effort */
  }
}

/**
 * On-disk quiz accuracy: `{ "<page>": (0|1)[] }` — each page's bounded window of
 * recent quiz outcomes (Phase 6). Only accuracy is stored; question/session state
 * is never persisted. Shares the app DB (no separate database — that was the legacy
 * iOS-contention source).
 */
export type StoredQuizAccuracy = Record<string, number[]>

export function serializeQuizAccuracy(map: Map<number, number[]>): StoredQuizAccuracy {
  const out: StoredQuizAccuracy = {}
  for (const [page, arr] of map) out[String(page)] = [...arr] // rebuild plain arrays (proxy-safe)
  return out
}

export function deserializeQuizAccuracy(stored: StoredQuizAccuracy | undefined): Map<number, number[]> {
  const map = new Map<number, number[]>()
  for (const [page, arr] of Object.entries(stored ?? {})) map.set(Number(page), [...arr])
  return map
}

/** Load persisted quiz accuracy (empty map if none / on error). */
export async function loadQuizAccuracy(): Promise<Map<number, number[]>> {
  try {
    const tx = (await db()).transaction(STORE, 'readonly')
    const stored = await idbGet<StoredQuizAccuracy>(tx.objectStore(STORE), QUIZ_KEY)
    await txDone(tx)
    return deserializeQuizAccuracy(stored)
  } catch {
    return new Map()
  }
}

/** Persist quiz accuracy (best-effort). */
export async function saveQuizAccuracy(map: Map<number, number[]>): Promise<void> {
  try {
    const tx = (await db()).transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(serializeQuizAccuracy(map), QUIZ_KEY)
    await txDone(tx)
  } catch {
    /* best-effort */
  }
}

/**
 * Audio player preferences (Phase 7.3): the grain, the verse/page reciters, and the
 * playback speed. Only durable preferences — never transient playback (playlist,
 * cursor, time), which starts clean each session. Shares the app DB.
 */
export interface StoredAudioPrefs {
  grain?: string
  verseReciterId?: string
  pageReciterId?: string
  speed?: number
  autoScroll?: boolean
}

/** Load persisted audio prefs (empty object if none / on error). */
export async function loadAudioPrefs(): Promise<StoredAudioPrefs> {
  try {
    const tx = (await db()).transaction(STORE, 'readonly')
    const stored = await idbGet<StoredAudioPrefs>(tx.objectStore(STORE), AUDIO_KEY)
    await txDone(tx)
    return stored ?? {}
  } catch {
    return {}
  }
}

/** Persist audio prefs (best-effort). Rebuilds a plain object (proxy-safe). */
export async function saveAudioPrefs(prefs: StoredAudioPrefs): Promise<void> {
  try {
    const tx = (await db()).transaction(STORE, 'readwrite')
    const plain: StoredAudioPrefs = {
      grain: prefs.grain,
      verseReciterId: prefs.verseReciterId,
      pageReciterId: prefs.pageReciterId,
      speed: prefs.speed,
      autoScroll: prefs.autoScroll,
    }
    tx.objectStore(STORE).put(plain, AUDIO_KEY)
    await txDone(tx)
  } catch {
    /* best-effort */
  }
}

/**
 * Own-recitation recordings (Phase 7.6). Stored as a plain array under one key in
 * the shared app DB — **not** a separate database (the legacy separate DB was the
 * iOS-contention source, bug A5/B5). Blobs are structured-cloneable, so they persist
 * directly; we rebuild the surrounding array/objects to stay proxy-safe.
 */
export interface StoredRecording {
  id: string
  pageNumber: number
  blob: Blob
  mimeType: string
  duration: number
  recordedAt: string
}

/** Load persisted recordings (empty array if none / on error). */
export async function loadRecordings(): Promise<StoredRecording[]> {
  try {
    const tx = (await db()).transaction(STORE, 'readonly')
    const stored = await idbGet<StoredRecording[]>(tx.objectStore(STORE), RECORDINGS_KEY)
    await txDone(tx)
    return Array.isArray(stored) ? stored : []
  } catch {
    return []
  }
}

/** Persist recordings (best-effort). Rebuilds plain objects around the blobs. */
export async function saveRecordings(recordings: readonly StoredRecording[]): Promise<void> {
  try {
    const plain = recordings.map((r) => ({
      id: r.id,
      pageNumber: r.pageNumber,
      blob: r.blob,
      mimeType: r.mimeType,
      duration: r.duration,
      recordedAt: r.recordedAt,
    }))
    const tx = (await db()).transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(plain, RECORDINGS_KEY)
    await txDone(tx)
  } catch {
    /* best-effort */
  }
}

/** Test hook: drop the cached connection. */
export function _resetUserDataDb(): void {
  dbPromise = null
}
