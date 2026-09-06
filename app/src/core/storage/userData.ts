import type { Layout } from '@/core/data/types'
import { INITIAL_HABIT_VERSE_CURSOR, type HabitVerseCursor } from '@/core/quran/habitVerses'
import { INITIAL_REVISION_CURSOR, type RevisionCursor } from '@/core/memorization/revisionCycle'
import type { PlaybackScope } from '@/core/audio/scope'
import type { PageHighlightSpec } from '@/core/navigation/previewRoute'
import { MEMORIZED_FLOOR_STRENGTH } from '@/core/memorization/strengthBands'
import { idbCount, idbGet, openDb, txDone } from './idb'

/**
 * Persistence for migratable user data (mistakes now; memorized pages, perfect
 * revisions, etc. join in Phase 4) — the local-first source of truth that must
 * survive across sessions and stay importable from legacy backups. Stored in its
 * own DB, separate from the regenerable asset cache and from view prefs. Maps and
 * Sets are serialized to plain JSON for storage.
 */
const DB_NAME = 'murajah-userdata'
const DB_VERSION = 1
/** Exported so `journalStorage.ts` shares this exact object store — never a
 * second one — for its own reads/writes. */
export const STORE = 'data'
const MISTAKES_KEY = 'mistakes'
const PROGRESS_KEY = 'progress'
const PLAN_KEY = 'plan'
const DAYLOG_KEY = 'dayLog'
const QUIZ_KEY = 'quiz'
const AUDIO_KEY = 'audio'
const LIVE_KEY = 'live'
const RECORDINGS_KEY = 'recordings'
const HABIT_VERSES_KEY = 'habitVerses'
const PARTIAL_PROGRESS_KEY = 'partialProgress'

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
 * legacy backups → empty). `readingSeconds` is cumulative active reading time.
 */
export interface StoredProgress {
  memorized: number[]
  perfectRevisions: Record<string, number>
  hasanah: number
  readingSeconds?: number
  listeningSeconds?: number
  reviewData?: Record<string, ReviewSchedule>
  /** ISO timestamp a page most recently became memorized — absent for pages
   * memorized before this was tracked (see `Progress.memorizedAt`). */
  memorizedAt?: Record<string, string>
}

export interface Progress {
  memorized: Set<number>
  strength: Map<number, number>
  hasanah: number
  readingSeconds?: number
  listeningSeconds?: number
  reviewData: Map<number, ReviewSchedule>
  /**
   * ISO timestamp of the moment each currently-memorized page last became
   * memorized (Progress's "Recently memorized" chips) — written once per
   * `setMemorized(page, true)` call, deleted on unmark, so this only ever
   * holds entries for pages presently in `memorized`. Deliberately **not**
   * backfilled for legacy/pre-existing data the way `reviewData.lastReviewDate`
   * is (`backfillReviewDates`): stamping "today" on a page memorized years ago
   * would make it look freshly memorized, exactly backwards. A page with no
   * entry here is simply left out of the "recently memorized" list rather
   * than ordered by a guess — see `recentlyMemorizedPages`
   * (core/memorization/progressView.ts).
   */
  memorizedAt: Map<number, string>
}

let dbPromise: Promise<IDBDatabase> | null = null
/** Exported so `journalStorage.ts` reuses this exact singleton connection —
 * calling this function from either module resolves the same cached
 * `dbPromise`, preserving the "one shared connection" invariant. */
export function db(): Promise<IDBDatabase> {
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
  const memorizedAt: Record<string, string> = {}
  // `?? []` defends a caller that built a `Progress` value predating this
  // field (an older in-memory object still floating around, a test/debug
  // literal) — without it, `saveProgress`'s catch-and-swallow would silently
  // drop the *entire* write, not just memorizedAt.
  for (const [page, ts] of p.memorizedAt ?? []) memorizedAt[String(page)] = ts
  return {
    memorized: [...p.memorized].sort((a, b) => a - b),
    perfectRevisions,
    hasanah: p.hasanah,
    readingSeconds: p.readingSeconds ?? 0,
    listeningSeconds: p.listeningSeconds ?? 0,
    reviewData,
    memorizedAt,
  }
}

export function deserializeProgress(stored: StoredProgress | undefined): Progress {
  const strength = new Map<number, number>()
  for (const [page, n] of Object.entries(stored?.perfectRevisions ?? {})) strength.set(Number(page), n)
  const reviewData = new Map<number, ReviewSchedule>()
  for (const [page, r] of Object.entries(stored?.reviewData ?? {})) {
    reviewData.set(Number(page), normalizeSchedule(r))
  }
  const memorizedAt = new Map<number, string>()
  for (const [page, ts] of Object.entries(stored?.memorizedAt ?? {})) memorizedAt.set(Number(page), ts)
  return {
    memorized: new Set((stored?.memorized ?? []).map(Number)),
    strength,
    hasanah: stored?.hasanah ?? 0,
    memorizedAt,
    readingSeconds: stored?.readingSeconds ?? 0,
    listeningSeconds: stored?.listeningSeconds ?? 0,
    reviewData,
  }
}

/**
 * One-time, idempotent backfill for legacy/imported memorized pages, run on
 * every load (`loadProgress`) and every import/recovery path. Two related
 * repairs, both keyed off "any page marked `memorized` with no real strength
 * or review history yet" (a legacy import predating `perfectRevisions`
 * tracking, or a page a prior bug left at strength 0):
 *
 * 1. **Review-date anchor.** Any such page, or any page with `strength > 0`,
 *    that has no `reviewData[page].lastReviewDate` gets stamped with `today`
 *    — so decay has a real anchor instead of treating it as `Infinity` days
 *    unrevised forever. `effectiveRank` (strengthBands.ts) only lets a
 *    memorized-but-zero-strength page fall through to "Not Memorized" after
 *    `NEVER_REVISED_TIMEOUT_DAYS` of *real* elapsed time — an un-anchored
 *    page would trip that immediately. Anchoring to "today" (the day the
 *    data was imported/first loaded, per product's "missing revision date =
 *    day of import" rule) is what keeps a freshly-recovered memorized page
 *    floored at Da'if (Weak) on the very first load.
 *
 * 2. **Strength floor.** A memorized page with strength 0 *and no review
 *    history either* (`reviewData[page].reviewCount` unset/0) is credited
 *    `MEMORIZED_FLOOR_STRENGTH` (Da'if's own lower bound — no hasanah, unlike
 *    the live `creditFreshMemorization` a user action triggers in
 *    `stores/progress.ts`; this is a silent data repair on load, not a
 *    reward event). Without this, `effectiveRank`'s floor is the *only*
 *    thing keeping such a page off "Not Memorized", purely at display time —
 *    the instant the page's first real revision lands, raw strength goes
 *    0 → 1 and the displayed band would regress from Da'if to Jadid. Writing
 *    the floor into the stored strength itself makes every later revision
 *    strictly additive instead.
 *
 *    The review-history exclusion matters: a page can be memorized, strength
 *    0, *and* have real `reviewData` (reviewed several times, never once
 *    passed) — genuine evidence of a struggling page, not an absence of
 *    data. `weaknessScorer.ts` reads this same raw `strength` as one of its
 *    inputs (`perfectRevisionCount`); flooring a page like that to 40 would
 *    read as "40 clean revisions" to the scorer and mask a page the daily
 *    weak-reinforcement lane is specifically supposed to catch. The floor is
 *    for "no evidence exists yet" (a legacy import predating the counter, a
 *    freshly-marked untouched page), never for "evidence says weak."
 *
 * Reuses `normalizeSchedule()` for the rest of the review record, matching
 * every other partial/legacy-record hydration in this file. Pure (returns a
 * new `Progress`, never mutates the input) — callers must persist the result
 * themselves when `changedCount > 0`, or neither repair sticks (the same
 * "today"/floor would be recomputed and rewritten on every subsequent load).
 *
 * `floorStrength` (default on) exists for exactly one caller:
 * `legacyRecovery.ts` runs this on the *incoming legacy side alone*, before
 * merging it onto the current store via `Math.max(current, incoming)` per
 * page. Flooring that isolated, partial view would inject an artificial
 * `MEMORIZED_FLOOR_STRENGTH` into the max-merge and could raise a page's
 * *real*, already-tracked current strength — e.g. current=20, legacy
 * implicitly 0 but floored to 40 pre-merge, `Math.max(20, 40)` wrongly wins
 * at 40. `legacyRecovery.ts` passes `false` and leans on the plain
 * `loadProgress()` call that follows the merge (in the caller today, and
 * unconditionally on the next app boot) to apply the floor once to the
 * *true*, fully-merged state instead.
 */
export function backfillReviewDates(
  progress: Progress,
  today: string = isoToday(),
  { floorStrength = true }: { floorStrength?: boolean } = {},
): { progress: Progress; changedCount: number } {
  const reviewData = new Map(progress.reviewData)
  const strength = new Map(progress.strength)
  let changedCount = 0
  if (floorStrength) {
    const noEvidenceYet = [...progress.memorized].filter((page) => {
      const hasStrength = (strength.get(page) ?? 0) > 0
      const hasReviewHistory = (progress.reviewData.get(page)?.reviewCount ?? 0) > 0
      return !hasStrength && !hasReviewHistory
    })
    for (const page of noEvidenceYet) {
      strength.set(page, MEMORIZED_FLOOR_STRENGTH)
      changedCount++
    }
  }
  const pagesNeedingAnchor = new Set(progress.memorized)
  for (const [page, s] of progress.strength) if (s > 0) pagesNeedingAnchor.add(page)
  for (const page of pagesNeedingAnchor) {
    const existing = reviewData.get(page)
    if (existing?.lastReviewDate) continue
    reviewData.set(page, normalizeSchedule({ lastReviewDate: today, reviewCount: existing?.reviewCount ?? 0 }))
    changedCount++
  }
  return { progress: { ...progress, strength, reviewData }, changedCount }
}

/** Load persisted progress (empty if none / on error), backfilling missing review dates. */
export async function loadProgress(): Promise<Progress> {
  try {
    const tx = (await db()).transaction(STORE, 'readonly')
    const stored = await idbGet<StoredProgress>(tx.objectStore(STORE), PROGRESS_KEY)
    await txDone(tx)
    const { progress, changedCount } = backfillReviewDates(deserializeProgress(stored))
    if (changedCount > 0) await saveProgress(progress)
    return progress
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
  /** Where the daily revision rotation stands (Phase 5.6) — see `revisionCycle`. */
  revisionCursor: RevisionCursor
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
 *
 * `newMemorizationTouched` (partial-page tracking) is deliberately separate
 * from `newMemorization`: it means "the front page got a new mark today," not
 * "this page is fully finished" — the latter is what `newMemorization` means
 * everywhere else (`dayLog.setPageDone`'s idempotency guard, `complete()`'s
 * reward/schedule/front-advance path) and must never be set by partial
 * credit. See tasks/plan.md Task 5/7 for why keeping these apart matters.
 * Optional (unlike its array siblings) so every existing `DayRecord` literal
 * in the codebase — `dayLog.ts`'s `emptyRecord()`, `planMigration.ts`'s
 * `dayRecordFromGoal` — keeps compiling unchanged; `stores/dayLog.ts` (Task
 * 6) is what actually starts writing it. `deserializeDayLog` still defaults
 * a stored/legacy record's missing field to `[]`, matching how every other
 * array field here already handles a legacy/partial stored record.
 */
export interface DayRecord {
  date: string
  completed: boolean
  newMemorization: number[]
  revision: number[]
  weak: number[]
  habits: string[]
  newMemorizationTouched?: number[]
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
    revisionCursor: { ...p.revisionCursor },
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
    revisionCursor: { ...INITIAL_REVISION_CURSOR, ...(stored.revisionCursor ?? {}) },
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
      newMemorizationTouched: [...(r.newMemorizationTouched ?? [])],
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
      newMemorizationTouched: [...(r.newMemorizationTouched ?? [])],
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
 * cursor, time), which starts clean each session. `lastListenScope` is the one
 * exception in spirit only: it's a bookmark of *what* was last played on Listen
 * (a surah/juz/the whole Quran), not *where* — no cursor or position — so it can
 * power a "continue listening" shortcut without resurrecting mid-playback state.
 * Shares the app DB.
 */
export interface StoredAudioPrefs {
  grain?: string
  verseReciterId?: string
  pageReciterId?: string
  speed?: number
  repeatCount?: number
  spaced?: boolean
  autoNext?: boolean
  loopPlaylist?: boolean
  autoScroll?: boolean
  lastListenScope?: PlaybackScope
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
      repeatCount: prefs.repeatCount,
      spaced: prefs.spaced,
      autoNext: prefs.autoNext,
      loopPlaylist: prefs.loopPlaylist,
      autoScroll: prefs.autoScroll,
      lastListenScope: prefs.lastListenScope,
    }
    tx.objectStore(STORE).put(plain, AUDIO_KEY)
    await txDone(tx)
  } catch {
    /* best-effort */
  }
}

/**
 * Live-recitation view preferences (redesign 2026 P3.1): just a bookmark of the
 * last masjid channel watched, so the view can offer a one-tap resume instead of
 * always opening as a blank picker. No stream-status data exists to show
 * (no source for iqamah/prayer-time info), so this is the honest version of
 * "give it memory." Shares the app DB.
 */
export interface StoredLivePrefs {
  lastChannel?: 'quran' | 'sunnah'
}

/** Load persisted Live prefs (empty object if none / on error). */
export async function loadLivePrefs(): Promise<StoredLivePrefs> {
  try {
    const tx = (await db()).transaction(STORE, 'readonly')
    const stored = await idbGet<StoredLivePrefs>(tx.objectStore(STORE), LIVE_KEY)
    await txDone(tx)
    return stored ?? {}
  } catch {
    return {}
  }
}

/** Persist Live prefs (best-effort). */
export async function saveLivePrefs(prefs: StoredLivePrefs): Promise<void> {
  try {
    const tx = (await db()).transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put({ lastChannel: prefs.lastChannel }, LIVE_KEY)
    await txDone(tx)
  } catch {
    /* best-effort */
  }
}

/**
 * Own-recitation recordings (Phase 7.6). Stored as a plain array under one key in
 * the shared app DB — **not** a separate database (the legacy separate DB was the
 * iOS-contention source, bug A5/B5).
 */
export interface StoredRecording {
  id: string
  pageNumber: number
  blob: Blob
  mimeType: string
  duration: number
  recordedAt: string
}

/**
 * On-disk shape: audio bytes as an `ArrayBuffer`, not a `Blob`. Storing a `Blob`
 * directly (the original approach — they're structured-cloneable in principle)
 * throws in some engines, e.g. WebKit: "Error preparing Blob/File data to be
 * stored in object store" — which `saveRecordings`'s best-effort catch swallowed
 * silently, so every recording vanished on next launch with no error anywhere.
 * An `ArrayBuffer` round-trips on every engine; a `Blob` is reconstructed from
 * it (+ `mimeType`) on load, so callers still see `StoredRecording.blob` as before.
 */
interface RecordingOnDisk {
  id: string
  pageNumber: number
  data: ArrayBuffer
  mimeType: string
  duration: number
  recordedAt: string
}

/** Load persisted recordings (empty array if none / on error). */
export async function loadRecordings(): Promise<StoredRecording[]> {
  try {
    const tx = (await db()).transaction(STORE, 'readonly')
    const stored = await idbGet<(RecordingOnDisk | StoredRecording)[]>(
      tx.objectStore(STORE),
      RECORDINGS_KEY,
    )
    await txDone(tx)
    if (!Array.isArray(stored)) return []
    // Records saved before this fix are still `{ blob }` (Chromium only — it's
    // the one engine the direct-Blob approach actually worked on) and pass
    // through unchanged; new records are `{ data }` and get a Blob rebuilt.
    return stored.map((r) =>
      'data' in r
        ? {
            id: r.id,
            pageNumber: r.pageNumber,
            blob: new Blob([r.data], { type: r.mimeType }),
            mimeType: r.mimeType,
            duration: r.duration,
            recordedAt: r.recordedAt,
          }
        : r,
    )
  } catch (err) {
    console.error('loadRecordings failed', err)
    return []
  }
}

/** Persist recordings (best-effort). Converts each blob to bytes — see `RecordingOnDisk`. */
export async function saveRecordings(recordings: readonly StoredRecording[]): Promise<void> {
  try {
    const plain: RecordingOnDisk[] = await Promise.all(
      recordings.map(async (r) => ({
        id: r.id,
        pageNumber: r.pageNumber,
        data: await r.blob.arrayBuffer(),
        mimeType: r.mimeType,
        duration: r.duration,
        recordedAt: r.recordedAt,
      })),
    )
    const tx = (await db()).transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(plain, RECORDINGS_KEY)
    await txDone(tx)
  } catch (err) {
    console.error('saveRecordings failed', err)
  }
}

/**
 * The "recite 10 verses" habit builder's cursor through the 6236-verse cycle
 * (`core/quran/habitVerses.ts`). A single flat record, same shape as audio prefs.
 */
export type StoredHabitVerseCursor = HabitVerseCursor

/** Load the persisted cursor (the initial (never-started) cursor if none / on error). */
export async function loadHabitVerseCursor(): Promise<StoredHabitVerseCursor> {
  try {
    const tx = (await db()).transaction(STORE, 'readonly')
    const stored = await idbGet<StoredHabitVerseCursor>(tx.objectStore(STORE), HABIT_VERSES_KEY)
    await txDone(tx)
    return stored ?? { ...INITIAL_HABIT_VERSE_CURSOR }
  } catch {
    return { ...INITIAL_HABIT_VERSE_CURSOR }
  }
}

/** Persist the cursor (best-effort). */
export async function saveHabitVerseCursor(cursor: StoredHabitVerseCursor): Promise<void> {
  try {
    const tx = (await db()).transaction(STORE, 'readwrite')
    const plain: StoredHabitVerseCursor = {
      completedThrough: cursor.completedThrough,
      lastAdvanceDate: cursor.lastAdvanceDate,
    }
    tx.objectStore(STORE).put(plain, HABIT_VERSES_KEY)
    await txDone(tx)
  } catch {
    /* best-effort */
  }
}

/**
 * In-progress marks on the plan's current new-memorization front page
 * (partial-page tracking) — which verses/word-ranges a kid has marked
 * memorized on a page not yet fully complete. `marks` reuses `/preview`'s
 * `PageHighlightSpec` shape (a plain `{surah, ayah, wordStart?, wordEnd?}`),
 * not its six-color container — this is a single, flat "memorized" set, never
 * a colored highlight. `page` pins the marks to the front page they were made
 * on; this layer only persists what it's given — `stores/partialProgress.ts`
 * is responsible for treating a stored `page` that no longer matches the
 * plan's current front page as stale.
 */
export interface StoredPartialProgress {
  page: number
  marks: PageHighlightSpec[]
}

/** Load the persisted partial progress (`null` if none / on error). */
export async function loadPartialProgress(): Promise<StoredPartialProgress | null> {
  try {
    const tx = (await db()).transaction(STORE, 'readonly')
    const stored = await idbGet<StoredPartialProgress>(tx.objectStore(STORE), PARTIAL_PROGRESS_KEY)
    await txDone(tx)
    return stored ?? null
  } catch {
    return null
  }
}

/** Persist partial progress, or clear it when null (best-effort). */
export async function savePartialProgress(p: StoredPartialProgress | null): Promise<void> {
  try {
    const tx = (await db()).transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    if (p) {
      // Rebuild plain objects/arrays — the store's values may be Vue reactive proxies.
      store.put({ page: p.page, marks: p.marks.map((m) => ({ ...m })) }, PARTIAL_PROGRESS_KEY)
    } else {
      store.delete(PARTIAL_PROGRESS_KEY)
    }
    await txDone(tx)
  } catch {
    /* best-effort */
  }
}

/** Whether any user data has ever been saved (a signal of prior app use). Errors read as `false`. */
export async function hasAnyUserData(): Promise<boolean> {
  try {
    const tx = (await db()).transaction(STORE, 'readonly')
    const count = await idbCount(tx.objectStore(STORE))
    await txDone(tx)
    return count > 0
  } catch {
    return false
  }
}

/** Test hook: drop the cached connection. */
export function _resetUserDataDb(): void {
  dbPromise = null
}
