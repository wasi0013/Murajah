<script setup lang="ts">
import { BookOpen } from 'lucide-vue-next'
import Icon from '@/components/Icon.vue'

/**
 * Shown when the reader feature flag is off (see core/flags). Keeps the route
 * navigable without exposing the reader during a staged rollout.
 */
</script>

<template>
  <main class="disabled">
    <Icon :icon="BookOpen" :size="32" class="icon" />
    <h1>Reader not available</h1>
    <p>The new reading experience isn’t enabled on this device yet.</p>
  </main>
</template>

<style scoped>
.disabled {
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 0.75rem;
  min-height: 100dvh;
  padding: 2rem;
  text-align: center;
  background: var(--color-bg);
  color: var(--color-text);
}
.icon {
  color: var(--color-accent);
}
h1 {
  font-size: var(--text-xl);
  font-weight: 600;
}
p {
  color: var(--color-text-muted);
  max-width: 28rem;
}
</style>
