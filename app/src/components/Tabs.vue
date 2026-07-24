<script setup lang="ts">
import { nextTick, ref } from 'vue'

// Accessible tabs (tablist/tab/tabpanel). Panel content comes from the default
// slot, which receives the active value.
interface Tab {
  value: string
  label: string
}

const model = defineModel<string>({ required: true })
const props = defineProps<{ tabs: Tab[]; label?: string }>()
const list = ref<HTMLElement>()

function onKey(e: KeyboardEvent, index: number) {
  const n = props.tabs.length
  let next: number
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % n
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + n) % n
  else return
  e.preventDefault()
  model.value = props.tabs[next].value
  nextTick(() => list.value?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus())
}
</script>

<template>
  <div>
    <div ref="list" role="tablist" :aria-label="label" class="flex gap-1 border-b border-border">
      <button
        v-for="(t, i) in tabs"
        :key="t.value"
        :id="`tab-${t.value}`"
        type="button"
        role="tab"
        :aria-selected="model === t.value"
        :aria-controls="`panel-${t.value}`"
        :tabindex="model === t.value ? 0 : -1"
        class="-mb-px h-9 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        :class="
          model === t.value
            ? 'border-accent text-text'
            : 'border-transparent text-text-muted hover:text-text'
        "
        @click="model = t.value"
        @keydown="onKey($event, i)"
      >
        {{ t.label }}
      </button>
    </div>
    <div
      :id="`panel-${model}`"
      role="tabpanel"
      :aria-labelledby="`tab-${model}`"
      tabindex="0"
      class="pt-4 focus-visible:outline-none"
    >
      <slot :active="model" />
    </div>
  </div>
</template>
