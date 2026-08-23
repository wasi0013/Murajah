import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { nextTick, ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useJournalMonth } from '@/composables/useJournalMonth'
import { useDayLogStore } from '@/stores/dayLog'
import { useJournalStore } from '@/stores/journal'
import { _resetUserDataDb } from '@/core/storage/userData'
import { saveJournalNote, appendJournalEvent } from '@/core/storage/journalStorage'
import type { DayRecord } from '@/core/storage/userData'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetUserDataDb()
  setActivePinia(createPinia())
})

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

const record = (date: string, completed: boolean, hasWork = true): DayRecord => ({
  date,
  completed,
  newMemorization: hasWork ? [22] : [],
  revision: [],
  weak: [],
  habits: [],
})

describe('useJournalMonth', () => {
  it('builds one summary per day of the month, in order', async () => {
    const { days } = useJournalMonth({ today: ref(new Date('2026-02-15T00:00:00')) })
    await wait(10)
    expect(days.value).toHaveLength(28) // Feb 2026 is not a leap year
    expect(days.value[0].date).toBe('2026-02-01')
    expect(days.value[27].date).toBe('2026-02-28')
  })

  it('handles a leap-year February (29 days)', async () => {
    const { days } = useJournalMonth({ today: ref(new Date('2028-02-15T00:00:00')) })
    await wait(10)
    expect(days.value).toHaveLength(29)
    expect(days.value[28].date).toBe('2028-02-29')
  })

  it('classifies dayState from dayLog: completed / partial / none', async () => {
    const dayLog = useDayLogStore()
    dayLog.setAll(
      new Map([
        ['2026-08-05', record('2026-08-05', true)],
        ['2026-08-06', record('2026-08-06', false, true)],
      ]),
    )
    const { days } = useJournalMonth({ today: ref(new Date('2026-08-10T00:00:00')) })
    await wait(10)
    const byDate = new Map(days.value.map((d) => [d.date, d]))
    expect(byDate.get('2026-08-05')!.dayState).toBe('completed')
    expect(byDate.get('2026-08-06')!.dayState).toBe('partial')
    expect(byDate.get('2026-08-07')!.dayState).toBe('none')
  })

  it('reflects hasNote/eventCount from the journal store, without any weakness computation', async () => {
    await saveJournalNote('2026-08-05', 'good day', '2026-08-05T00:00:00.000Z')
    await appendJournalEvent('2026-08-05', {
      id: 'e1',
      type: 'band-up',
      page: 10,
      fromRank: 0,
      toRank: 1,
      createdAt: '2026-08-05T00:00:00.000Z',
    })

    const { days, loading } = useJournalMonth({ today: ref(new Date('2026-08-10T00:00:00')) })
    await wait(10)
    expect(loading.value).toBe(false)

    const byDate = new Map(days.value.map((d) => [d.date, d]))
    expect(byDate.get('2026-08-05')).toMatchObject({ hasNote: true, eventCount: 1 })
    expect(byDate.get('2026-08-06')).toMatchObject({ hasNote: false, eventCount: 0 })
  })

  it('a day with only a journal note (no dayLog record) still renders', async () => {
    await saveJournalNote('2026-08-05', 'rest day reflection', '2026-08-05T00:00:00.000Z')
    const { days } = useJournalMonth({ today: ref(new Date('2026-08-10T00:00:00')) })
    await wait(10)
    const day = days.value.find((d) => d.date === '2026-08-05')!
    expect(day.dayState).toBe('none')
    expect(day.hasNote).toBe(true)
  })

  it('nextMonth/prevMonth navigate correctly across a year boundary', async () => {
    const { year, month, nextMonth, prevMonth } = useJournalMonth({ today: ref(new Date('2026-12-15T00:00:00')) })
    await wait(10)
    expect(year.value).toBe(2026)
    expect(month.value).toBe(12)

    nextMonth()
    await wait(10)
    expect(year.value).toBe(2027)
    expect(month.value).toBe(1)

    prevMonth()
    prevMonth()
    await wait(10)
    expect(year.value).toBe(2026)
    expect(month.value).toBe(11)
  })

  it('re-fetches the journal store only for the newly-selected month', async () => {
    await saveJournalNote('2026-08-05', 'august', '2026-08-05T00:00:00.000Z')
    await saveJournalNote('2026-09-05', 'september', '2026-09-05T00:00:00.000Z')

    const journal = useJournalStore()
    const { days, nextMonth } = useJournalMonth({ today: ref(new Date('2026-08-10T00:00:00')) })
    await wait(10)
    expect(days.value.find((d) => d.date === '2026-08-05')!.hasNote).toBe(true)

    nextMonth()
    await wait(10)
    expect(days.value.find((d) => d.date === '2026-09-05')!.hasNote).toBe(true)
    expect(journal.get('2026-09-05')!.note).toBe('september')
  })

  // `loading` was flagged in review as built and tested only for its settled
  // (false) state — never proven to actually go true during the fetch, which
  // is the only state a UI loading indicator (now wired into JournalCalendar)
  // needs to react to.
  it('loading is true synchronously on call, before the month fetch resolves', async () => {
    const { loading } = useJournalMonth({ today: ref(new Date('2026-08-10T00:00:00')) })
    expect(loading.value).toBe(true)
    await wait(10)
    expect(loading.value).toBe(false)
  })

  it('loading goes true again on a month change and settles back to false', async () => {
    const { loading, nextMonth } = useJournalMonth({ today: ref(new Date('2026-08-10T00:00:00')) })
    await wait(10)
    expect(loading.value).toBe(false)

    nextMonth()
    // The [year, month] watcher isn't {immediate: true} on this trigger — Vue
    // batches a watcher's reactive re-fire onto the next tick, unlike its one
    // synchronous immediate:true call at creation (covered by the test above).
    await nextTick()
    expect(loading.value).toBe(true)
    await wait(10)
    expect(loading.value).toBe(false)
  })
})
