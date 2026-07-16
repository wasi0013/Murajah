<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import Icon from '@/components/Icon.vue'
import { useFocusTrap } from '@/composables/useFocusTrap'

/**
 * Morphology analysis popup — anchored to the tapped word, teleported so it's
 * never clipped, focus-trapped, and closed on Escape / outside-click / paging.
 * Content is the trusted per-word analysis HTML from the data pipeline. Loaded
 * as an async component so it (and its data) stay out of the initial reader
 * bundle.
 */
const props = defineProps<{
  anchor: HTMLElement | null
  location: string
  content: string | null
  loading: boolean
}>()
const emit = defineEmits<{ close: [] }>()

const panel = ref<HTMLElement>()
const active = ref(true)
useFocusTrap(panel, active)

const style = ref<Record<string, string>>({})

function place() {
  const a = props.anchor?.getBoundingClientRect()
  const p = panel.value?.getBoundingClientRect()
  if (!a) return
  const gap = 8
  const vw = window.innerWidth
  const vh = window.innerHeight
  const ph = p?.height ?? 0
  const pw = p?.width ?? 320
  // Prefer below the word; flip above if it would overflow the viewport.
  let top = a.bottom + gap
  if (top + ph > vh && a.top - gap - ph > 0) top = a.top - gap - ph
  let left = a.left + a.width / 2 - pw / 2
  left = Math.max(8, Math.min(left, vw - pw - 8))
  style.value = { top: `${top}px`, left: `${left}px` }
}

const ref_ = computed(() => {
  const [s, a, w] = props.location.split(':')
  return { surah: s, ayah: a, word: w }
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
function onDocPointer(e: Event) {
  const t = e.target as HTMLElement
  if (panel.value?.contains(t)) return
  // Word taps are handled by the reader (switches to the new word), not a close.
  if (t.closest?.('[data-loc]')) return
  emit('close')
}

onMounted(async () => {
  await nextTick()
  place()
  document.addEventListener('keydown', onKey, true)
  document.addEventListener('click', onDocPointer, true)
  window.addEventListener('scroll', place, true)
  window.addEventListener('resize', place)
})
onBeforeUnmount(() => {
  active.value = false
  document.removeEventListener('keydown', onKey, true)
  document.removeEventListener('click', onDocPointer, true)
  window.removeEventListener('scroll', place, true)
  window.removeEventListener('resize', place)
})
// Re-anchor when the tapped word changes without unmounting.
watch(() => props.anchor, () => nextTick().then(place))
</script>

<template>
  <Teleport to="body">
    <div
      ref="panel"
      class="morphology"
      role="dialog"
      aria-label="Word morphology"
      tabindex="-1"
      :style="style"
    >
      <header class="head">
        <div>
          <p class="title">Morphology</p>
          <p class="loc">Surah {{ ref_.surah }} · Ayah {{ ref_.ayah }} · Word {{ ref_.word }}</p>
        </div>
        <button type="button" class="close" aria-label="Close" @click="emit('close')">
          <Icon :icon="X" :size="16" />
        </button>
      </header>

      <div class="body">
        <p v-if="loading" class="state">Loading analysis…</p>
        <!-- Trusted, build-time morphology HTML (see data-pipeline). -->
        <div v-else-if="content" class="analysis" v-html="content" />
        <p v-else class="state">No morphology data for this word.</p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.morphology {
  position: fixed;
  z-index: var(--z-modal);
  width: min(92vw, 24rem);
  max-height: min(60vh, 28rem);
  overflow-y: auto;
  padding: 0.85rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: var(--shadow-lg);
  outline: none;
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}
.title {
  font-weight: 600;
  font-size: var(--text-sm);
}
.loc {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}
.close {
  display: inline-flex;
  padding: 0.25rem;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
}
.close:hover {
  background: var(--color-elevated);
  color: var(--color-text);
}
.close:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.body {
  font-size: var(--text-sm);
  line-height: 1.55;
}
.state {
  color: var(--color-text-muted);
}
/* The analysis HTML uses <i class="ab"> (transliteration) and <span class="at">
   (Arabic terms) — style them lightly and keep Arabic RTL. */
.analysis :deep(.at) {
  font-family: var(--font-arabic);
  direction: rtl;
  unicode-bidi: isolate;
}
.analysis :deep(.ab) {
  font-style: italic;
}
</style>
