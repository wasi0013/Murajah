// The practice journal (Phase 12): one automatic-history entry per calendar day —
// an optional short reflection note plus memorization-strength band-change events
// (page-level "weak → strong" moments that `progress.strength` can't reconstruct
// after the fact, since it only holds the *current* value). Everything else the
// Journal view shows (reading/revision/weak-page completions, recordings, habits)
// already has a durable, date-addressable home elsewhere (`dayLog`, `recordings`)
// and is read, not duplicated, by this feature — see plans/phase-12-journal.md.
//
// Unlike every other key in `userData.ts`, journal entries are **not** one
// whole-blob value under a single key. `useDayLogPersistence`'s pattern — a
// debounced `watch(() => store.snapshot(), …, { deep: true })` that rewrites
// the *entire* history on every change — is the wrong shape for free-text
// notes edited one day at a time: a single keystroke would otherwise
// deep-clone and rewrite every day the user has ever journaled. Instead each
// day is its own key, `journal:<date>`, inside the *same* `data` object store
// `userData.ts` already opens — no new object store, no `DB_VERSION` bump, no
// `upgradeneeded` migration, and (since `idb.ts`'s `openDb` has no
// `onblocked`/`onversionchange` handling and that file shares one `dbPromise`
// across every key) no multi-tab blocked-connection hazard either. A write
// touches exactly the one date it changed — O(1), not O(history length).
//
// Split out of `userData.ts` (which had crossed ~1000 lines) as its own
// self-contained module — types, (de)serialize, load/save, the cap/dedup
// decision, and the backup-merge function, none of which touch any other
// key's logic. Shares `userData.ts`'s `db()`/`STORE` (exported from there for
// exactly this) rather than opening a second connection or object store.

import type { StrengthRank } from '@/core/memorization/strengthBands'
import { idbGet, idbGetAll, txDone } from './idb'
import { db, STORE } from './userData'

const JOURNAL_KEY_PREFIX = 'journal:'
const journalKey = (date: string): string => `${JOURNAL_KEY_PREFIX}${date}`
/**
 * Lexicographic range covering every `journal:*` key. IndexedDB has no native
 * "starts with" query, so a prefix scan is simulated with an explicit upper
 * bound — `~` (tilde, the highest common printable ASCII character) rather
 * than an earlier invisible Unicode noncharacter sentinel (U+FFFF): it's
 * visible and greppable in a diff/editor instead of disappearing, and it's the same
 * well-known idiom other systems without native prefix queries use for this
 * (CouchDB view ranges, S3/DynamoDB key-prefix scans). Safe here because every
 * journal key is `journal:YYYY-MM-DD` — digits and hyphens only, all well
 * below `~` (0x7E) in code-point order — so `journal:~` sorts after any real
 * journal key and before the next top-level key alphabetically (`mistakes`,
 * `plan`, `progress`, …), never sweeping in unrelated data.
 */
const JOURNAL_RANGE_ALL = IDBKeyRange.bound(JOURNAL_KEY_PREFIX, `${JOURNAL_KEY_PREFIX}~`)

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
 * deserializer's `?? []` / `?? 0` defensiveness in `userData.ts` — never throws. */
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

/** Whole-log (Map ↔ Record) conversion for the export/import path (Phase 12.6)
 * only — every other reader/writer here works one date at a time. */
export function serializeJournalLog(log: JournalLog): StoredJournal {
  const out: StoredJournal = {}
  for (const [date, entry] of log) out[date] = serializeJournalEntry(entry)
  return out
}

export function deserializeJournal(stored: StoredJournal | undefined): JournalLog {
  const map: JournalLog = new Map()
  for (const [date, entry] of Object.entries(stored ?? {})) map.set(date, deserializeJournalEntry(date, entry))
  return map
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
 * Past {@link MAX_EVENTS_PER_DAY}, evicts the **oldest** event to make room
 * for the new one and counts the eviction in `eventsOverflow` — a day already
 * at the cap must still surface what just happened, not go stale on its
 * earliest events while ignoring everything after. This keeps-most-recent
 * policy matches `mergeJournal`'s re-cap exactly (they used to disagree — one
 * evicted, the other silently stopped accepting new events — caught in
 * review); relies on `entry.events` staying append-ordered (each event's
 * `createdAt` is stamped at call time, so sequential real-world appends are
 * already chronological — `[0]` is the oldest). A dedup replacement never
 * counts against this — it doesn't grow the array.
 */
export function applyJournalEvent(entry: JournalEntry, event: JournalEvent): void {
  const dupIndex =
    event.page !== undefined ? entry.events.findIndex((e) => e.page === event.page && e.type === event.type) : -1
  if (dupIndex !== -1) {
    entry.events[dupIndex] = event
    return
  }
  if (entry.events.length < MAX_EVENTS_PER_DAY) {
    entry.events.push(event)
  } else {
    entry.events.shift()
    entry.events.push(event)
    entry.eventsOverflow += 1
  }
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
 * Union two journal logs — the pure decision behind backup import (Phase
 * 12.6). Unlike every other key in `exportImport.ts` (a straight replace on
 * import — see `importUserData`), the journal **merges**: a note is editable
 * on any past day, indefinitely, so a plausible sequence is "edit today's
 * note on this device, import an older backup taken on another device" —
 * a replace would silently discard the newer edit.
 *
 * - A date present on only one side passes through unchanged.
 * - `note`: the side with the **later** `noteUpdatedAt` wins. A side with no
 *   `noteUpdatedAt` (never written) can never win over a side that has one —
 *   an empty incoming note must not clobber a real existing one. Equal
 *   timestamps keep `current` (makes a repeat import of the same backup a
 *   no-op instead of flip-flopping).
 * - `events`: unioned by `id` (an identical event on both sides — the normal
 *   case for "export this device, re-import the same file later" — collapses
 *   to one, not two), sorted by `createdAt`, then re-capped at
 *   {@link MAX_EVENTS_PER_DAY} keeping the most recent ones.
 * - `eventsOverflow`: the **larger** of the two sides' pre-existing counts,
 *   plus any *new* overflow from re-capping the merged, deduped list — not
 *   the sum. There is no way to tell, from a bare count, whether one side's
 *   already-lost events are the *same* ones the other side lost or different
 *   ones, so summing isn't a real total — it doesn't even hold across a
 *   repeat merge of the identical backup: re-importing the same file twice
 *   would sum the same 5-lost-events count into itself and report 10, then
 *   15 on a third import. `max` is idempotent (re-merging the same source
 *   never grows the count) and never *under*-reports either side's own known
 *   loss. Never inflated by counting a dedup-collapsed duplicate as "lost" —
 *   it wasn't, it was the same fact recorded twice.
 *
 * Pure — no IDB dependency, same style as `backfillReviewDates` in `userData.ts`.
 */
export function mergeJournal(current: JournalLog, incoming: JournalLog): JournalLog {
  const merged: JournalLog = new Map()
  const dates = new Set([...current.keys(), ...incoming.keys()])

  for (const date of dates) {
    const c = current.get(date)
    const i = incoming.get(date)
    if (c && !i) {
      merged.set(date, c)
      continue
    }
    if (i && !c) {
      merged.set(date, i)
      continue
    }
    const a = c!
    const b = i!

    let note = a.note
    let noteUpdatedAt = a.noteUpdatedAt
    if (b.noteUpdatedAt && (!a.noteUpdatedAt || b.noteUpdatedAt > a.noteUpdatedAt)) {
      note = b.note
      noteUpdatedAt = b.noteUpdatedAt
    }

    const byId = new Map<string, JournalEvent>()
    for (const e of a.events) byId.set(e.id, e)
    for (const e of b.events) byId.set(e.id, e)
    const deduped = [...byId.values()].sort((x, y) => x.createdAt.localeCompare(y.createdAt))

    const newOverflow = Math.max(0, deduped.length - MAX_EVENTS_PER_DAY)
    const events = newOverflow > 0 ? deduped.slice(deduped.length - MAX_EVENTS_PER_DAY) : deduped
    const eventsOverflow = Math.max(a.eventsOverflow, b.eventsOverflow) + newOverflow

    merged.set(date, { date, note, noteUpdatedAt, events, eventsOverflow })
  }

  return merged
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
