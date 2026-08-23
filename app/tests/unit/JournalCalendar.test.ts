import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import JournalCalendar from '@/features/progress/JournalCalendar.vue'
import type { JournalDaySummary } from '@/composables/useJournalMonth'

// Was flagged in review as dead API surface (`useJournalMonth`'s `loading` was
// exported and tested at the composable level but never wired into any
// component). Now that JournalPanel passes it through as a prop, this
// verifies the template actually reacts to it.

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

const days: JournalDaySummary[] = [
  { date: '2026-08-01', dayState: 'none', hasNote: false, eventCount: 0 },
]

function mountCalendar(loading?: boolean) {
  return mount(JournalCalendar, {
    props: { year: 2026, month: 8, days, todayDate: '2026-08-01', loading },
  })
}

describe('JournalCalendar — loading indicator (fixed in review)', () => {
  it('shows a loading hint while the month is being fetched', () => {
    wrapper = mountCalendar(true)
    expect(wrapper.find('.loading-hint').exists()).toBe(true)
    expect(wrapper.find('.loading-hint').text()).toBe('Loading…')
  })

  it('shows no loading hint once the month has loaded', () => {
    wrapper = mountCalendar(false)
    expect(wrapper.find('.loading-hint').exists()).toBe(false)
  })

  it('omitting the prop entirely defaults to no loading hint', () => {
    wrapper = mountCalendar(undefined)
    expect(wrapper.find('.loading-hint').exists()).toBe(false)
  })

  it('still renders the grid itself while loading (not a blocking overlay)', () => {
    wrapper = mountCalendar(true)
    expect(wrapper.find('[data-date="2026-08-01"]').exists()).toBe(true)
  })
})
