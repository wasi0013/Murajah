<script setup lang="ts">
import { computed, ref } from 'vue'
import { useFocusTrap } from '@/composables/useFocusTrap'
import { useScrollLock } from '@/composables/useScrollLock'
import { useVisualViewport } from '@/composables/useVisualViewport'

// Accessible overlay: teleported, scrim + escape close, scroll lock, focus trap,
// role=dialog/aria-modal. `placement="bottom"` = mobile sheet, `center` = modal,
// `top` = modal pinned near the top that stays above the on-screen keyboard
// (for dialogs that open straight into a text field).
type Placement = 'bottom' | 'center' | 'top'

const open = defineModel<boolean>('open', { default: false })
const props = withDefaults(
  defineProps<{
    placement?: Placement
    label?: string
    labelledby?: string
    /** Set false for a flow the user must complete (e.g. required first-run
     * setup) — Escape and scrim clicks stop closing it. */
    dismissible?: boolean
    /** Set false to skip the fade/scale transition and render instantly.
     * Chrome doesn't count an element for Largest Contentful Paint until an
     * opacity/transform entrance animation settles — for a dialog that can
     * open during the page's own initial load (e.g. a first-run onboarding
     * gate), that pushed LCP out by the full transition duration. Ordinary
     * dialogs open well after first paint, where this doesn't matter, so they
     * keep the animation. */
    animate?: boolean
  }>(),
  { placement: 'center', dismissible: true, animate: true },
)

const panel = ref<HTMLElement>()
useFocusTrap(panel, open)
useScrollLock(open)

const viewport = useVisualViewport(computed(() => open.value && props.placement === 'top'))
const rootStyle = computed(() =>
  viewport.value ? { top: `${viewport.value.top}px`, height: `${viewport.value.height}px`, bottom: 'auto' } : undefined,
)

const rootClass: Record<Placement, string> = {
  bottom: 'items-end',
  center: 'items-center justify-center p-4',
  top: 'items-start justify-center dlg-top-root',
}

function close() {
  if (!props.dismissible) return
  open.value = false
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}
</script>

<template>
  <Teleport to="body">
    <Transition :name="placement === 'bottom' ? 'sheet' : 'modal'" :css="animate">
      <div
        v-if="open"
        class="dlg-root"
        :class="rootClass[placement]"
        :style="rootStyle"
        @keydown="onKeydown"
      >
        <div class="dlg-scrim" @click="close" />
        <div
          ref="panel"
          role="dialog"
          aria-modal="true"
          :aria-label="label"
          :aria-labelledby="labelledby"
          tabindex="-1"
          class="dlg-panel"
          :class="placement === 'bottom' ? 'dlg-sheet' : placement === 'top' ? 'dlg-modal dlg-top' : 'dlg-modal'"
        >
          <div v-if="placement === 'bottom'" class="dlg-handle" aria-hidden="true" />
          <slot :close="close" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dlg-root {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
}
.dlg-scrim {
  position: absolute;
  inset: 0;
  background: rgba(8, 12, 20, 0.45);
}
.dlg-panel {
  position: relative;
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: var(--shadow-lg);
  outline: none;
  max-height: 90dvh;
  overflow: auto;
}
.dlg-sheet {
  width: 100%;
  border-top-left-radius: var(--radius-xl);
  border-top-right-radius: var(--radius-xl);
  padding: 0.5rem 1.25rem calc(1.25rem + env(safe-area-inset-bottom));
}
.dlg-modal {
  width: 100%;
  max-width: 28rem;
  border-radius: var(--radius-lg);
  padding: 1.5rem;
}
.dlg-top-root {
  padding: calc(env(safe-area-inset-top) + 0.75rem) 1rem 0.75rem;
}
@media (min-width: 640px) {
  .dlg-top-root {
    padding-top: 12vh;
  }
}
/* Fill at most the visible area (the root tracks the visual viewport), so a
 * long list scrolls inside the panel instead of under the keyboard. */
.dlg-top {
  max-height: 100%;
}
.dlg-handle {
  width: 2.25rem;
  height: 0.25rem;
  border-radius: var(--radius-full);
  background: var(--color-border);
  margin: 0.25rem auto 0.75rem;
}

/* Transitions */
.sheet-enter-active,
.sheet-leave-active,
.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--duration-base) var(--ease-standard);
}
.sheet-enter-active .dlg-panel,
.sheet-leave-active .dlg-panel {
  transition: transform var(--duration-base) var(--ease-emphasized);
}
.modal-enter-active .dlg-panel,
.modal-leave-active .dlg-panel {
  transition: transform var(--duration-base) var(--ease-emphasized);
}
.sheet-enter-from,
.sheet-leave-to,
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.sheet-enter-from .dlg-panel,
.sheet-leave-to .dlg-panel {
  transform: translateY(100%);
}
.modal-enter-from .dlg-panel,
.modal-leave-to .dlg-panel {
  transform: scale(0.96);
}
@media (prefers-reduced-motion: reduce) {
  .sheet-enter-active .dlg-panel,
  .sheet-leave-active .dlg-panel,
  .modal-enter-active .dlg-panel,
  .modal-leave-active .dlg-panel {
    transition: none;
  }
}
</style>
