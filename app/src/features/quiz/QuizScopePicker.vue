<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getDataClient } from '@/core/data'
import type { SurahNames } from '@/core/data/types'

/** Multi-select juz (1–30) or surah (1–114) for the quiz scope. */
const props = defineProps<{ kind: 'surah' | 'juz' }>()
const surahs = defineModel<number[] | undefined>('surahs')
const juz = defineModel<number[] | undefined>('juz')

const names = ref<SurahNames>({})
onMounted(async () => {
  if (props.kind === 'surah') {
    try {
      const data = getDataClient()
      await data.init()
      names.value = await data.getSurahNames()
    } catch {
      /* names are a nicety; numbers still work */
    }
  }
})

function toggleJuz(n: number): void {
  const list = juz.value ?? []
  juz.value = list.includes(n) ? list.filter((x) => x !== n) : [...list, n]
}
function toggleSurah(n: number): void {
  const list = surahs.value ?? []
  surahs.value = list.includes(n) ? list.filter((x) => x !== n) : [...list, n]
}

const juzNumbers = Array.from({ length: 30 }, (_, i) => i + 1)
const surahNumbers = Array.from({ length: 114 }, (_, i) => i + 1)
</script>

<template>
  <div v-if="kind === 'juz'" class="grid grid-juz" role="group" aria-label="Choose juz">
    <button
      v-for="n in juzNumbers"
      :key="n"
      type="button"
      class="cell"
      :class="{ 'cell-on': (juz ?? []).includes(n) }"
      :aria-pressed="(juz ?? []).includes(n)"
      :aria-label="`Juz ${n}`"
      @click="toggleJuz(n)"
    >
      {{ n }}
    </button>
  </div>

  <div v-else class="surah-list" role="group" aria-label="Choose surahs">
    <button
      v-for="n in surahNumbers"
      :key="n"
      type="button"
      class="surah"
      :class="{ 'surah-on': (surahs ?? []).includes(n) }"
      :aria-pressed="(surahs ?? []).includes(n)"
      :aria-label="`Surah ${n}${names[String(n)] ? ' ' + names[String(n)] : ''}`"
      @click="toggleSurah(n)"
    >
      <span class="surah-n">{{ n }}</span>
      <span class="surah-name" dir="rtl" lang="ar">{{ names[String(n)] ?? '' }}</span>
    </button>
  </div>
</template>

<style scoped>
.grid-juz {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 0.4rem;
}
.cell {
  min-height: 2.75rem;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.cell-on {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: var(--color-accent-contrast);
}
.cell:focus-visible,
.surah:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.surah-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
  gap: 0.4rem;
  max-height: 15rem;
  overflow-y: auto;
  padding: 0.25rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.surah {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.75rem;
  padding: 0.4rem 0.6rem;
  border: 1.5px solid transparent;
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
}
.surah-on {
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 12%, var(--color-surface));
}
.surah-n {
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  min-width: 1.5rem;
}
.surah-name {
  font-size: var(--reading-size-sm);
  line-height: 1.4;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
