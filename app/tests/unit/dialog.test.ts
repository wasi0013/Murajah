import { describe, it, expect, afterEach } from 'vitest'
import { Transition } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import Dialog from '@/components/Dialog.vue'
import Modal from '@/components/Modal.vue'

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  document.body.style.overflow = ''
})

function openDialog(props = {}) {
  const updates: boolean[] = []
  wrapper = mount(Dialog, {
    props: { open: true, label: 'Settings', 'onUpdate:open': (v: boolean) => updates.push(v), ...props },
    slots: { default: '<button>Inside</button>' },
  })
  return updates
}

describe('Dialog', () => {
  it('teleports an accessible dialog when open', () => {
    openDialog()
    const dlg = document.body.querySelector('[role="dialog"]')
    expect(dlg).not.toBeNull()
    expect(dlg?.getAttribute('aria-modal')).toBe('true')
    expect(dlg?.getAttribute('aria-label')).toBe('Settings')
    expect(dlg?.textContent).toContain('Inside')
  })

  it('locks body scroll while open and restores on close', async () => {
    openDialog()
    expect(document.body.style.overflow).toBe('hidden')
    await wrapper!.setProps({ open: false })
    expect(document.body.style.overflow).toBe('')
  })

  it('closes on Escape', async () => {
    const updates = openDialog()
    const root = document.body.querySelector('.dlg-root')!
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(updates.at(-1)).toBe(false)
  })

  it('closes on scrim click', async () => {
    const updates = openDialog()
    const scrim = document.body.querySelector('.dlg-scrim') as HTMLElement
    scrim.click()
    expect(updates.at(-1)).toBe(false)
  })

  it('renders a drag handle only for the bottom placement', () => {
    openDialog({ placement: 'bottom' })
    expect(document.body.querySelector('.dlg-handle')).not.toBeNull()
  })

  // The on-screen keyboard shrinks only the visual viewport, so a full-screen
  // fixed root would leave a dialog's content under the keys. The top placement
  // sizes its root to the visible slice and follows it as the keyboard moves.
  it('sizes a top-placed dialog to the visual viewport and follows its resizes', async () => {
    const vv = Object.assign(new EventTarget(), { offsetTop: 0, height: 400 })
    const original = Object.getOwnPropertyDescriptor(window, 'visualViewport')
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
    try {
      openDialog({ placement: 'top' })
      const root = document.body.querySelector('.dlg-root') as HTMLElement
      expect(root.style.height).toBe('400px')
      expect(root.querySelector('.dlg-top')).not.toBeNull()

      vv.offsetTop = 20
      vv.height = 300
      vv.dispatchEvent(new Event('resize'))
      await wrapper!.vm.$nextTick()
      expect(root.style.top).toBe('20px')
      expect(root.style.height).toBe('300px')
    } finally {
      if (original) Object.defineProperty(window, 'visualViewport', original)
      else delete (window as { visualViewport?: unknown }).visualViewport
    }
  })

  it('leaves center dialogs full-screen regardless of the visual viewport', () => {
    openDialog()
    expect((document.body.querySelector('.dlg-root') as HTMLElement).style.height).toBe('')
  })

  it('ignores Escape and scrim clicks when dismissible is false', () => {
    const updates = openDialog({ dismissible: false })
    const root = document.body.querySelector('.dlg-root')!
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    ;(document.body.querySelector('.dlg-scrim') as HTMLElement).click()
    expect(updates).toHaveLength(0)
  })

  // Regression coverage: Chrome doesn't count an element toward Largest
  // Contentful Paint until an opacity/transform entrance transition settles.
  // A dialog that can open during the page's own initial load (onboarding)
  // was pushing LCP out by the full transition duration — `animate={false}`
  // tells the wrapping `<Transition>` to skip CSS classes (`:css="animate"`)
  // so it renders instantly. Default stays `true` so every other dialog keeps
  // its fade/scale.
  it('defaults to an animated Transition, and animate=false disables it', () => {
    openDialog()
    expect(wrapper!.findComponent(Transition).props('css')).toBe(true)
    wrapper!.unmount()

    openDialog({ animate: false })
    expect(wrapper!.findComponent(Transition).props('css')).toBe(false)
  })
})

// Regression coverage: Modal forwards `dismissible` to Dialog as
// `:dismissible="dismissible"`. When a Modal caller doesn't pass the prop,
// Modal's own value is `undefined` — Vue's Boolean-prop casting resolves a
// *bound* `undefined` to `false` (only an absent attribute falls through to a
// child's `withDefaults` default), so Modal must declare its own default of
// `true` rather than relying on Dialog's. Without it, every ordinary Modal
// (all of them, until onboarding introduced the first non-dismissible one)
// would have silently stopped closing on Escape/scrim click.
describe('Modal', () => {
  it('is dismissible by default when the caller does not pass the prop', () => {
    const updates: boolean[] = []
    wrapper = mount(Modal, {
      props: { open: true, label: 'Reset progress', 'onUpdate:open': (v: boolean) => updates.push(v) },
      slots: { default: '<button>Inside</button>' },
    })
    ;(document.body.querySelector('.dlg-scrim') as HTMLElement).click()
    expect(updates.at(-1)).toBe(false)
  })

  it('forwards an explicit dismissible={false}', () => {
    const updates: boolean[] = []
    wrapper = mount(Modal, {
      props: {
        open: true,
        label: 'Choose your language',
        dismissible: false,
        'onUpdate:open': (v: boolean) => updates.push(v),
      },
      slots: { default: '<button>Inside</button>' },
    })
    ;(document.body.querySelector('.dlg-scrim') as HTMLElement).click()
    expect(updates).toHaveLength(0)
  })

  it('is animated by default, and forwards an explicit animate={false}', () => {
    wrapper = mount(Modal, {
      props: { open: true, label: 'Reset progress' },
      slots: { default: '<button>Inside</button>' },
    })
    expect(wrapper.findComponent(Transition).props('css')).toBe(true)
    wrapper.unmount()

    wrapper = mount(Modal, {
      props: { open: true, label: 'Choose your language', animate: false },
      slots: { default: '<button>Inside</button>' },
    })
    expect(wrapper.findComponent(Transition).props('css')).toBe(false)
  })
})
