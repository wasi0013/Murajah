<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Dialog from './Dialog.vue'
import { parseJump, type Jump } from '@/core/navigation/parseJump'
import { SURAH_NAMES, findSurahByName } from '@/core/navigation/surahNames'
import type { RecentPage } from '@/composables/useReadingTrail'
import { useI18n } from '@/core/i18n'

// Quick-jump palette: type "2:255", "page 50", "juz 5", or a surah name.
// Emits the chosen target; the reader performs the actual navigation.
// With nothing typed yet, it lists the reading trail's recent spots instead, so
// "where was I before that jump?" is answered where the reader already goes to
// navigate — no extra control on the reading screen.
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ select: [Jump] }>()
const props = withDefaults(defineProps<{ shortcut?: boolean; recent?: RecentPage[] }>(), {
  shortcut: true,
  recent: () => [],
})

const { t } = useI18n()

const query = ref('')
const activeIndex = ref(0)
const results = computed(() => parseJump(query.value))
const showingRecent = computed(() => !query.value.trim() && props.recent.length > 0)
/** What the arrow keys / Enter walk: the parsed results, or the recent spots. */
const items = computed<Jump[]>(() =>
  showingRecent.value ? props.recent.map((r) => ({ type: 'page' as const, page: r.page })) : results.value,
)

watch(items, () => (activeIndex.value = 0))
watch(open, (o) => {
  if (o) {
    query.value = ''
    activeIndex.value = 0
  }
})

/** English transliteration for `n` (1–114) — the palette's own reference data, no fetch. */
function surahName(n: number): string | undefined {
  return SURAH_NAMES[n - 1]
}

function labelFor(r: Jump): string {
  switch (r.type) {
    case 'ayah':
      return t('palette.ayah', { surah: r.surah, ayah: r.ayah })
    case 'page':
      return t('common.page', { n: r.page })
    case 'juz':
      return t('common.juz', { n: r.juz })
    case 'surah':
      return t('palette.surah', { n: r.surah, name: surahName(r.surah) ?? '' })
    case 'name': {
      // A name query already resolves to a surah synchronously (a tiny static
      // 114-entry table, no I/O) — show the same "Surah N — Name" confirmation
      // as an explicit surah jump, so the user can see what they're about to open.
      const surah = findSurahByName(r.query)
      if (surah !== undefined) return t('palette.surah', { n: surah, name: surahName(surah) ?? '' })
      return t('palette.search', { query: r.query })
    }
  }
}

function move(delta: number) {
  const n = items.value.length
  if (!n) return
  activeIndex.value = (activeIndex.value + delta + n) % n
}
function choose(i = activeIndex.value) {
  const r = items.value[i]
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
  <Dialog v-model:open="open" placement="center" :label="t('palette.title')">
    <div class="grid gap-3" @keydown="onKey">
      <input
        v-model="query"
        type="text"
        class="palette-input"
        :placeholder="t('palette.placeholder')"
        :aria-label="t('palette.title')"
        autocomplete="off"
        spellcheck="false"
      />
      <template v-if="showingRecent">
        <p id="palette-recent-heading" class="palette-heading">{{ t('palette.recent') }}</p>
        <ul class="grid gap-0.5" role="listbox" aria-labelledby="palette-recent-heading">
          <li
            v-for="(r, i) in recent"
            :key="r.page"
            role="option"
            :aria-selected="i === activeIndex"
            class="palette-item palette-recent"
            :class="{ 'palette-item-active': i === activeIndex }"
            @click="choose(i)"
            @mousemove="activeIndex = i"
          >
            <span>{{ r.label }}</span>
            <span v-if="r.meta" class="palette-meta">{{ r.meta }}</span>
          </li>
        </ul>
      </template>
      <ul v-else-if="results.length" class="grid gap-0.5" role="listbox" :aria-label="t('palette.resultsAria')">
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
        {{ t('palette.noMatch') }}
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
.palette-heading {
  padding: 0 0.25rem;
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.palette-recent {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}
.palette-meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.palette-item-active {
  background: var(--color-elevated);
  color: var(--color-accent);
}
</style>
