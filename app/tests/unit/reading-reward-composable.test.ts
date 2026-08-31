import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref, type Ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useReadingReward } from '@/composables/useReadingReward'
import { useProgressStore } from '@/stores/progress'
import { useSettingsStore } from '@/stores/settings'

function harness(page: Ref<number | undefined>, weight = 100) {
  const Comp = defineComponent({
    setup() {
      useReadingReward(page, () => weight)
      return () => null
    },
  })
  return mount(Comp)
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
  // happy-dom: force an "active" surface (visible + focused).
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  document.hasFocus = () => true
})
afterEach(() => vi.useRealTimers())

describe('useReadingReward (wired)', () => {
  it('awards ×1 at 90s and ×2 by 250s of active reading', () => {
    const page = ref<number | undefined>(50)
    const w = harness(page, 100)
    const progress = useProgressStore()

    vi.advanceTimersByTime(89_000)
    expect(progress.hasanah).toBe(0)
    vi.advanceTimersByTime(1_000) // 90s
    expect(progress.hasanah).toBe(100)
    vi.advanceTimersByTime(160_000) // 250s
    expect(progress.hasanah).toBe(200)
    // One review counted per session, even though two reward thresholds fired.
    expect(progress.reviewData.get(50)?.reviewCount).toBe(1)
    w.unmount()
  })

  it('does not accrue while the tab is hidden/blurred', () => {
    const page = ref<number | undefined>(50)
    const w = harness(page, 100)
    const progress = useProgressStore()
    document.hasFocus = () => false // blurred
    vi.advanceTimersByTime(120_000)
    expect(progress.hasanah).toBe(0)
    w.unmount()
  })

  it('a page change starts a fresh session (re-earnable)', async () => {
    const page = ref<number | undefined>(50)
    const w = harness(page, 100)
    const progress = useProgressStore()
    vi.advanceTimersByTime(90_000)
    expect(progress.hasanah).toBe(100)

    page.value = 51 // new page → new session
    await Promise.resolve()
    vi.advanceTimersByTime(90_000)
    expect(progress.hasanah).toBe(200) // earned again on the new page
    w.unmount()
  })

  // Real call-path proof (not just a store-level unit test) that the two
  // settings toggles gating this composable's two per-tick side effects
  // (progress.addReadingSeconds / progress.awardHasanah) are independent —
  // useReadingReward.ts itself needed zero changes for this; the gate lives
  // entirely in stores/progress.ts.
  it('reading-time tracking off does not block hasanah, and vice versa', () => {
    const settings = useSettingsStore()
    settings.setTrackReadingTime(false)
    const page = ref<number | undefined>(50)
    const w = harness(page, 100)
    const progress = useProgressStore()

    vi.advanceTimersByTime(90_000) // past the ×1 reward threshold
    expect(progress.readingSeconds).toBe(0) // suppressed
    expect(progress.hasanah).toBe(100) // still awarded — independent toggle
    w.unmount()
  })

  it('hasanah tracking off does not block reading-time, and vice versa', () => {
    const settings = useSettingsStore()
    settings.setTrackHasanah(false)
    const page = ref<number | undefined>(50)
    const w = harness(page, 100)
    const progress = useProgressStore()

    vi.advanceTimersByTime(90_000)
    expect(progress.hasanah).toBe(0) // suppressed
    expect(progress.readingSeconds).toBe(90) // still accrued — independent toggle
    w.unmount()
  })
})

// P0-1 (plans/performance-audit-2026-08.md): progress.addReadingSeconds must
// not fire on every 1s tick — that kept useProgressPersistence.ts's debounced
// IndexedDB watcher writing the whole progress record every second for as
// long as the reader was open. `readingSeconds` accrual is batched locally
// and flushed every FLUSH_INTERVAL_S(15)s, or immediately on tab-hide/
// pagehide/unmount — these tests assert the batching itself, and that no
// active second is ever silently dropped.
describe('useReadingReward — reading-seconds batching (P0-1)', () => {
  it('readingSeconds updates only every 15s, not every 1s', () => {
    const page = ref<number | undefined>(50)
    const w = harness(page, 100)
    const progress = useProgressStore()

    vi.advanceTimersByTime(14_000)
    expect(progress.readingSeconds).toBe(0) // not yet flushed
    vi.advanceTimersByTime(1_000) // 15s
    expect(progress.readingSeconds).toBe(15)
    vi.advanceTimersByTime(14_000) // 29s
    expect(progress.readingSeconds).toBe(15) // still the last flush
    vi.advanceTimersByTime(1_000) // 30s
    expect(progress.readingSeconds).toBe(30)
    w.unmount()
  })

  it('a tab-hide (visibilitychange) flushes a pending remainder immediately', () => {
    const page = ref<number | undefined>(50)
    const w = harness(page, 100)
    const progress = useProgressStore()

    vi.advanceTimersByTime(7_000) // < 15s, nothing flushed yet
    expect(progress.readingSeconds).toBe(0)
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(progress.readingSeconds).toBe(7) // flushed immediately, not lost
    w.unmount()
  })

  it('pagehide flushes a pending remainder immediately', () => {
    const page = ref<number | undefined>(50)
    const w = harness(page, 100)
    const progress = useProgressStore()

    vi.advanceTimersByTime(9_000)
    window.dispatchEvent(new Event('pagehide'))
    expect(progress.readingSeconds).toBe(9)
    w.unmount()
  })

  it('unmount flushes a pending remainder — no second is ever silently dropped', () => {
    const page = ref<number | undefined>(50)
    const w = harness(page, 100)
    const progress = useProgressStore()

    vi.advanceTimersByTime(47_000) // not a multiple of 15
    w.unmount()
    expect(progress.readingSeconds).toBe(47) // every active second still counted
  })

  // Code-review follow-up: an earlier version accrued `pendingSeconds`
  // unconditionally, only consulting `settings.trackReadingTime` via the
  // store's own gate at flush time — so toggling the setting mid-window
  // could over- or under-credit up to one flush interval. Gating accrual
  // itself on the live setting (matching the old per-tick call's
  // granularity) closes the over-crediting direction completely.
  it('does not credit seconds accrued while tracking was off, even after it is turned back on', () => {
    const settings = useSettingsStore()
    settings.setTrackReadingTime(false)
    const page = ref<number | undefined>(50)
    const w = harness(page, 100)
    const progress = useProgressStore()

    vi.advanceTimersByTime(10_000) // 10 active seconds, tracking OFF throughout
    settings.setTrackReadingTime(true)
    vi.advanceTimersByTime(5_000) // 5 more, tracking ON

    expect(progress.readingSeconds).toBe(5) // only the ON seconds, never the OFF ones
    w.unmount()
  })
})
