<script setup lang="ts">
import { useToasts, dismissToast, type ToastVariant } from '@/composables/useToast'

// Mount once (in App.vue). Renders the toast stack in a polite live region.
const toasts = useToasts()
const variantClass: Record<ToastVariant, string> = {
  info: 'bg-elevated text-text border border-border',
  success: 'bg-success text-on-status',
  error: 'bg-danger text-on-status',
}
</script>

<template>
  <Teleport to="body">
    <div class="toast-region" role="region" aria-label="Notifications">
      <TransitionGroup name="toast">
        <button
          v-for="t in toasts"
          :key="t.id"
          type="button"
          class="toast"
          :class="variantClass[t.variant]"
          role="status"
          aria-live="polite"
          @click="
            () => {
              t.onAction?.()
              dismissToast(t.id)
            }
          "
        >
          {{ t.message }}
        </button>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-region {
  position: fixed;
  inset-inline: 0;
  bottom: calc(1rem + env(safe-area-inset-bottom));
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  max-width: min(92vw, 28rem);
  padding: 0.625rem 1rem;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  font-size: var(--text-sm);
  text-align: start;
  cursor: pointer;
}
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity var(--duration-base) var(--ease-standard),
    transform var(--duration-base) var(--ease-standard);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(0.75rem);
}
@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active {
    transition: opacity var(--duration-base) var(--ease-standard);
  }
  .toast-enter-from,
  .toast-leave-to {
    transform: none;
  }
}
</style>
