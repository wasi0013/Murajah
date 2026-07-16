import { describe, it, expect, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { BookOpen, ListChecks, Target } from 'lucide-vue-next'
import BottomTabBar from '@/components/BottomTabBar.vue'
import CommandPalette from '@/components/CommandPalette.vue'

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('BottomTabBar', () => {
  const tabs = [
    { value: 'read', label: 'Read', icon: BookOpen },
    { value: 'surahs', label: 'Surahs', icon: ListChecks },
    { value: 'goals', label: 'Goals', icon: Target },
  ]
  it('marks the active tab and emits on click', async () => {
    wrapper = mount(BottomTabBar, { props: { tabs, modelValue: 'read' } })
    const btns = wrapper.findAll('button')
    expect(btns[0].attributes('aria-current')).toBe('page')
    expect(btns[1].attributes('aria-current')).toBeUndefined()
    await btns[2].trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['goals'])
  })
})

describe('CommandPalette', () => {
  function open() {
    const selected: unknown[] = []
    wrapper = mount(CommandPalette, {
      props: { open: true, shortcut: false, onSelect: (j: unknown) => selected.push(j) },
    })
    return selected
  }

  it('shows parsed results and selects on Enter', async () => {
    const selected = open()
    const input = document.body.querySelector('.palette-input') as HTMLInputElement
    input.value = 'page 50'
    input.dispatchEvent(new Event('input'))
    await nextTick()

    const options = document.body.querySelectorAll('[role="option"]')
    expect(options).toHaveLength(1)
    expect(options[0].textContent).toContain('Page 50')

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(selected.at(-1)).toEqual({ type: 'page', page: 50 })
  })

  it('offers page + surah for a small number and moves with arrows', async () => {
    const selected = open()
    const input = document.body.querySelector('.palette-input') as HTMLInputElement
    input.value = '2'
    input.dispatchEvent(new Event('input'))
    await nextTick()
    expect(document.body.querySelectorAll('[role="option"]')).toHaveLength(2)

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(selected.at(-1)).toEqual({ type: 'surah', surah: 2 })
  })
})
