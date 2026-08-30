import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useListeningTime } from '@/composables/useListeningTime'
import { useAudioStore } from '@/stores/audio'
import { useProgressStore } from '@/stores/progress'
import { useSettingsStore } from '@/stores/settings'

// P0-1 (plans/performance-audit-2026-08.md): progress.addListeningSeconds
// must not fire on every 1s tick while audio plays — that kept
// useProgressPersistence.ts's debounced IndexedDB watcher writing the whole
// progress record every second, indefinitely, for as long as audio played,
// contending with every other feature sharing that IndexedDB object store.
// `listeningSeconds` accrual is batched locally and flushed every
// FLUSH_INTERVAL_S(15)s, or immediately on tab-hide/pagehide/unmount. These
// tests assert the batching itself, and that no playing second is ever
// silently dropped.

function harness() {
  const Comp = defineComponent({
    setup() {
      useListeningTime()
      return () => null
    },
  })
  return mount(Comp)
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('useListeningTime — listening-seconds batching (P0-1)', () => {
  it('does not accrue at all while nothing is playing', () => {
    const w = harness()
    const progress = useProgressStore()
    vi.advanceTimersByTime(60_000)
    expect(progress.listeningSeconds).toBe(0)
    w.unmount()
  })

  it('listeningSeconds updates only every 15s while playing, not every 1s', () => {
    const w = harness()
    const audio = useAudioStore()
    const progress = useProgressStore()
    audio.isPlaying = true

    vi.advanceTimersByTime(14_000)
    expect(progress.listeningSeconds).toBe(0) // not yet flushed
    vi.advanceTimersByTime(1_000) // 15s
    expect(progress.listeningSeconds).toBe(15)
    vi.advanceTimersByTime(14_000) // 29s
    expect(progress.listeningSeconds).toBe(15) // still the last flush
    vi.advanceTimersByTime(1_000) // 30s
    expect(progress.listeningSeconds).toBe(30)
    w.unmount()
  })

  it('a tab-hide (visibilitychange) flushes a pending remainder immediately', () => {
    const w = harness()
    const audio = useAudioStore()
    const progress = useProgressStore()
    audio.isPlaying = true

    vi.advanceTimersByTime(7_000) // < 15s, nothing flushed yet
    expect(progress.listeningSeconds).toBe(0)
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(progress.listeningSeconds).toBe(7) // flushed immediately, not lost
    w.unmount()
  })

  it('pagehide flushes a pending remainder immediately', () => {
    const w = harness()
    const audio = useAudioStore()
    const progress = useProgressStore()
    audio.isPlaying = true

    vi.advanceTimersByTime(9_000)
    window.dispatchEvent(new Event('pagehide'))
    expect(progress.listeningSeconds).toBe(9)
    w.unmount()
  })

  it('unmount flushes a pending remainder — no second is ever silently dropped', () => {
    const w = harness()
    const audio = useAudioStore()
    const progress = useProgressStore()
    audio.isPlaying = true

    vi.advanceTimersByTime(47_000) // not a multiple of 15
    w.unmount()
    expect(progress.listeningSeconds).toBe(47) // every playing second still counted
  })

  it('pausing mid-interval keeps only the seconds actually played, credited on the next flush', () => {
    const w = harness()
    const audio = useAudioStore()
    const progress = useProgressStore()
    audio.isPlaying = true

    vi.advanceTimersByTime(5_000) // 5 playing seconds
    audio.isPlaying = false
    vi.advanceTimersByTime(20_000) // idle past a flush boundary
    expect(progress.listeningSeconds).toBe(5) // only the 5 actually-playing seconds
    w.unmount()
  })

  // Code-review follow-up: an earlier version of this composable accrued
  // `pending` unconditionally, only consulting `settings.trackListeningTime`
  // via the store's own gate at flush time — so toggling the setting
  // mid-window could over- or under-credit up to one flush interval. Gating
  // accrual itself on the live setting (matching the old per-tick call's
  // granularity) closes the over-crediting direction completely.
  it('does not credit seconds accrued while tracking was off, even after it is turned back on', () => {
    const w = harness()
    const audio = useAudioStore()
    const progress = useProgressStore()
    const settings = useSettingsStore()
    audio.isPlaying = true
    settings.setTrackListeningTime(false)

    vi.advanceTimersByTime(10_000) // 10 playing seconds, tracking OFF throughout
    settings.setTrackListeningTime(true)
    vi.advanceTimersByTime(5_000) // 5 more, tracking ON

    expect(progress.listeningSeconds).toBe(5) // only the ON seconds, never the OFF ones
    w.unmount()
  })
})
