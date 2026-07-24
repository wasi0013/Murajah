import { onBeforeUnmount, onMounted } from 'vue'
import type { useReaderStore } from '@/stores/reader'
import { keyToPageDelta } from '@/core/reader/keyboard'

/**
 * Wire keyboard page-turns to the reader store while mounted. Ignores keystrokes
 * with modifiers or aimed at form controls (so shortcuts and typing still work).
 * The mushaf reads RTL, so arrows are mirrored (see keyToPageDelta).
 */
export function useReaderKeyboard(reader: ReturnType<typeof useReaderStore>, rtl = true) {
  function onKeydown(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const target = e.target as HTMLElement | null
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
      return
    }
    const delta = keyToPageDelta(e.key, rtl)
    if (delta === 0) return
    e.preventDefault()
    reader.goToPage(reader.page + delta)
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
}
