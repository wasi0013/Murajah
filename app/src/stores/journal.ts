import { defineStore } from 'pinia'
import { reactive } from 'vue'
import {
  appendJournalEvent,
  applyJournalEvent,
  loadJournalEntry,
  loadJournalRange,
  JOURNAL_NOTE_MAX_LEN,
  type JournalEntry,
  type JournalEvent,
  type JournalLog,
} from '@/core/storage/userData'

function emptyEntry(date: string): JournalEntry {
  return { date, note: '', noteUpdatedAt: null, events: [], eventsOverflow: 0 }
}

/** `YYYY-MM` zero-padded, matching every other local date string in this codebase. */
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * The practice journal (Phase 12): in-memory state only for the **currently
 * visible month(s)** — deliberately not fully hydrated app-wide like `dayLog`.
 * A user's journal history grows one entry per calendar day of use, and the
 * calendar only ever needs to show one visible month at a time; nothing here
 * needs the rest of the history in memory. `loadMonth` fetches a month's
 * entries on demand (`core/storage/userData.ts`'s `journal:<date>` range scan).
 *
 * Unlike `dayLog`, this store's write actions (`setNote`/`addEvent`) are not
 * paired with a generic deep-watch persistence composable — each already knows
 * exactly which field it changed, so each writes through directly: `addEvent`
 * calls `appendJournalEvent` immediately (events are infrequent — no debounce,
 * no risk of losing one to an unflushed timer); `setNote`'s actual disk write is
 * owned by `useJournalPersistence` (12.1.3), debounced per date for keystroke
 * traffic. See plans/phase-12-journal.md §12.1.
 */
export const useJournalStore = defineStore('journal', () => {
  const byDate = reactive(new Map<string, JournalEntry>())

  const get = (date: string): JournalEntry | undefined => byDate.get(date)

  /** The entry for a date, creating an empty one on demand (the reactive proxy). */
  function ensure(date: string): JournalEntry {
    if (!byDate.has(date)) byDate.set(date, emptyEntry(date))
    return byDate.get(date)!
  }

  /**
   * In-memory only — truncates to {@link JOURNAL_NOTE_MAX_LEN} and stamps
   * `noteUpdatedAt`. The actual disk write is debounced separately (12.1.3);
   * this always operates on an `ensure()`d entry, which is safe here because a
   * note is only ever edited from a mounted day-detail panel that has already
   * loaded (or newly created) this date's entry — unlike `addEvent`, which can
   * fire from any route for a date the store has never seen.
   */
  function setNote(date: string, text: string): JournalEntry {
    const trimmed = text.length > JOURNAL_NOTE_MAX_LEN ? text.slice(0, JOURNAL_NOTE_MAX_LEN) : text
    const entry = ensure(date)
    entry.note = trimmed
    entry.noteUpdatedAt = new Date().toISOString()
    return entry
  }

  /**
   * Persists immediately via `appendJournalEvent`, which owns the real
   * cap/overflow/dedup decision on disk (`applyJournalEvent` — 12.1.1/12.1.4/
   * 12.2.3 — a read-modify-write that never touches `note`). This only
   * *mirrors* that same decision (via the identical `applyJournalEvent`
   * helper, not a re-implementation that could drift) into the in-memory map
   * when the date is already resident, so a visible calendar cell updates
   * instantly without waiting on the round trip; a non-resident date is still
   * written through correctly (the storage layer doesn't need this store's
   * cooperation to do so) — it simply isn't reflected here until the next
   * `loadMonth()` covering that date.
   */
  function addEvent(date: string, event: JournalEvent): void {
    const entry = byDate.get(date)
    if (entry) applyJournalEvent(entry, event)
    void appendJournalEvent(date, event)
  }

  /**
   * Fetch a single date's entry on demand if it isn't already resident —
   * a no-op when it is. Covers the day-detail view (`useJournalDay`, 12.3.2)
   * being opened for a date outside any month `loadMonth` has fetched (e.g. a
   * future deep link) with one cheap single-key `get`, not a range scan.
   */
  async function loadOne(date: string): Promise<void> {
    if (byDate.has(date)) return
    byDate.set(date, await loadJournalEntry(date))
  }

  /** Fetch one calendar month's entries (1–12) and merge them into `byDate`. */
  async function loadMonth(year: number, month: number): Promise<void> {
    const start = `${year}-${pad2(month)}-01`
    const lastDay = new Date(year, month, 0).getDate() // day 0 of next month = last day of this one
    const end = `${year}-${pad2(month)}-${pad2(lastDay)}`
    const range = await loadJournalRange(start, end)
    for (const [date, entry] of range) byDate.set(date, entry)
  }

  /** Replace the whole in-memory log (the backup-merge path, 12.6, only). */
  function setAll(log: JournalLog): void {
    byDate.clear()
    for (const [date, e] of log) byDate.set(date, { ...e, events: [...e.events] })
  }

  /** A plain (proxy-free) deep copy for persistence/export. */
  function snapshot(): JournalLog {
    const copy: JournalLog = new Map()
    for (const [date, e] of byDate) {
      copy.set(date, {
        date: e.date,
        note: e.note,
        noteUpdatedAt: e.noteUpdatedAt,
        events: e.events.map((ev) => ({ ...ev })),
        eventsOverflow: e.eventsOverflow,
      })
    }
    return copy
  }

  return { byDate, get, ensure, setNote, addEvent, loadOne, loadMonth, setAll, snapshot }
})
