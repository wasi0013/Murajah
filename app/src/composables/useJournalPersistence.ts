import { useJournalStore } from '@/stores/journal'
import { saveJournalNote } from '@/core/storage/userData'

const DEBOUNCE_MS = 300

/**
 * Debounced disk persistence for reflection notes only (Phase 12.1.3) — a
 * companion to `stores/journal.ts`, not a replacement for it. `addEvent`
 * already writes straight through to `appendJournalEvent` from inside the
 * store itself (events are infrequent; no debounce needed), so this
 * composable's only job is the note's keystroke-rate save.
 *
 * One `setTimeout` per **date** being actively edited — editing two different
 * days' notes debounces each independently, and re-editing the same day within
 * the window resets that day's timer rather than queuing a second write.
 * Reads the note to save from the store at fire time (not a captured closure
 * value), so the very last edit wins regardless of how many times
 * `scheduleNoteSave` fired in between.
 */
export function useJournalPersistence(journal = useJournalStore()) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  function scheduleNoteSave(date: string): void {
    const existing = timers.get(date)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      timers.delete(date)
      const entry = journal.get(date)
      if (!entry) return
      void saveJournalNote(date, entry.note, entry.noteUpdatedAt ?? new Date().toISOString())
    }, DEBOUNCE_MS)
    timers.set(date, timer)
  }

  /** Cancel every pending save (component unmount) — never flushes them. */
  function dispose(): void {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
  }

  return { scheduleNoteSave, dispose }
}
