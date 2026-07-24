<script setup lang="ts">
import { nextTick, ref } from 'vue'

// Single-select segmented control (radiogroup semantics). Used for the reader's
// layout switch (QPC / Indopak) and similar either/or choices.
interface Option {
  value: string
  label: string
}

const model = defineModel<string>({ required: true })
const props = defineProps<{ options: Option[]; label?: string }>()
// `update:modelValue` (driving `model`) is a plain ref write — Vue skips it when
// the value doesn't change, e.g. re-picking the option that's already active. A
// caller that needs to know about *every* pick (not just ones that change the
// value) — Today's player re-triggering playback on a re-tap — listens to this
// instead.
const emit = defineEmits<{ select: [value: string] }>()

const group = ref<HTMLElement>()

function select(value: string) {
  model.value = value
  emit('select', value)
}

function onKey(e: KeyboardEvent, index: number) {
  const n = props.options.length
  let next: number
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % n
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + n) % n
  else return
  e.preventDefault()
  select(props.options[next].value)
  nextTick(() => {
    group.value?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
  })
}
</script>

<template>
  <div
    ref="group"
    role="radiogroup"
    :aria-label="label"
    class="inline-flex gap-0.5 rounded-md border border-border bg-surface p-0.5"
  >
    <button
      v-for="(o, i) in options"
      :key="o.value"
      type="button"
      role="radio"
      :aria-checked="model === o.value"
      :tabindex="model === o.value ? 0 : -1"
      class="h-8 rounded-sm px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      :class="
        model === o.value ? 'bg-accent text-accent-contrast' : 'text-text-muted hover:text-text'
      "
      @click="select(o.value)"
      @keydown="onKey($event, i)"
    >
      {{ o.label }}
    </button>
  </div>
</template>
