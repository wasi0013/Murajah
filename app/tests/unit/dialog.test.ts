import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import Dialog from '@/components/Dialog.vue'

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
})
