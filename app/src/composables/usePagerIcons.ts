import { computed, type ComputedRef } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import type { Dir } from '@/core/i18n/types'

/**
 * Chevron icons for a prev/next pair (page turn, month nav, …), aware of UI
 * text direction. The pair's *positions* already flip for free under
 * `dir="rtl"` — they sit in a flex row, and the browser mirrors the row's
 * start/end for us — but a fixed ChevronLeft="prev"/ChevronRight="next"
 * glyph assignment doesn't follow: the button now sitting on the right still
 * points left, into the content instead of toward the edge it turns *from*.
 * Swap which glyph means "prev" vs "next" in RTL so each button keeps
 * pointing outward, in the direction it visually leads.
 */
export function usePagerIcons(dir: ComputedRef<Dir>) {
  const prevIcon = computed(() => (dir.value === 'rtl' ? ChevronRight : ChevronLeft))
  const nextIcon = computed(() => (dir.value === 'rtl' ? ChevronLeft : ChevronRight))
  return { prevIcon, nextIcon }
}
