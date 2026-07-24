<script setup lang="ts">
import { computed, type Component } from 'vue'

/**
 * Thin wrapper over lucide-vue-next icons: consistent sizing, `currentColor`
 * (inherits text color → token-driven), and a11y. Pass `label` for a meaningful
 * icon (exposed as an image with a name); omit it for decorative icons (hidden
 * from assistive tech). Tree-shaking is preserved — callers import the specific
 * lucide icon and pass it in.
 */
const props = withDefaults(
  defineProps<{
    icon: Component
    /** px size for width + height */
    size?: number
    /** accessible name; when set the icon is announced, else it's decorative */
    label?: string
    /** stroke width passed to lucide */
    stroke?: number
  }>(),
  { size: 20, stroke: 2 },
)

const a11y = computed(() =>
  props.label
    ? { 'aria-label': props.label, role: 'img' }
    : { 'aria-hidden': 'true', focusable: 'false' },
)
</script>

<template>
  <component
    :is="icon"
    :size="size"
    :stroke-width="stroke"
    v-bind="a11y"
    class="inline-block shrink-0 align-middle"
  />
</template>
