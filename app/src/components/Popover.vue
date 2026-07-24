<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

// Anchored floating panel — opens from a trigger, positions below (flips above
// if it would overflow), closes on outside-click / Escape. Teleported so it's
// never clipped. Backs the reader's morphology-on-tap popup (Phase 3).
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ label?: string }>()

const trigger = ref<HTMLElement>()
const panel = ref<HTMLElement>()
const style = ref<Record<string, string>>({})

function place() {
  const t = trigger.value?.getBoundingClientRect()
  const p = panel.value?.getBoundingClientRect()
  if (!t || !p) return
  const gap = 8
  const vw = window.innerWidth
  const vh = window.innerHeight
  let top = t.bottom + gap
  if (top + p.height > vh && t.top - gap - p.height > 0) top = t.top - gap - p.height
  let left = t.left + t.width / 2 - p.width / 2
  left = Math.max(8, Math.min(left, vw - p.width - 8))
  style.value = { top: `${top}px`, left: `${left}px` }
}

function onDocPointer(e: Event) {
  const el = e.target as Node
  if (panel.value?.contains(el) || trigger.value?.contains(el)) return
  open.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}

function bind() {
  document.addEventListener('click', onDocPointer, true)
  document.addEventListener('keydown', onKey, true)
  window.addEventListener('scroll', place, true)
  window.addEventListener('resize', place)
}
function unbind() {
  document.removeEventListener('click', onDocPointer, true)
  document.removeEventListener('keydown', onKey, true)
  window.removeEventListener('scroll', place, true)
  window.removeEventListener('resize', place)
}

watch(open, async (o) => {
  if (o) {
    await nextTick()
    place()
    bind()
    panel.value?.focus()
  } else {
    unbind()
  }
})

onBeforeUnmount(unbind)
</script>

<template>
  <span ref="trigger" class="inline-flex" @click="open = !open">
    <slot name="trigger" :open="open" />
  </span>
  <Teleport to="body">
    <div
      v-if="open"
      ref="panel"
      role="dialog"
      :aria-label="label"
      tabindex="-1"
      class="popover"
      :style="style"
    >
      <slot :close="() => (open = false)" />
    </div>
  </Teleport>
</template>

<style scoped>
.popover {
  position: fixed;
  z-index: var(--z-dropdown);
  max-width: min(90vw, 22rem);
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: var(--shadow-lg);
  outline: none;
}
</style>
