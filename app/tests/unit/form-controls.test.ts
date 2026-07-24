import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SegmentedControl from '@/components/SegmentedControl.vue'
import Toggle from '@/components/Toggle.vue'
import Slider from '@/components/Slider.vue'

const layoutOpts = [
  { value: 'qpc', label: 'Madani' },
  { value: 'indopak', label: 'Indopak' },
]

describe('SegmentedControl', () => {
  it('marks the selected option and exposes radiogroup semantics', () => {
    const w = mount(SegmentedControl, {
      props: { options: layoutOpts, modelValue: 'qpc', label: 'Layout' },
    })
    expect(w.attributes('role')).toBe('radiogroup')
    const radios = w.findAll('[role="radio"]')
    expect(radios[0].attributes('aria-checked')).toBe('true')
    expect(radios[1].attributes('aria-checked')).toBe('false')
  })

  it('selects on click and on arrow key', async () => {
    const w = mount(SegmentedControl, { props: { options: layoutOpts, modelValue: 'qpc' } })
    const radios = w.findAll('[role="radio"]')
    await radios[1].trigger('click')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['indopak'])
    await radios[0].trigger('keydown', { key: 'ArrowRight' })
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['indopak'])
  })
})

describe('Toggle', () => {
  it('is a switch reflecting checked state', async () => {
    const w = mount(Toggle, { props: { modelValue: false, label: 'Tajweed' } })
    const sw = w.get('[role="switch"]')
    expect(sw.attributes('aria-checked')).toBe('false')
    await sw.trigger('click')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([true])
  })

  it('does not toggle when disabled', async () => {
    const w = mount(Toggle, { props: { modelValue: false, disabled: true } })
    await w.get('[role="switch"]').trigger('click')
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })
})

describe('Slider', () => {
  it('renders a range input and emits on input', async () => {
    const w = mount(Slider, { props: { modelValue: 2, min: 1, max: 3, label: 'Text size' } })
    const input = w.get('input[type="range"]')
    expect(input.attributes('aria-label')).toBe('Text size')
    expect((input.element as HTMLInputElement).value).toBe('2')
    await input.setValue('3')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([3])
  })
})
