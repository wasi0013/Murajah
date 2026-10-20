import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { recordVisit, sanitizeTrail, TRAIL_MAX, type TrailEntry } from '@/core/navigation/readingTrail'

// In-memory prefs so persistence is observable and deterministic.
const prefs = new Map<string, unknown>()
vi.mock('@/core/storage/prefs', () => ({
  getPref: vi.fn(async (k: string) => structuredClone(prefs.get(k))),
  setPref: vi.fn(async (k: string, v: unknown) => {
    prefs.set(k, structuredClone(v))
  }),
}))

import { useReadingTrailStore, type TrailScheme } from '@/stores/readingTrail'
import { useReadingTrail, timeAgo } from '@/composables/useReadingTrail'
import CommandPalette from '@/components/CommandPalette.vue'
import TrailBackChip from '@/components/TrailBackChip.vue'

const pages = (t: readonly TrailEntry[]) => t.map((e) => e.page)

function walk(seq: number[]): TrailEntry[] {
  let trail: TrailEntry[] = []
  seq.forEach((p, i) => (trail = recordVisit(trail, p, i).trail))
  return trail
}

async function settle() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

describe('recordVisit (pure trail rules)', () => {
  it('reading on moves the current spot; a jump starts a new one and keeps the old', () => {
    // read 10→15, jump to 200, read to 202, jump to 50
    expect(pages(walk([10, 11, 12, 13, 14, 15, 200, 201, 202, 50]))).toEqual([50, 202, 15])
  })

  it('classifies visits', () => {
    const t = walk([10])
    expect(recordVisit(t, 10, 1).kind).toBe('same')
    expect(recordVisit(t, 11, 1).kind).toBe('moved')
    expect(recordVisit(t, 12, 1).kind).toBe('moved') // a 2-page mushaf spread step
    expect(recordVisit(t, 13, 1).kind).toBe('hop')
    expect(recordVisit([], 5, 1).kind).toBe('hop')
  })

  it('returning to a spot you left resumes it rather than listing it twice', () => {
    expect(pages(walk([15, 200, 16]))).toEqual([16, 200])
    expect(pages(walk([15, 200, 15]))).toEqual([15, 200])
  })

  it('keeps the current spot plus the last five, newest first', () => {
    const t = walk([10, 100, 200, 300, 400, 500, 600])
    expect(t).toHaveLength(TRAIL_MAX)
    expect(pages(t)).toEqual([600, 500, 400, 300, 200, 100])
  })

  it('stamps the spot with the latest visit time', () => {
    const t = recordVisit(walk([10]), 11, 99).trail
    expect(t[0]).toEqual({ page: 11, at: 99 })
  })

  it('sanitizes stored data without throwing', () => {
    expect(sanitizeTrail(undefined)).toEqual([])
    expect(sanitizeTrail('x')).toEqual([])
    expect(sanitizeTrail([{ page: 3, at: 1 }, { page: 0, at: 1 }, { page: 2.5, at: 1 }, null, { page: 4 }])).toEqual([
      { page: 3, at: 1 },
    ])
  })
})

describe('reading trail store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    prefs.clear()
  })

  it('a hop offers the way back; reading on withdraws it', async () => {
    const s = useReadingTrailStore()
    await s.hydrate()
    s.settle('qpc', 10)
    expect(s.backTo).toBeNull()
    s.visit('qpc', 300)
    expect(s.backTo).toEqual({ scheme: 'qpc', page: 10 })
    s.visit('qpc', 301)
    expect(s.backTo).toBeNull()
  })

  it('going back offers the way forward again (two spots can be flipped between)', async () => {
    const s = useReadingTrailStore()
    await s.hydrate()
    s.settle('qpc', 10)
    s.visit('qpc', 300)
    s.visit('qpc', 10)
    expect(s.backTo).toEqual({ scheme: 'qpc', page: 300 })
    expect(pages(s.trails.qpc)).toEqual([10, 300])
  })

  it('arriving (settle) is never a hop, even far from the last spot', async () => {
    const s = useReadingTrailStore()
    await s.hydrate()
    s.settle('qpc', 10)
    s.settle('qpc', 400)
    expect(s.backTo).toBeNull()
    expect(s.recent('qpc').map((e) => e.page)).toEqual([10])
  })

  it('persists, and a new session picks the trail up', async () => {
    vi.useFakeTimers()
    try {
      const s = useReadingTrailStore()
      await s.hydrate()
      s.settle('qpc', 10)
      s.visit('qpc', 300)
      await vi.advanceTimersByTimeAsync(1000)
    } finally {
      vi.useRealTimers()
    }
    setActivePinia(createPinia())
    const fresh = useReadingTrailStore()
    await fresh.hydrate()
    expect(pages(fresh.trails.qpc)).toEqual([300, 10])
    expect(fresh.backTo).toBeNull() // the chip is per-visit, never restored
  })
})

describe('useReadingTrail (view wiring)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    prefs.clear()
  })

  function harness(init: { scheme?: TrailScheme; page: number; ready?: boolean }) {
    const scheme = ref<TrailScheme>(init.scheme ?? 'qpc')
    const page = ref(init.page)
    const ready = ref(init.ready ?? true)
    let api!: ReturnType<typeof useReadingTrail>
    mount(
      defineComponent({
        setup() {
          api = useReadingTrail({ scheme: () => scheme.value, page: () => page.value, ready: () => ready.value })
          return () => h('div')
        },
      }),
    )
    return { scheme, page, ready, api: () => api }
  }

  it('REVIEW: a cold deep link records only the page actually opened (no fake hop from page 1)', async () => {
    // /2/255: the store sits on its default page 1 until the nav index resolves
    // the friendly URL to page 42 — not ready until then.
    const h = harness({ page: 1, ready: false })
    await settle()
    h.page.value = 42
    h.ready.value = true
    await settle()
    expect(h.api().backTo.value).toBeNull()
    expect(pages(useReadingTrailStore().trails.qpc)).toEqual([42])
  })

  it('REVIEW: a saved trail survives the first visit of a new session', async () => {
    prefs.set('readingTrail', { qpc: [{ page: 300, at: 1 }, { page: 15, at: 0 }], indopak: [] })
    const h = harness({ page: 50 })
    await settle()
    expect(pages(useReadingTrailStore().trails.qpc)).toEqual([50, 300, 15])
    expect(h.api().recentPages().map((r) => r.page)).toEqual([300, 15])
  })

  it('REVIEW: switching layout (scheme + remapped page in one tick) is not a hop', async () => {
    const h = harness({ page: 50 })
    await settle()
    h.page.value = 51
    await settle()
    h.scheme.value = 'indopak'
    h.page.value = 400 // far from anything on the Indopak trail
    await settle()
    expect(h.api().backTo.value).toBeNull()
    h.scheme.value = 'qpc'
    h.page.value = 51
    await settle()
    expect(h.api().backTo.value).toBeNull()
  })

  it('a hop shows the back target for this scheme only', async () => {
    const h = harness({ page: 50 })
    await settle()
    h.page.value = 400
    await settle()
    expect(h.api().backTo.value).toBe(50)
  })

  it('labels recent spots with the surah (QPC) and how long ago', async () => {
    const h = harness({ page: 50 })
    await settle()
    h.page.value = 262 // Al-Hijr starts on 262
    await settle()
    const [entry] = h.api().recentPages()
    expect(entry.page).toBe(50)
    expect(entry.label).toBe('Page 50')
    expect(entry.meta).toMatch(/^Ali 'Imran · /)
  })

  it('formats relative time in the UI language', () => {
    const now = 10_000_000
    expect(timeAgo(now - 5_000, now)).toBe('now')
    expect(timeAgo(now - 5 * 60_000, now)).toMatch(/5 min/)
    expect(timeAgo(now - 3 * 3_600_000, now)).toMatch(/3 hr/)
    expect(timeAgo(now - 86_400_000, now)).toBe('yesterday')
  })
})

describe('CommandPalette recent list', () => {
  const recent = [
    { page: 300, label: 'Page 300', meta: 'Al-Anfal · now' },
    { page: 15, label: 'Page 15', meta: 'Al-Baqarah · 1 hr. ago' },
  ]

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('lists recent pages when nothing is typed, and Enter / click jumps to one', async () => {
    const w = mount(CommandPalette, { props: { open: true, recent }, attachTo: document.body })
    await nextTick()
    expect(document.body.textContent).toContain('Recent pages')
    expect(document.body.textContent).toContain('Al-Baqarah')
    const input = document.body.querySelector('input')!
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await nextTick()
    expect(w.emitted('select')?.[0]).toEqual([{ type: 'page', page: 15 }])
    w.unmount()
  })

  it('typing switches to search results', async () => {
    const w = mount(CommandPalette, { props: { open: true, recent }, attachTo: document.body })
    await nextTick()
    const input = document.body.querySelector('input')!
    input.value = '2:255'
    input.dispatchEvent(new Event('input'))
    await nextTick()
    expect(document.body.textContent).not.toContain('Recent pages')
    expect(document.body.textContent).toContain('Ayah 2:255')
    w.unmount()
  })

  it('no recent section without a trail', async () => {
    const w = mount(CommandPalette, { props: { open: true }, attachTo: document.body })
    await nextTick()
    expect(document.body.textContent).not.toContain('Recent pages')
    w.unmount()
  })
})

describe('TrailBackChip', () => {
  afterEach(() => vi.useRealTimers())

  it('is absent without a back target, and hops back when tapped', async () => {
    const w = mount(TrailBackChip, { props: { page: null } })
    expect(w.find('button').exists()).toBe(false)
    await w.setProps({ page: 42 })
    const btn = w.find('.trail-back')
    expect(btn.attributes('aria-label')).toBe('Back to page 42')
    expect(btn.text()).toBe('Page 42')
    await btn.trigger('click')
    expect(w.emitted('back')?.[0]).toEqual([42])
  })

  it('the close button dismisses it', async () => {
    const w = mount(TrailBackChip, { props: { page: 42 } })
    const close = w.find('.trail-close')
    expect(close.attributes('aria-label')).toBe('Hide back button')
    await close.trigger('click')
    expect(w.emitted('dismiss')).toHaveLength(1)
    expect(w.emitted('back')).toBeUndefined()
  })

  it('hides itself after 3s so it never sits on the text', () => {
    vi.useFakeTimers()
    const w = mount(TrailBackChip, { props: { page: 42 } })
    vi.advanceTimersByTime(2900)
    expect(w.emitted('dismiss')).toBeUndefined()
    vi.advanceTimersByTime(100)
    expect(w.emitted('dismiss')).toHaveLength(1)
  })

  it('holds still while hovered or focused, then restarts its countdown', async () => {
    vi.useFakeTimers()
    const w = mount(TrailBackChip, { props: { page: 42 } })
    vi.advanceTimersByTime(2000)
    await w.find('.trail-chip').trigger('pointerenter')
    vi.advanceTimersByTime(10_000)
    expect(w.emitted('dismiss')).toBeUndefined()
    await w.find('.trail-chip').trigger('pointerleave')
    vi.advanceTimersByTime(2900)
    expect(w.emitted('dismiss')).toBeUndefined()
    vi.advanceTimersByTime(100)
    expect(w.emitted('dismiss')).toHaveLength(1)

    const f = mount(TrailBackChip, { props: { page: 7 } })
    await f.find('.trail-back').trigger('focusin')
    vi.advanceTimersByTime(10_000)
    expect(f.emitted('dismiss')).toBeUndefined()
  })

  it('a new hop gets the full time again', async () => {
    vi.useFakeTimers()
    const w = mount(TrailBackChip, { props: { page: 42 } })
    vi.advanceTimersByTime(2500)
    await w.setProps({ page: 300 })
    vi.advanceTimersByTime(2500)
    expect(w.emitted('dismiss')).toBeUndefined()
  })
})

describe('dismissing the back offer', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    prefs.clear()
  })

  it('withdraws the chip but keeps the spot on the trail', async () => {
    const s = useReadingTrailStore()
    await s.hydrate()
    s.settle('qpc', 10)
    s.visit('qpc', 300)
    s.dismissBack()
    expect(s.backTo).toBeNull()
    expect(s.recent('qpc').map((e) => e.page)).toEqual([10])
  })
})
