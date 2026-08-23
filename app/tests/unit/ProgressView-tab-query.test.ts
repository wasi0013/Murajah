import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ProgressView from '@/features/progress/ProgressView.vue'
import { _resetUserDataDb } from '@/core/storage/userData'

// Flagged in review: `tab` is seeded from `route.query.tab` once at setup with
// no watcher, so a same-route-instance query change (Vue Router reuses the
// component across navigations that only change the query) would silently be
// ignored. Every current caller navigates in from a *different* route, so a
// fresh instance always picks it up correctly — this specifically proves the
// watcher added in review handles the case no current UI path reaches yet.

let wrapper: VueWrapper | null = null
let router: Router

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  _resetUserDataDb()
  setActivePinia(createPinia())
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/progress', name: 'progress', component: ProgressView }],
  })
  await router.push('/progress')
  await router.isReady()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('ProgressView — reacts to route.query.tab changes on an already-mounted instance', () => {
  it('starts on Overview and switches to Journal when the query changes without remounting', async () => {
    wrapper = mount(ProgressView, { global: { plugins: [router] } })
    await nextTick()

    // Overview is up first — its stats section renders, Journal's does not.
    expect(wrapper.find('.stats').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Journal"]').exists()).toBe(false)

    // Same route record, query-only change — Vue Router reuses this instance
    // (no unmount/remount), which is exactly the case the watcher covers.
    await router.push({ path: '/progress', query: { tab: 'journal' } })
    await nextTick()

    expect(wrapper.find('[aria-label="Journal"]').exists()).toBe(true)
    expect(wrapper.find('.stats').exists()).toBe(false)
  })

  it('ignores an invalid tab value in the query rather than crashing or blanking the view', async () => {
    wrapper = mount(ProgressView, { global: { plugins: [router] } })
    await nextTick()
    expect(wrapper.find('.stats').exists()).toBe(true)

    await router.push({ path: '/progress', query: { tab: 'not-a-real-tab' } })
    await nextTick()

    expect(wrapper.find('.stats').exists()).toBe(true) // stayed on Overview
  })
})
