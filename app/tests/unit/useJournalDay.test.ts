import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useJournalDay } from '@/composables/useJournalDay'
import { useDayLogStore } from '@/stores/dayLog'
import { useRecordingsStore } from '@/stores/recordings'
import * as userData from '@/core/storage/userData'
import { saveJournalNote, appendJournalEvent, _resetUserDataDb } from '@/core/storage/userData'
import type { DayRecord } from '@/core/storage/userData'
import type { Recording } from '@/core/audio/recorder'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetUserDataDb()
  setActivePinia(createPinia())
})

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** An ISO instant at local noon on `dateStr` — round-trips back through
 * `localDateOf`'s local-Date-components read regardless of the test runner's
 * timezone (unlike a fixed UTC clock time, which can roll to the adjacent
 * calendar day depending on the runner's offset). */
function isoAtLocalNoon(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toISOString()
}

const record = (over: Partial<DayRecord> = {}): DayRecord => ({
  date: '2026-08-23',
  completed: true,
  newMemorization: [22],
  revision: [10, 11],
  weak: [5],
  habits: ['recite-ayahs'],
  ...over,
})

const recording = (over: Partial<Recording> = {}): Recording => ({
  id: 'r1',
  pageNumber: 22,
  blob: new Blob(['audio']),
  mimeType: 'audio/webm',
  duration: 12,
  recordedAt: isoAtLocalNoon('2026-08-23'),
  ...over,
})

describe('useJournalDay', () => {
  it('assembles dayLog sections, resolved habits, note, events, and recordings for one day', async () => {
    useDayLogStore().setAll(new Map([['2026-08-23', record()]]))
    useRecordingsStore().setAll([recording()])
    await saveJournalNote('2026-08-23', 'good progress today', '2026-08-23T09:00:00.000Z')
    await appendJournalEvent('2026-08-23', {
      id: 'e1',
      type: 'band-up',
      page: 22,
      fromRank: 0,
      toRank: 1,
      createdAt: '2026-08-23T08:00:00.000Z',
    })

    const { detail, loading } = useJournalDay(ref('2026-08-23'))
    await wait(10)
    expect(loading.value).toBe(false)

    expect(detail.value.sections.newMemorization).toEqual([22])
    expect(detail.value.sections.revision).toEqual([10, 11])
    expect(detail.value.sections.weak).toEqual([5])
    expect(detail.value.sections.habits.map((h) => h.id)).toEqual(['recite-ayahs'])
    expect(detail.value.note).toBe('good progress today')
    expect(detail.value.events).toHaveLength(1)
    expect(detail.value.recordings.map((r) => r.id)).toEqual(['r1'])
  })

  it('renders a clean empty state for a day with nothing recorded', async () => {
    const { detail, loading } = useJournalDay(ref('2026-08-23'))
    await wait(10)
    expect(loading.value).toBe(false)

    expect(detail.value.sections).toEqual({ newMemorization: [], revision: [], weak: [], habits: [] })
    expect(detail.value.note).toBe('')
    expect(detail.value.events).toEqual([])
    expect(detail.value.recordings).toEqual([])
  })

  it('unknown habit ids are silently dropped, not left as raw strings', async () => {
    useDayLogStore().setAll(new Map([['2026-08-23', record({ habits: ['recite-ayahs', 'not-a-real-habit'] })]]))
    const { detail } = useJournalDay(ref('2026-08-23'))
    await wait(10)
    expect(detail.value.sections.habits.map((h) => h.id)).toEqual(['recite-ayahs'])
  })

  it('filters recordings to the requested calendar day only, from the already-hydrated store', async () => {
    useRecordingsStore().setAll([
      recording({ id: 'same-day', recordedAt: isoAtLocalNoon('2026-08-23') }),
      recording({ id: 'day-before', recordedAt: isoAtLocalNoon('2026-08-22') }),
      recording({ id: 'day-after', recordedAt: isoAtLocalNoon('2026-08-24') }),
    ])
    const { detail } = useJournalDay(ref('2026-08-23'))
    await wait(10)
    expect(detail.value.recordings.map((r) => r.id)).toEqual(['same-day'])
  })

  it('never calls loadRecordings/saveRecordings — recordings come only from the in-memory store', async () => {
    const loadSpy = vi.spyOn(userData, 'loadRecordings')
    const saveSpy = vi.spyOn(userData, 'saveRecordings')
    useRecordingsStore().setAll([recording()])

    const { detail } = useJournalDay(ref('2026-08-23'))
    await wait(10)
    void detail.value

    expect(loadSpy).not.toHaveBeenCalled()
    expect(saveSpy).not.toHaveBeenCalled()
    loadSpy.mockRestore()
    saveSpy.mockRestore()
  })

  it('reacts to switching to a different date', async () => {
    useDayLogStore().setAll(
      new Map([
        ['2026-08-23', record({ date: '2026-08-23' })],
        ['2026-08-24', record({ date: '2026-08-24', newMemorization: [23] })],
      ]),
    )
    const date = ref('2026-08-23')
    const { detail } = useJournalDay(date)
    await wait(10)
    expect(detail.value.sections.newMemorization).toEqual([22])

    date.value = '2026-08-24'
    await wait(10)
    expect(detail.value.sections.newMemorization).toEqual([23])
  })
})
