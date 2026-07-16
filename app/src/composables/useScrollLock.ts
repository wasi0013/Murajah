import { onUnmounted, watch, type Ref } from 'vue'

/** Lock body scroll while `active` is true; restore the previous value after. */
export function useScrollLock(active: Ref<boolean>) {
  let previous = ''

  function apply(on: boolean) {
    if (typeof document === 'undefined') return
    if (on) {
      previous = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = previous
    }
  }

  // immediate only when already active, so a dialog mounted closed doesn't
  // reset another open dialog's lock.
  watch(active, apply, { immediate: active.value })
  onUnmounted(() => apply(false))
}
