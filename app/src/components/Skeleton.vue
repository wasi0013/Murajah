<script setup lang="ts">
// Loading placeholder. Decorative (aria-hidden); the region it fills should
// carry its own aria-busy/label.
type Rounded = 'sm' | 'md' | 'lg' | 'full'
withDefaults(defineProps<{ width?: string; height?: string; rounded?: Rounded }>(), {
  height: '1rem',
  rounded: 'md',
})
// Static map so Tailwind's scanner sees the literal class names.
const roundedClass: Record<Rounded, string> = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
}
</script>

<template>
  <span class="skeleton block" :class="roundedClass[rounded]" :style="{ width, height }" aria-hidden="true" />
</template>

<style scoped>
.skeleton {
  position: relative;
  overflow: hidden;
  background: var(--color-elevated);
}
.skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in oklab, var(--color-border) 70%, transparent),
    transparent
  );
  animation: shimmer 1.4s ease-in-out infinite;
}
@keyframes shimmer {
  to {
    transform: translateX(100%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton::after {
    animation: none;
  }
}
</style>
