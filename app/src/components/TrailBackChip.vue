<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { Undo2, X } from 'lucide-vue-next'
import Icon from './Icon.vue'
import { useI18n } from '@/core/i18n'

/**
 * "Back to page N", offered only right after a hop (a quick-jump, a surah from the
 * contents, a deep link). It floats over the first line of the reading surface, so
 * it stays out of the way: it hides itself after `AUTO_HIDE_MS`, has its own close
 * button, and is gone as soon as the reader reads on. Tapping it hops back, which
 * offers the way forward again: two spots can be flipped between. Hangs just under
 * the reading views' sticky top bar (the parent header is its containing block);
 * the full trail stays in the quick-jump palette.
 */
const props = defineProps<{ page: number | null }>()
const emit = defineEmits<{ back: [page: number]; dismiss: [] }>()
const { t } = useI18n()

/** How long the chip stays up untouched before it gets out of the reader's way. */
const AUTO_HIDE_MS = 3000

let timer: ReturnType<typeof setTimeout> | undefined
function stopTimer() {
  clearTimeout(timer)
  timer = undefined
}
function startTimer() {
  stopTimer()
  if (props.page !== null) timer = setTimeout(() => emit('dismiss'), AUTO_HIDE_MS)
}

// A fresh offer (a new hop) gets the full time again.
watch(() => props.page, startTimer, { immediate: true })
onBeforeUnmount(stopTimer)
</script>

<template>
  <Transition name="trail-chip">
    <!-- Hovered or focused, it holds still: it never vanishes from under a
         pointer or keyboard focus, and restarts its countdown when left. -->
    <div
      v-if="page !== null"
      class="trail-chip"
      @pointerenter="stopTimer"
      @pointerleave="startTimer"
      @focusin="stopTimer"
      @focusout="startTimer"
    >
      <button
        type="button"
        class="trail-back"
        :aria-label="t('reader.backToPage', { n: page })"
        @click="emit('back', page)"
      >
        <Icon :icon="Undo2" :size="14" class="trail-icon" />
        <span>{{ t('common.page', { n: page }) }}</span>
      </button>
      <button type="button" class="trail-close" :aria-label="t('reader.hideBack')" @click="emit('dismiss')">
        <Icon :icon="X" :size="14" />
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.trail-chip {
  position: absolute;
  top: calc(100% + 0.5rem);
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: stretch;
  height: 2rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  box-shadow: var(--shadow-md);
  color: var(--color-text);
  font-size: var(--text-sm);
  white-space: nowrap;
  overflow: hidden;
}
.trail-back,
.trail-close {
  display: inline-flex;
  align-items: center;
  color: inherit;
}
.trail-back {
  gap: 0.375rem;
  padding-inline: 0.75rem 0.5rem;
}
.trail-close {
  justify-content: center;
  width: 2rem;
  border-inline-start: 1px solid var(--color-border);
  color: var(--color-text-muted);
}
.trail-back:hover,
.trail-close:hover {
  background: var(--color-elevated);
}
.trail-close:hover {
  color: var(--color-text);
}
.trail-back:focus-visible,
.trail-close:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
.trail-icon {
  color: var(--color-accent);
}
/* "Back" points the way the reader came from: right, in a right-to-left UI. */
.trail-back:dir(rtl) .trail-icon {
  transform: scaleX(-1);
}
.trail-chip-enter-active,
.trail-chip-leave-active {
  transition:
    opacity var(--duration-fast) var(--ease-standard),
    transform var(--duration-fast) var(--ease-standard);
}
.trail-chip-enter-from,
.trail-chip-leave-to {
  opacity: 0;
  transform: translate(-50%, -0.375rem);
}
@media (prefers-reduced-motion: reduce) {
  .trail-chip-enter-active,
  .trail-chip-leave-active {
    transition: none;
  }
}
</style>
