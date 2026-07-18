<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, BookOpen, Minus, Plus } from 'lucide-vue-next'
import { useMemorization } from '@/composables/useMemorization'
import { useProgressPersistence } from '@/composables/useProgressPersistence'
import { useMistakesPersistence } from '@/composables/useMistakesPersistence'
import { usePlanPersistence } from '@/composables/usePlanPersistence'
import { usePlanStore } from '@/stores/plan'
import { TOTAL_PAGES } from '@/stores/progress'
import { readerLink } from '@/core/navigation/readerLinks'
import { estimateCompletion } from '@/core/memorization/completion'
import Icon from '@/components/Icon.vue'
import Toggle from '@/components/Toggle.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import SegmentedControl from '@/components/SegmentedControl.vue'
import MemorizedGrid from './MemorizedGrid.vue'
import JuzProgressGrid from './JuzProgressGrid.vue'
import PageDotsGrid from './PageDotsGrid.vue'

/**
 * Memorization progress. Three lenses (9.2): **Overview** — summary stats, bulk
 * range-mark, the 604-page grid, weakest-page suggestions; **Juz** — per-juz
 * progress + a completion estimate; **Pages** — the per-page revision heatmap.
 * Tapping a page opens a sheet to toggle memorized, adjust its strength (a clean
 * revision awards hasanah), or open it in the reader. Canonical 604 scheme.
 */
const router = useRouter()
const { progress, stats, weakestPages, juzGroups } = useMemorization()
const plan = usePlanStore()
const persistence = useProgressPersistence(progress)
const mistakesPersistence = useMistakesPersistence()
const planPersistence = usePlanPersistence()

const tab = ref<'overview' | 'juz' | 'pages'>('overview')
const tabOptions = [
  { value: 'overview', label: 'Overview' },
  { value: 'juz', label: 'Juz' },
  { value: 'pages', label: 'Pages' },
]

// Completion estimate uses the plan's new-memorization pace, and only when a new
// front is active — otherwise there's no honest projection (decision 5).
const completion = computed(() => {
  const pace = plan.newFront ? (plan.pace?.newPagesPerDay ?? 0) : 0
  return estimateCompletion(stats.value.remaining, pace)
})
const completionDateLabel = computed(() => {
  const d = completion.value.completionDate
  return d
    ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '—'
})

onMounted(() => {
  void persistence.hydrate()
  void mistakesPersistence.hydrate() // load mistake marks — the reader isn't mounted here
  void planPersistence.hydrate() // the plan's pace feeds the completion estimate
})
onBeforeUnmount(() => {
  persistence.dispose()
  mistakesPersistence.dispose()
  planPersistence.dispose()
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
  void router.push(readerLink({ page }))
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

    <div class="tabs">
      <SegmentedControl v-model="tab" :options="tabOptions" label="Progress view" />
    </div>

    <template v-if="tab === 'overview'">
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
    </template>

    <section v-else-if="tab === 'juz'" class="panel" aria-label="Juz progress">
      <p v-if="!juzGroups.length" class="loading-hint">Loading…</p>
      <template v-else>
        <JuzProgressGrid :groups="juzGroups" :memorized="progress.memorized" @select="openInReader" />

        <div class="estimate" aria-label="Completion estimate">
          <h2 class="section-title">Completion estimate</h2>
          <template v-if="completion.complete">
            <p class="estimate-done">All {{ stats.totalPages }} pages memorized — may Allah accept it. 🎉</p>
          </template>
          <template v-else-if="completion.daysRemaining !== null">
            <div class="estimate-cards">
              <div class="est-card">
                <span class="est-label">Estimated completion</span>
                <span class="est-value">{{ completionDateLabel }}</span>
              </div>
              <div class="est-card">
                <span class="est-label">Days remaining</span>
                <span class="est-value">{{ completion.daysRemaining }}</span>
              </div>
            </div>
            <p class="estimate-note">
              At {{ completion.pace }} new page{{ completion.pace === 1 ? '' : 's' }} a day, you'll
              finish memorizing in about {{ completion.daysRemaining }} days.
            </p>
          </template>
          <p v-else class="estimate-note">
            Set a daily new-page goal in your plan to see an estimated completion date.
          </p>
        </div>
      </template>
    </section>

    <section v-else class="panel" aria-label="Page by page">
      <p v-if="!juzGroups.length" class="loading-hint">Loading…</p>
      <template v-else>
        <p class="panel-lead">Each dot is a page; greener dots have more clean revisions.</p>
        <PageDotsGrid :groups="juzGroups" :strength="progress.strength" @select="openInReader" />
      </template>
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
.tabs {
  display: flex;
  justify-content: center;
  max-width: 46rem;
  margin: 0.85rem auto 0;
  padding: 0 1rem;
}
.panel {
  max-width: 46rem;
  margin: 1.25rem auto 0;
  padding: 0 1rem;
}
.panel-lead {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin-bottom: 0.85rem;
}
.loading-hint {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  text-align: center;
  padding: 1.5rem 0;
}
.estimate {
  margin-top: 1.5rem;
}
.estimate-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: 0.75rem;
}
.est-card {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.85rem 1rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}
.est-label {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.est-value {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-accent);
  font-variant-numeric: tabular-nums;
}
.estimate-note {
  margin-top: 0.75rem;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.estimate-done {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-success);
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
