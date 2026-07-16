<script setup lang="ts">
// On/off switch (role=switch). Used for tajweed on/off, word-by-word on/off, etc.
const model = defineModel<boolean>({ default: false })
const props = defineProps<{ label?: string; disabled?: boolean }>()

function toggle() {
  if (props.disabled) return
  model.value = !model.value
}
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="model"
    :aria-label="label"
    :disabled="disabled"
    class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-50"
    :class="model ? 'bg-accent' : 'bg-border'"
    @click="toggle"
  >
    <span
      class="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
      :class="model ? 'translate-x-[22px]' : 'translate-x-0.5'"
    />
  </button>
</template>
