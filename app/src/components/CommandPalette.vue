<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Dialog from './Dialog.vue'
import { parseJump, type Jump } from '@/core/navigation/parseJump'

// Quick-jump palette: type "2:255", "page 50", "juz 5", or a surah name.
// Emits the chosen target; the reader performs the actual navigation.
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ select: [Jump] }>()
const props = withDefaults(defineProps<{ shortcut?: boolean }>(), { shortcut: true })

const query = ref('')
const activeIndex = ref(0)
const results = computed(() => parseJump(query.value))

watch(results, () => (activeIndex.value = 0))
watch(open, (o) => {
  if (o) {
    query.value = ''
    activeIndex.value = 0
  }
})

function labelFor(r: Jump): string {
  switch (r.type) {
    case 'ayah':
      return `Ayah ${r.surah}:${r.ayah}`
    case 'page':
      return `Page ${r.page}`
    case 'juz':
      return `Juz ${r.juz}`
    case 'surah':
      return `Surah ${r.surah}`
    case 'name':
      return `Search “${r.query}”`
  }
}

function move(delta: number) {
  const n = results.value.length
  if (!n) return
  activeIndex.value = (activeIndex.value + delta + n) % n
}
function choose(i = activeIndex.value) {
  const r = results.value[i]
  if (!r) return
  emit('select', r)
  open.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    move(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    move(-1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    choose()
  }
}

function onGlobalKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    open.value = true
  }
}
onMounted(() => {
  if (props.shortcut) document.addEventListener('keydown', onGlobalKey)
})
onBeforeUnmount(() => document.removeEventListener('keydown', onGlobalKey))
</script>

<template>
  <Dialog v-model:open="open" placement="center" label="Quick jump">
    <div class="grid gap-3" @keydown="onKey">
      <input
        v-model="query"
        type="text"
        class="palette-input"
        placeholder="Go to 2:255, page 50, juz 5…"
        aria-label="Quick jump"
        autocomplete="off"
        spellcheck="false"
      />
      <ul v-if="results.length" class="grid gap-0.5" role="listbox" aria-label="Results">
        <li
          v-for="(r, i) in results"
          :key="i"
          role="option"
          :aria-selected="i === activeIndex"
          class="palette-item"
          :class="{ 'palette-item-active': i === activeIndex }"
          @click="choose(i)"
          @mousemove="activeIndex = i"
        >
          {{ labelFor(r) }}
        </li>
      </ul>
      <p v-else-if="query" class="px-1 py-2 text-sm text-text-muted">
        No match — try <b>2:255</b>, <b>page 50</b>, or <b>juz 5</b>.
      </p>
    </div>
  </Dialog>
</template>

<style scoped>
.palette-input {
  width: 100%;
  height: 2.75rem;
  padding: 0 0.875rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-elevated);
  color: var(--color-text);
  font-size: var(--text-base);
  outline: none;
}
.palette-input:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}
.palette-item {
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  cursor: pointer;
}
.palette-item-active {
  background: var(--color-elevated);
  color: var(--color-accent);
}
</style>
