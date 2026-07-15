import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { BookOpen } from 'lucide-vue-next'
import Icon from '@/components/Icon.vue'

describe('Icon', () => {
  it('renders an svg at the requested size', () => {
    const w = mount(Icon, { props: { icon: BookOpen, size: 28 } })
    const svg = w.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.attributes('width')).toBe('28')
    expect(svg.attributes('height')).toBe('28')
  })

  it('is decorative (aria-hidden) without a label', () => {
    const w = mount(Icon, { props: { icon: BookOpen } })
    const svg = w.find('svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('role')).toBeUndefined()
  })

  it('is announced (role=img + name) with a label', () => {
    const w = mount(Icon, { props: { icon: BookOpen, label: 'Read' } })
    const svg = w.find('svg')
    expect(svg.attributes('role')).toBe('img')
    expect(svg.attributes('aria-label')).toBe('Read')
    expect(svg.attributes('aria-hidden')).toBeUndefined()
  })
})
