<script setup lang="ts">
// Native range input styled with the theme accent — keyboard + screen-reader
// accessible out of the box. Used for the reader's text-size control.
const model = defineModel<number>({ default: 0 })
withDefaults(defineProps<{ min?: number; max?: number; step?: number; label?: string }>(), {
  min: 0,
  max: 100,
  step: 1,
})
</script>

<template>
  <input
    type="range"
    :min="min"
    :max="max"
    :step="step"
    :aria-label="label"
    :value="model"
    class="murajah-slider w-full"
    @input="model = Number(($event.target as HTMLInputElement).value)"
  />
</template>

<style scoped>
.murajah-slider {
  accent-color: var(--color-accent);
  height: 1.5rem;
  cursor: pointer;
}
.murajah-slider:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 4px;
  border-radius: var(--radius-sm);
}
</style>
