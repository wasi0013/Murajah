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
