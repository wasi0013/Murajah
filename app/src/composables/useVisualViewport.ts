import { onUnmounted, ref, watch, type Ref } from 'vue'

export interface ViewportBox {
  top: number
  height: number
}

/**
 * The visible slice of the page while `active` is true: the on-screen keyboard
 * on iOS (and Android Chrome by default) shrinks only the visual viewport, so a
 * `position: fixed; inset: 0` layer still runs underneath the keys. Sizing an
 * overlay to this box keeps its content above the keyboard. Null when inactive
 * or unsupported, so callers fall back to their normal full-screen layout.
 */
export function useVisualViewport(active: Ref<boolean>) {
  const box = ref<ViewportBox | null>(null)
  const vv = typeof window === 'undefined' ? undefined : window.visualViewport

  function update() {
    if (vv) box.value = { top: vv.offsetTop, height: vv.height }
  }

  function apply(on: boolean) {
    if (!vv) return
    if (on) {
      update()
      vv.addEventListener('resize', update)
      vv.addEventListener('scroll', update)
    } else {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      box.value = null
    }
  }

  watch(active, apply, { immediate: active.value })
  onUnmounted(() => apply(false))
  return box
}
