import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Button from '@/components/Button.vue'

describe('Button', () => {
  it('renders slot content in a native button', () => {
    const w = mount(Button, { slots: { default: 'Save' } })
    expect(w.element.tagName).toBe('BUTTON')
    expect(w.text()).toContain('Save')
    expect(w.attributes('type')).toBe('button')
  })

  it('applies variant + size classes from tokens', () => {
    const w = mount(Button, { props: { variant: 'danger', size: 'lg' } })
    expect(w.classes()).toContain('bg-danger')
    expect(w.classes()).toContain('h-12')
  })

  it('applies the warn variant (on-brand amber, distinct from danger)', () => {
    const w = mount(Button, { props: { variant: 'warn' } })
    expect(w.classes()).toContain('bg-warn')
    expect(w.classes()).not.toContain('bg-danger')
  })

  it('emits click when enabled', async () => {
    const w = mount(Button)
    await w.trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
  })

  it('does not emit click when disabled or loading', async () => {
    const disabled = mount(Button, { props: { disabled: true } })
    await disabled.trigger('click')
    expect(disabled.emitted('click')).toBeUndefined()
    expect(disabled.attributes('disabled')).toBeDefined()

    const loading = mount(Button, { props: { loading: true } })
    await loading.trigger('click')
    expect(loading.emitted('click')).toBeUndefined()
    expect(loading.attributes('aria-busy')).toBe('true')
  })
})
