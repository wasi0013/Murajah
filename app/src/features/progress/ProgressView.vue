<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, BookOpen, Minus, Plus } from 'lucide-vue-next'
import { useMemorization } from '@/composables/useMemorization'
import { useProgressPersistence } from '@/composables/useProgressPersistence'
import { useMistakesPersistence } from '@/composables/useMistakesPersistence'
import { TOTAL_PAGES } from '@/stores/progress'
import Icon from '@/components/Icon.vue'
import Toggle from '@/components/Toggle.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import MemorizedGrid from './MemorizedGrid.vue'

/**
 * Memorization progress: summary stats, a bulk range-mark, the 604-page grid,
 * and the weakest-page suggestions. Tapping a page opens a sheet to toggle
 * memorized, adjust its strength (a clean revision awards hasanah), or open it in
 * the reader. Canonical 604 scheme; its own progress hydrate/persist.
 */
const router = useRouter()
const { progress, stats, weakestPages } = useMemorization()
const persistence = useProgressPersistence(progress)
const mistakesPersistence = useMistakesPersistence()

onMounted(() => {
  void persistence.hydrate()
  void mistakesPersistence.hydrate() // load mistake marks — the reader isn't mounted here
})
onBeforeUnmount(() => {
  persistence.dispose()
  mistakesPersistence.dispose()
})

// —— Per-page sheet ————————————————————————————————
const selectedPage = ref<number | null>(null)
const sheetOpen = computed({
  get: () => selectedPage.value !== null,
  set: (v) => {
    if (!v) selectedPage.value = null
  },
})
function openPage(page: number) {
  selectedPage.value = page
}
function openInReader(page: number) {
  void router.push({ name: 'reader', params: { layout: 'qpc', page: String(page) } })
}

// —— Bulk range mark ————————————————————————————————
const rangeStart = ref(1)
const rangeEnd = ref(1)
function bulkMark(on: boolean) {
  const a = Math.max(1, Math.min(rangeStart.value, TOTAL_PAGES))
  const b = Math.max(a, Math.min(rangeEnd.value, TOTAL_PAGES))
  for (let p = a; p <= b; p++) progress.setMemorized(p, on)
}

const hasanahFmt = computed(() => stats.value.totalHasanah.toLocaleString('en-US'))
</script>

<template>
  <main class="progress">
    <header class="topbar">
      <button class="icon-btn" aria-label="Back to reader" @click="router.push('/')">
        <Icon :icon="ArrowLeft" :size="20" />
      </button>
      <h1 class="title">Memorization</h1>
    </header>

    <section class="stats" aria-label="Summary">
      <div class="stat">
        <span class="stat-n">{{ stats.memorizedCount }}<span class="stat-of">/{{ stats.totalPages }}</span></span>
        <span class="stat-l">Pages · {{ stats.percent }}%</span>
      </div>
      <div class="stat">
        <span class="stat-n">{{ hasanahFmt }}</span>
        <span class="stat-l">Hasanah</span>
      </div>
      <div class="stat">
        <span class="stat-n">{{ stats.mistakePages }}</span>
        <span class="stat-l">Pages with mistakes</span>
      </div>
      <div class="stat">
        <span class="stat-n">{{ stats.averageStrength }}</span>
        <span class="stat-l">Avg. strength</span>
      </div>
    </section>

    <section class="bulk" aria-label="Bulk mark pages">
      <span class="bulk-label">Mark pages</span>
      <input v-model.number="rangeStart" type="number" min="1" :max="TOTAL_PAGES" aria-label="From page" class="num" />
      <span aria-hidden="true">–</span>
      <input v-model.number="rangeEnd" type="number" min="1" :max="TOTAL_PAGES" aria-label="To page" class="num" />
      <button class="btn" @click="bulkMark(true)">Memorized</button>
      <button class="btn btn-ghost" @click="bulkMark(false)">Clear</button>
    </section>

    <MemorizedGrid @select="openPage" />

    <section v-if="weakestPages.length" class="weakest" aria-label="Weakest pages">
      <h2 class="section-title">Needs review</h2>
      <div class="chips">
        <button v-for="p in weakestPages" :key="p" class="chip" @click="openPage(p)">
          Page {{ p }}
        </button>
      </div>
    </section>

    <BottomSheet v-model:open="sheetOpen" :label="selectedPage ? `Page ${selectedPage}` : 'Page'">
      <div v-if="selectedPage" class="sheet">
        <h2 class="sheet-title">Page {{ selectedPage }}</h2>

        <div class="row">
          <span>Memorized</span>
          <Toggle
            :model-value="progress.isMemorized(selectedPage)"
            label="Memorized"
            @update:model-value="progress.toggleMemorized(selectedPage)"
          />
        </div>

        <div class="row">
          <span>Memorization strength</span>
          <div class="stepper">
            <button
              class="step"
              aria-label="Decrease strength"
              @click="progress.bumpStrength(selectedPage, -1)"
            >
              <Icon :icon="Minus" :size="16" />
            </button>
            <span class="step-val">{{ progress.strengthOf(selectedPage) }}</span>
            <button
              class="step"
              aria-label="Record a clean revision"
              @click="progress.recordPerfectRevision(selectedPage)"
            >
              <Icon :icon="Plus" :size="16" />
            </button>
          </div>
        </div>
        <p class="hint">“+” records a clean recitation from memory (awards hasanah).</p>

        <button class="open-reader" @click="openInReader(selectedPage)">
          <Icon :icon="BookOpen" :size="16" />
          <span>Open in reader</span>
        </button>
      </div>
    </BottomSheet>
  </main>
</template>

<style scoped>
.progress {
  min-height: 100dvh;
  background: var(--color-bg);
  color: var(--color-text);
  padding-bottom: 3rem;
}
.topbar {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: calc(0.6rem + env(safe-area-inset-top)) 1rem 0.6rem;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}
.title {
  font-size: var(--text-lg);
  font-weight: 600;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 2.25rem;
  width: 2.25rem;
  border-radius: var(--radius-md);
  color: var(--color-text);
}
.icon-btn:hover {
  background: var(--color-elevated);
}
.icon-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
  gap: 0.75rem;
  max-width: 46rem;
  margin: 1rem auto 0;
  padding: 0 1rem;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.85rem 1rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}
.stat-n {
  font-size: var(--text-xl);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--color-accent);
}
.stat-of {
  font-size: var(--text-base);
  color: var(--color-text-muted);
  font-weight: 500;
}
.stat-l {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.bulk {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  max-width: 46rem;
  margin: 1rem auto 0;
  padding: 0 1rem;
}
.bulk-label {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.num {
  width: 4.5rem;
  height: 2.25rem;
  padding: 0 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}
.num:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}
.btn {
  height: 2.25rem;
  padding: 0 0.9rem;
  border-radius: var(--radius-md);
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-size: var(--text-sm);
  font-weight: 500;
}
.btn-ghost {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}
.btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.weakest,
:deep(.grid-root) {
  max-width: 46rem;
  margin: 1.5rem auto 0;
  padding: 0 1rem;
}
.section-title {
  font-size: var(--text-sm);
  font-weight: 600;
  margin-bottom: 0.6rem;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.chip {
  padding: 0.35rem 0.7rem;
  border-radius: var(--radius-full);
  background: color-mix(in oklab, var(--color-danger) 12%, transparent);
  color: var(--color-danger);
  font-size: var(--text-xs);
  font-weight: 600;
}
.chip:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.sheet {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-bottom: 0.5rem;
}
.sheet-title {
  font-size: var(--text-base);
  font-weight: 600;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.stepper {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 2.25rem;
  width: 2.25rem;
  border-radius: var(--radius-md);
  background: var(--color-elevated);
  color: var(--color-text);
}
.step:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.step-val {
  min-width: 1.5rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  margin-top: -0.5rem;
}
.open-reader {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 2.5rem;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  font-size: var(--text-sm);
  font-weight: 500;
}
.open-reader:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
