import type { Layout } from '@/core/data/types'
import { INITIAL_HABIT_VERSE_CURSOR, type HabitVerseCursor } from '@/core/quran/habitVerses'
import { INITIAL_REVISION_CURSOR, type RevisionCursor } from '@/core/memorization/revisionCycle'
import type { StrengthRank } from '@/core/memorization/strengthBands'
import type { PlaybackScope } from '@/core/audio/scope'
import { idbCount, idbGet, idbGetAll, openDb, txDone } from './idb'

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
const LIVE_KEY = 'live'
const RECORDINGS_KEY = 'recordings'
const HABIT_VERSES_KEY = 'habitVerses'

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
}

export interface Progress {
  memorized: Set<number>
  strength: Map<number, number>
  hasanah: number
  readingSeconds?: number
  listeningSeconds?: number
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
    readingSeconds: p.readingSeconds ?? 0,
    listeningSeconds: p.listeningSeconds ?? 0,
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
    readingSeconds: stored?.readingSeconds ?? 0,
    listeningSeconds: stored?.listeningSeconds ?? 0,
    reviewData,
  }
}

/**
 * One-time, idempotent backfill for the memorization-level decay clock
 * (strengthBands.ts): any page with `strength > 0` that has no
 * `reviewData[page].lastReviewDate` — legacy data predates that field
 * entirely — gets stamped with `today`, so decay has a real anchor instead of
 * treating every such page as `Infinity` days unrevised forever. Reuses
 * `normalizeSchedule()` for the rest of the record, matching every other
 * partial/legacy-record hydration in this file. Pure (returns a new
 * `Progress`, never mutates the input) — callers must persist the result
 * themselves when `changedCount > 0`, or the stamp never sticks and decay
 * silently never engages (the same "today" would be recomputed and rewritten
 * on every subsequent load).
 */
export function backfillReviewDates(
  progress: Progress,
  today: string = isoToday(),
): { progress: Progress; changedCount: number } {
  const reviewData = new Map(progress.reviewData)
  let changedCount = 0
  for (const [page, strength] of progress.strength) {
    if (strength <= 0) continue
    const existing = reviewData.get(page)
    if (existing?.lastReviewDate) continue
    reviewData.set(page, normalizeSchedule({ lastReviewDate: today, reviewCount: existing?.reviewCount ?? 0 }))
    changedCount++
  }
  return { progress: { ...progress, reviewData }, changedCount }
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
 * The practice journal (Phase 12): one automatic-history entry per calendar day —
 * an optional short reflection note plus memorization-strength band-change events
 * (page-level "weak → strong" moments that `progress.strength` can't reconstruct
 * after the fact, since it only holds the *current* value). Everything else the
 * Journal view shows (reading/revision/weak-page completions, recordings, habits)
 * already has a durable, date-addressable home elsewhere (`dayLog`, `recordings`)
 * and is read, not duplicated, by this feature — see plans/phase-12-journal.md.
 *
 * Unlike every other key in this file, journal entries are **not** one whole-blob
 * value under a single key. `useDayLogPersistence`'s pattern — a debounced
 * `watch(() => store.snapshot(), …, { deep: true })` that rewrites the *entire*
 * history on every change — is the wrong shape for free-text notes edited one day
 * at a time: a single keystroke would otherwise deep-clone and rewrite every day
 * the user has ever journaled. Instead each day is its own key, `journal:<date>`,
 * inside the *same* `data` object store this file already opens — no new object
 * store, no `DB_VERSION` bump, no `upgradeneeded` migration, and (since `idb.ts`'s
 * `openDb` has no `onblocked`/`onversionchange` handling and this file shares one
 * `dbPromise` across every key) no multi-tab blocked-connection hazard either. A
 * write touches exactly the one date it changed — O(1), not O(history length).
 */
const JOURNAL_KEY_PREFIX = 'journal:'
const journalKey = (date: string): string => `${JOURNAL_KEY_PREFIX}${date}`
/** Lexicographic range covering every `journal:*` key — `YYYY-MM-DD` sorts as a string. */
const JOURNAL_RANGE_ALL = IDBKeyRange.bound(JOURNAL_KEY_PREFIX, `${JOURNAL_KEY_PREFIX}￿`)

/** Reflection notes are capped short ("tweet-sized" per the brief), not a free-form journal. */
export const JOURNAL_NOTE_MAX_LEN = 280
/**
 * Per-day event cap. A heavy single day (e.g. a bulk-mark session touching many
 * bands) gets one honest overflow count instead of an unbounded per-day array —
 * years of history must never turn one date's record into an ever-growing list.
 */
export const MAX_EVENTS_PER_DAY = 20

/** One page crossing a memorization-strength band (see `strengthBands.ts`), or a
 * coalesced bulk-mark — never one event per page for a bulk action (that would be
 * an unbounded write per tap, the exact growth this module's cap exists to avoid).
 */
export interface JournalEvent {
  /** `${type}:${page}:${createdAt}` (or equivalent) — stable identity for import dedupe. */
  id: string
  type: 'band-up' | 'band-down' | 'bulk-memorized'
  /** Absent only for `'bulk-memorized'`, which is a whole-action aggregate. */
  page?: number
  fromRank?: StrengthRank
  toRank?: StrengthRank
  /** `'bulk-memorized'` only — how many pages the action credited. */
  count?: number
  /** ISO instant — sort order and the import-merge dedupe tie-break. */
  createdAt: string
}

/** One calendar day's journal entry. `date` matches `DayRecord.date` (`YYYY-MM-DD`). */
export interface JournalEntry {
  date: string
  /** `''` = no note. */
  note: string
  /** ISO instant of the note's last edit — `null` if never written; the backup-merge tie-breaker. */
  noteUpdatedAt: string | null
  events: JournalEvent[]
  /** Count of events beyond `MAX_EVENTS_PER_DAY`, so a heavy day reads "+N more", never silent loss. */
  eventsOverflow: number
}

/** On-disk shape is identical to {@link JournalEntry} (already JSON-safe). */
export type StoredJournalEntry = JournalEntry
export type JournalLog = Map<string, JournalEntry>
export type StoredJournal = Record<string, JournalEntry>

function emptyJournalEntry(date: string): JournalEntry {
  return { date, note: '', noteUpdatedAt: null, events: [], eventsOverflow: 0 }
}

export function serializeJournalEntry(e: JournalEntry): StoredJournalEntry {
  return {
    date: e.date,
    note: e.note,
    noteUpdatedAt: e.noteUpdatedAt,
    events: e.events.map((ev) => ({ ...ev })),
    eventsOverflow: e.eventsOverflow,
  }
}

/** Normalize a partial/corrupt stored value to safe defaults, matching every other
 * deserializer's `?? []` / `?? 0` defensiveness in this file — never throws. */
export function deserializeJournalEntry(
  date: string,
  stored: Partial<StoredJournalEntry> | undefined,
): JournalEntry {
  return {
    date: stored?.date ?? date,
    note: stored?.note ?? '',
    noteUpdatedAt: stored?.noteUpdatedAt ?? null,
    events: [...(stored?.events ?? [])],
    eventsOverflow: stored?.eventsOverflow ?? 0,
  }
}

/** Load one day's entry (an empty, unsaved-shaped entry if none / on error). */
export async function loadJournalEntry(date: string): Promise<JournalEntry> {
  try {
    const tx = (await db()).transaction(STORE, 'readonly')
    const stored = await idbGet<StoredJournalEntry>(tx.objectStore(STORE), journalKey(date))
    await txDone(tx)
    return stored ? deserializeJournalEntry(date, stored) : emptyJournalEntry(date)
  } catch {
    return emptyJournalEntry(date)
  }
}

/** Load every entry whose date falls within `[startDate, endDate]` (inclusive), e.g.
 * a visible calendar month — a cheap `IDBKeyRange` scan, not a full-history load. */
export async function loadJournalRange(startDate: string, endDate: string): Promise<JournalLog> {
  const map: JournalLog = new Map()
  try {
    const tx = (await db()).transaction(STORE, 'readonly')
    const range = IDBKeyRange.bound(journalKey(startDate), journalKey(endDate))
    const stored = await idbGetAll<StoredJournalEntry>(tx.objectStore(STORE), range)
    await txDone(tx)
    for (const entry of stored) map.set(entry.date, deserializeJournalEntry(entry.date, entry))
  } catch {
    /* best-effort — an empty range on error, matching every other loader here */
  }
  return map
}

/** Load the whole journal (every date ever recorded) — the export/import path
 * (Phase 12.6) only; bounded by how many distinct days the user has practiced on,
 * never by the per-day event cap (that bounds one entry's size, not this count). */
export async function loadFullJournal(): Promise<JournalLog> {
  const map: JournalLog = new Map()
  try {
    const tx = (await db()).transaction(STORE, 'readonly')
    const stored = await idbGetAll<StoredJournalEntry>(tx.objectStore(STORE), JOURNAL_RANGE_ALL)
    await txDone(tx)
    for (const entry of stored) map.set(entry.date, deserializeJournalEntry(entry.date, entry))
  } catch {
    /* best-effort */
  }
  return map
}

/**
 * Persist a day's reflection note as a **read-modify-write inside one transaction**
 * — never a blind `put` of a whole entry. This function only ever touches the note
 * fields; whatever events already exist on disk for this date pass through
 * untouched, even if the caller has never loaded them (e.g. a route that only
 * knows about notes, never events). Truncates to {@link JOURNAL_NOTE_MAX_LEN}.
 */
export async function saveJournalNote(date: string, note: string, noteUpdatedAt: string): Promise<void> {
  try {
    const trimmed = note.length > JOURNAL_NOTE_MAX_LEN ? note.slice(0, JOURNAL_NOTE_MAX_LEN) : note
    const tx = (await db()).transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const existing = deserializeJournalEntry(date, await idbGet<StoredJournalEntry>(store, journalKey(date)))
    store.put({ ...existing, note: trimmed, noteUpdatedAt } satisfies StoredJournalEntry, journalKey(date))
    await txDone(tx)
  } catch {
    /* best-effort */
  }
}

/**
 * Apply one event to an entry's event list **in place** — the single cap +
 * dedup decision shared by `appendJournalEvent` (below) and the journal
 * store's in-memory mirror (`stores/journal.ts`'s `addEvent`), so the two
 * never diverge on what counts as "this happened again" (Phase 12.2.3).
 *
 * De-dupes by `(page, type)`: a page crossing the *same* band direction twice
 * in one day (e.g. two separate passing reviews, with a mistake pulling it
 * back down in between) replaces the earlier same-typed event rather than
 * appending a second row — same page/type is the same *kind* of news
 * repeating, not two distinct facts. A page crossing **both** directions in
 * one day (`band-up` and `band-down`) keeps both — that genuinely is two
 * facts. `'bulk-memorized'` events (no `page`) are never deduped against each
 * other — each coalesced bulk action is already one event (12.2.2); two
 * separate bulk actions in one day are two separate facts.
 *
 * Past {@link MAX_EVENTS_PER_DAY}, increments `eventsOverflow` instead of
 * growing the array without bound (a dedup replacement never counts against
 * this — it doesn't grow the array).
 */
export function applyJournalEvent(entry: JournalEntry, event: JournalEvent): void {
  const dupIndex =
    event.page !== undefined ? entry.events.findIndex((e) => e.page === event.page && e.type === event.type) : -1
  if (dupIndex !== -1) entry.events[dupIndex] = event
  else if (entry.events.length < MAX_EVENTS_PER_DAY) entry.events.push(event)
  else entry.eventsOverflow += 1
}

/**
 * Append one band-change/bulk-mark event as a **read-modify-write inside one
 * transaction** — the write path progress.ts's mutations call into (Phase 12.2).
 * Only ever touches `events`/`eventsOverflow`; an existing note for the date is
 * read back and passed through unmodified, even from a caller (any route, not
 * just the Journal panel) that has no idea whether one exists.
 */
export async function appendJournalEvent(date: string, event: JournalEvent): Promise<void> {
  try {
    const tx = (await db()).transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const existing = deserializeJournalEntry(date, await idbGet<StoredJournalEntry>(store, journalKey(date)))
    applyJournalEvent(existing, event)
    store.put(serializeJournalEntry(existing), journalKey(date))
    await txDone(tx)
  } catch {
    /* best-effort */
  }
}

/**
 * Write a whole journal (every date in `log`) in **one** transaction — the
 * backup-import path (Phase 12.6), after `mergeJournal` has already computed each
 * date's final state. Deliberately not N calls to `saveJournalNote`/
 * `appendJournalEvent`: those exist to protect a single date's concurrent field
 * writes, not to bulk-import an already-resolved snapshot, and N separate
 * transactions here would be exactly the per-key write storm the key scheme
 * exists to avoid.
 */
export async function saveFullJournal(log: JournalLog): Promise<void> {
  try {
    const tx = (await db()).transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    for (const [date, entry] of log) store.put(serializeJournalEntry(entry), journalKey(date))
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
