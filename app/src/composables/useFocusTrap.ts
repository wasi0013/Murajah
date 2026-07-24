import { nextTick, onUnmounted, watch, type Ref } from 'vue'

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Trap Tab focus within `container` while `active` is true, and restore focus to
 * the previously-focused element when it closes. Keeps keyboard users inside an
 * open dialog/sheet.
 */
export function useFocusTrap(container: Ref<HTMLElement | undefined>, active: Ref<boolean>) {
  let restore: HTMLElement | null = null

  function focusable(): HTMLElement[] {
    if (!container.value) return []
    return Array.from(container.value.querySelectorAll<HTMLElement>(FOCUSABLE))
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab' || !container.value) return
    const items = focusable()
    if (items.length === 0) {
      e.preventDefault()
      container.value.focus()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const current = document.activeElement
    if (e.shiftKey && current === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && current === last) {
      e.preventDefault()
      first.focus()
    }
  }

  watch(
    active,
    async (on) => {
      if (typeof document === 'undefined') return
    if (on) {
      restore = document.activeElement as HTMLElement | null
      document.addEventListener('keydown', onKeydown, true)
      await nextTick()
      ;(focusable()[0] ?? container.value)?.focus()
    } else {
      document.removeEventListener('keydown', onKeydown, true)
      restore?.focus?.()
      restore = null
    }
    },
    { immediate: active.value },
  )

  onUnmounted(() => document.removeEventListener('keydown', onKeydown, true))
}
