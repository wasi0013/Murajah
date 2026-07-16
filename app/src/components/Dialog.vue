<script setup lang="ts">
import { ref } from 'vue'
import { useFocusTrap } from '@/composables/useFocusTrap'
import { useScrollLock } from '@/composables/useScrollLock'

// Accessible overlay: teleported, scrim + escape close, scroll lock, focus trap,
// role=dialog/aria-modal. `placement="bottom"` = mobile sheet, `center` = modal.
type Placement = 'bottom' | 'center'

const open = defineModel<boolean>('open', { default: false })
withDefaults(
  defineProps<{ placement?: Placement; label?: string; labelledby?: string }>(),
  { placement: 'center' },
)

const panel = ref<HTMLElement>()
useFocusTrap(panel, open)
useScrollLock(open)

function close() {
  open.value = false
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}
</script>

<template>
  <Teleport to="body">
    <Transition :name="placement === 'bottom' ? 'sheet' : 'modal'">
      <div
        v-if="open"
        class="dlg-root"
        :class="placement === 'bottom' ? 'items-end' : 'items-center justify-center p-4'"
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
          :class="placement === 'bottom' ? 'dlg-sheet' : 'dlg-modal'"
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
