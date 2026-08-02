import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import AudioControlsTray from '@/features/audio/AudioControlsTray.vue'

// BUG regression: the repeat-count/spaced-drill section used to render
// unconditionally in every context, including ones (page grain; Listen) where no
// caller ever wires `repeatCount`/`spaced` into the actual playlist — so the
// control visibly changed state and rebuilt the playlist but had no audible
// effect. It now only renders where a caller opts in via `showRepeat`.

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('AudioControlsTray — showRepeat gating', () => {
  it('shows the repeat/spaced section by default (verse-grain contexts that wire it)', () => {
    const wrapper = mount(AudioControlsTray)
    expect(wrapper.find('[aria-labelledby="drill-label"]').exists()).toBe(true)
  })

  it('hides the repeat/spaced section when showRepeat is false (page grain; Listen)', () => {
    const wrapper = mount(AudioControlsTray, { props: { showRepeat: false } })
    expect(wrapper.find('[aria-labelledby="drill-label"]').exists()).toBe(false)
  })

  it('still shows AB-repeat and speed controls regardless of showRepeat', () => {
    const wrapper = mount(AudioControlsTray, { props: { showRepeat: false } })
    expect(wrapper.find('[aria-labelledby="ab-label"]').exists()).toBe(true)
    expect(wrapper.find('[aria-labelledby="speed-label"]').exists()).toBe(true)
  })
})
