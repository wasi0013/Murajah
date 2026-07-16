import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { parseReaderRoute, readerStateToRoute } from '@/core/navigation/readerRoute'
import { useReaderStore } from '@/stores/reader'
import { useReaderRouteSync } from '@/composables/useReaderRouteSync'

describe('parseReaderRoute', () => {
  it('reads layout + page from params', () => {
    expect(parseReaderRoute({ layout: 'indopak', page: '50' })).toEqual({
      layout: 'indopak',
      page: 50,
    })
  })

  it('ignores invalid layout / page', () => {
    expect(parseReaderRoute({ layout: 'klingon', page: '0' })).toEqual({})
    expect(parseReaderRoute({ layout: 'qpc', page: 'abc' })).toEqual({ layout: 'qpc' })
  })

  it('parses toggle query values leniently (1/0/true/false)', () => {
    expect(parseReaderRoute({ layout: 'qpc', page: '5' }, { tajweed: '0', wbw: '1', tafsir: 'true' }))
      .toEqual({ layout: 'qpc', page: 5, tajweed: false, wbw: true, tafsir: true })
    // absent toggles stay absent (store keeps its value)
    expect(parseReaderRoute({ layout: 'qpc', page: '5' })).toEqual({ layout: 'qpc', page: 5 })
  })
})

describe('readerStateToRoute', () => {
  it('omits default toggles, encodes only overrides', () => {
    expect(
      readerStateToRoute({ layout: 'qpc', page: 42, tajweed: true, wbw: false, tafsir: false }),
    ).toEqual({ params: { layout: 'qpc', page: '42' }, query: {} })

    expect(
      readerStateToRoute({ layout: 'indopak', page: 7, tajweed: false, wbw: true, tafsir: true }),
    ).toEqual({
      params: { layout: 'indopak', page: '7' },
      query: { tajweed: '0', wbw: '1', tafsir: '1' },
    })
  })

  it('round-trips non-default toggles through parse', () => {
    // Defaults are omitted by design, so round-trip holds for overridden toggles.
    const state = { layout: 'indopak' as const, page: 300, tajweed: false, wbw: true, tafsir: true }
    const { params, query } = readerStateToRoute(state)
    expect(parseReaderRoute(params, query)).toEqual(state)
  })
})

/** Flush a post-flush watcher + let the async router navigation settle. */
const flush = async () => {
  await nextTick()
  await new Promise((r) => setTimeout(r))
}

describe('useReaderRouteSync', () => {
  let router: Router
  beforeEach(async () => {
    setActivePinia(createPinia())
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'home', component: { template: '<div/>' } },
        { path: '/read/:layout/:page', name: 'reader', component: { template: '<div/>' } },
      ],
    })
    await router.push('/')
    await router.isReady()
  })

  it('deep-link applies to the store', async () => {
    await router.push('/read/indopak/120?wbw=1&tajweed=0')
    const reader = useReaderStore()
    const sync = useReaderRouteSync(reader, router)
    sync.applyRoute()
    expect(reader.layout).toBe('indopak')
    expect(reader.page).toBe(120)
    expect(reader.wbw).toBe(true)
    expect(reader.tajweed).toBe(false)
    sync.dispose()
  })

  it('store changes drive the URL (page pushes, toggle replaces)', async () => {
    await router.push('/read/qpc/1')
    const reader = useReaderStore()
    reader.configure({ qpc: 604 })
    const sync = useReaderRouteSync(reader, router)

    reader.goToPage(50)
    await flush()
    expect(router.currentRoute.value.fullPath).toBe('/read/qpc/50')

    reader.toggleWbw()
    await flush()
    expect(router.currentRoute.value.query.wbw).toBe('1')
    sync.dispose()
  })

  it('browser back/forward moves the reader (URL → store)', async () => {
    const reader = useReaderStore()
    const sync = useReaderRouteSync(reader, router)
    await router.push('/read/qpc/10')
    await flush()
    await router.push('/read/qpc/20')
    await flush()
    expect(reader.page).toBe(20)

    router.back()
    await flush()
    expect(reader.page).toBe(10)
    sync.dispose()
  })
})
