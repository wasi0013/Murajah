import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import Tabs from '@/components/Tabs.vue'
import Skeleton from '@/components/Skeleton.vue'
import Popover from '@/components/Popover.vue'
import { toast, dismissToast, useToasts } from '@/composables/useToast'

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  useToasts().splice(0) // clear toast store between tests
})

describe('Tabs', () => {
  const tabs = [
    { value: 'ar', label: 'Arabic' },
    { value: 'en', label: 'English' },
  ]
  it('exposes tablist/tab/tabpanel with the active value in the panel', async () => {
    wrapper = mount(Tabs, {
      props: { tabs, modelValue: 'ar' },
      slots: { default: `<template #default="{ active }">panel:{{ active }}</template>` },
    })
    expect(wrapper.get('[role="tablist"]')).toBeTruthy()
    const t = wrapper.findAll('[role="tab"]')
    expect(t[0].attributes('aria-selected')).toBe('true')
    expect(wrapper.get('[role="tabpanel"]').text()).toContain('panel:ar')
    await t[1].trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['en'])
  })
  it('moves selection with arrow keys', async () => {
    wrapper = mount(Tabs, { props: { tabs, modelValue: 'ar' } })
    await wrapper.findAll('[role="tab"]')[0].trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['en'])
  })
})

describe('Skeleton', () => {
  it('is a decorative placeholder with the requested size', () => {
    wrapper = mount(Skeleton, { props: { width: '80px', height: '2rem', rounded: 'full' } })
    expect(wrapper.attributes('aria-hidden')).toBe('true')
    expect(wrapper.classes()).toContain('rounded-full')
    expect(wrapper.attributes('style')).toContain('width: 80px')
  })
})

describe('toast store', () => {
  it('adds, auto-dismisses after duration, and dismisses manually', () => {
    vi.useFakeTimers()
    const items = useToasts()
    const id = toast('Saved', { variant: 'success', duration: 1000 })
    expect(items).toHaveLength(1)
    expect(items[0].variant).toBe('success')
    vi.advanceTimersByTime(1000)
    expect(items).toHaveLength(0)

    const id2 = toast('Kept', { duration: 0 }) // sticky
    vi.advanceTimersByTime(5000)
    expect(items).toHaveLength(1)
    dismissToast(id2)
    expect(items).toHaveLength(0)
    void id
    vi.useRealTimers()
  })
})

describe('Popover', () => {
  it('opens on trigger click and closes on Escape', async () => {
    wrapper = mount(Popover, {
      props: { label: 'Word info' },
      slots: {
        trigger: '<button>word</button>',
        default: '<p>morphology</p>',
      },
    })
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    await wrapper.get('span').trigger('click')
    expect(document.body.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Word info')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })
})
