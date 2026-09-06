<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ListChecks } from 'lucide-vue-next'
import { useMemorization } from '@/composables/useMemorization'
import { useProgressPersistence } from '@/composables/useProgressPersistence'
import { useMistakesPersistence } from '@/composables/useMistakesPersistence'
import { usePlanPersistence } from '@/composables/usePlanPersistence'
import { usePlanStore } from '@/stores/plan'
import { TOTAL_PAGES } from '@/stores/progress'
import { readerLink } from '@/core/navigation/readerLinks'
import { estimateCompletion } from '@/core/memorization/completion'
import { useI18n } from '@/core/i18n'
import Icon from '@/components/Icon.vue'
import SegmentedControl from '@/components/SegmentedControl.vue'
import StatsSummary from './StatsSummary.vue'
import MemorizedGrid from './MemorizedGrid.vue'
import JuzProgressGrid from './JuzProgressGrid.vue'
import PageDotsGrid from './PageDotsGrid.vue'
import MarkMemorizedModal from './MarkMemorizedModal.vue'
import PageRevisionSheet from './PageRevisionSheet.vue'
import JournalPanel from './JournalPanel.vue'

/**
 * Memorization progress. Four lenses: **Overview** — summary stats, bulk
 * range-mark, the 604-page grid, the recently-memorized list; **Juz** — per-juz
 * progress + a completion estimate; **Pages** — the per-page revision heatmap;
 * **Journal** (Phase 12) — the daily practice calendar + reflection notes,
 * reached directly via `/progress?tab=journal` from Today's repointed streak
 * button. Tapping a page opens a sheet to toggle memorized, adjust its
 * strength (a clean revision awards hasanah), or open it in the reader.
 * Canonical 604 scheme.
 */
const router = useRouter()
const route = useRoute()
const { progress, stats, recentlyMemorized, juzGroups } = useMemorization()
const plan = usePlanStore()
const persistence = useProgressPersistence(progress)
const mistakesPersistence = useMistakesPersistence()
const planPersistence = usePlanPersistence()
const { t, locale } = useI18n()

type ProgressTab = 'overview' | 'juz' | 'pages' | 'journal'
const VALID_TABS: readonly ProgressTab[] = ['overview', 'juz', 'pages', 'journal']
// Deep-linkable so Today's streak button can land directly on Journal
// (`/progress?tab=journal`) instead of always opening on Overview.
const initialTab = VALID_TABS.includes(route.query.tab as ProgressTab) ? (route.query.tab as ProgressTab) : 'overview'
const tab = ref<ProgressTab>(initialTab)
// Vue Router reuses this component instance across navigations that stay on
// the same route record (only `query` differs), so `initialTab` above being
// read once at setup only works because every current caller of `?tab=`
// navigates in from a *different* route (a fresh instance). Watch the query
// too, so a future same-route `?tab=` push (e.g. an in-page action while
// already on /progress) isn't silently ignored — caught in review.
watch(
  () => route.query.tab,
  (value) => {
    if (VALID_TABS.includes(value as ProgressTab)) tab.value = value as ProgressTab
  },
)
const tabOptions = computed(() => [
  { value: 'overview', label: t('progress.tabs.overview') },
  { value: 'juz', label: t('progress.tabs.juz') },
  { value: 'pages', label: t('progress.tabs.pages') },
  { value: 'journal', label: t('progress.tabs.journal') },
])

// Completion estimate uses the plan's new-memorization pace, and only when a new
// front is active — otherwise there's no honest projection (decision 5).
const completion = computed(() => {
  const pace = plan.newFront ? (plan.pace?.newPagesPerDay ?? 0) : 0
  return estimateCompletion(stats.value.remaining, pace)
})
const completionDateLabel = computed(() => {
  const d = completion.value.completionDate
  return d
    ? new Date(`${d}T00:00:00`).toLocaleDateString(locale.value, {
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

// —— Per-page sheet ———————————————————————————————— The full
// memorized/level/last-revised/revised-today editor lives in
// PageRevisionSheet.vue (shared with the reader's own brain button); this
// view only owns which page is selected and where a grid tap should land.
const selectedPage = ref<number | null>(null)
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
  const pages = Array.from({ length: b - a + 1 }, (_, i) => a + i)
  progress.bulkMarkMemorized(pages, on)
}

// A friendlier alternative to the manual range: pick whole surahs/juz instead.
const pickOpen = ref(false)
</script>

<template>
  <main class="progress">
    <header class="topbar">
      <button class="icon-btn" :aria-label="t('common.backToReader')" @click="router.push('/')">
        <Icon :icon="ArrowLeft" :size="20" />
      </button>
      <h1 class="title">{{ t('progress.title') }}</h1>
    </header>

    <div class="tabs">
      <SegmentedControl v-model="tab" :options="tabOptions" :label="t('progress.view')" />
    </div>

    <template v-if="tab === 'overview'">
    <StatsSummary :stats="stats" />

    <!-- Recently-memorized sits above the bulk-mark tool (swapped from its
         original position below MemorizedGrid): this is the section users
         check most, scrolling past everything else to reach it; bulk-mark is
         an occasional power-tool action, not something checked on every visit. -->
    <section v-if="recentlyMemorized.length" class="recent" :aria-label="t('progress.recentlyMemorizedAria')">
      <h2 class="section-title">{{ t('progress.recentlyMemorized') }}</h2>
      <div class="chips">
        <button v-for="p in recentlyMemorized" :key="p" class="chip" @click="openPage(p)">
          {{ t('common.page', { n: p }) }}
        </button>
      </div>
    </section>

    <MemorizedGrid @select="openPage" />

    <section class="bulk" :aria-label="t('progress.bulk.aria')">
      <span class="bulk-label">{{ t('progress.bulk.label') }}</span>
      <div class="range-pill">
        <input
          v-model.number="rangeStart"
          type="number"
          min="1"
          :max="TOTAL_PAGES"
          :aria-label="t('progress.bulk.from')"
          class="range-input"
        />
        <span class="range-dash" aria-hidden="true">–</span>
        <input
          v-model.number="rangeEnd"
          type="number"
          min="1"
          :max="TOTAL_PAGES"
          :aria-label="t('progress.bulk.to')"
          class="range-input"
        />
      </div>
      <div class="bulk-actions">
        <button class="btn" @click="bulkMark(true)">{{ t('progress.bulk.memorized') }}</button>
        <button class="btn btn-ghost" @click="bulkMark(false)">{{ t('progress.bulk.clear') }}</button>
      </div>
      <button class="pick-trigger" type="button" @click="pickOpen = true">
        <Icon :icon="ListChecks" :size="14" />
        <span>{{ t('progress.pick.button') }}</span>
      </button>
    </section>
    </template>

    <section v-else-if="tab === 'juz'" class="panel" :aria-label="t('progress.juzAria')">
      <p v-if="!juzGroups.length" class="loading-hint">{{ t('common.loading') }}</p>
      <template v-else>
        <JuzProgressGrid :groups="juzGroups" :memorized="progress.memorized" @select="openInReader" />

        <div class="estimate" :aria-label="t('progress.estimate.aria')">
          <h2 class="section-title">{{ t('progress.estimate.title') }}</h2>
          <template v-if="completion.complete">
            <p class="estimate-done">{{ t('progress.estimate.doneAll', { n: stats.totalPages }) }}</p>
          </template>
          <template v-else-if="completion.daysRemaining !== null">
            <div class="estimate-cards">
              <div class="est-card">
                <span class="est-label">{{ t('progress.estimate.date') }}</span>
                <span class="est-value">{{ completionDateLabel }}</span>
              </div>
              <div class="est-card">
                <span class="est-label">{{ t('progress.estimate.daysRemaining') }}</span>
                <span class="est-value">{{ completion.daysRemaining }}</span>
              </div>
            </div>
            <p class="estimate-note">
              {{
                t(completion.pace === 1 ? 'progress.estimate.noteOne' : 'progress.estimate.noteOther', {
                  pace: completion.pace,
                  days: completion.daysRemaining,
                })
              }}
            </p>
          </template>
          <p v-else class="estimate-note">{{ t('progress.estimate.hint') }}</p>
        </div>
      </template>
    </section>

    <section v-else-if="tab === 'pages'" class="panel" :aria-label="t('progress.pagesAria')">
      <p v-if="!juzGroups.length" class="loading-hint">{{ t('common.loading') }}</p>
      <template v-else>
        <p class="panel-lead">{{ t('progress.pagesLead') }}</p>
        <PageDotsGrid
          :groups="juzGroups"
          :memorized="progress.memorized"
          :strength="progress.strength"
          :review-data="progress.reviewData"
          @select="openInReader"
        />
      </template>
    </section>

    <section v-else class="panel" :aria-label="t('journal.title')">
      <JournalPanel />
    </section>

    <PageRevisionSheet v-model:page="selectedPage" />

    <MarkMemorizedModal v-model:open="pickOpen" />
  </main>
</template>

<style scoped>
.progress {
  min-height: 100%;
  background: var(--color-bg);
  color: var(--color-text);
  padding-bottom: 3rem;
}
@media (min-width: 1024px) {
  .progress {
    max-width: 42rem;
    margin-inline: auto;
  }
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
.bulk {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.65rem;
  max-width: 46rem;
  /* Follows MemorizedGrid now (swapped below needs-review) — same breathing
     room the grid gives whatever comes after it, shared with .grid-root
     below rather than the tighter 1rem this used when it sat right under
     .stats. */
  margin: 1.5rem auto 0;
  padding: 0.85rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}
.bulk-label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
}
.range-pill {
  display: flex;
  align-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  overflow: hidden;
}
.range-input {
  width: 4rem;
  height: 2.75rem;
  padding: 0 0.25rem;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
  text-align: center;
}
.range-input:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
.range-dash {
  color: var(--color-text-muted);
}
.bulk-actions {
  display: flex;
  gap: 0.5rem;
  width: 100%;
}
.btn {
  height: 2.5rem;
  flex: 1;
  padding: 0 0.9rem;
  border-radius: var(--radius-md);
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-size: var(--text-sm);
  font-weight: 500;
}
.btn-ghost {
  background: var(--color-bg);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}
.btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.pick-trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  height: 2.25rem;
  padding: 0 0.75rem;
  border-radius: var(--radius-full);
  background: color-mix(in oklab, var(--color-accent) 12%, transparent);
  color: var(--color-accent);
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
}
.pick-trigger:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.recent,
:deep(.grid-root) {
  max-width: 46rem;
  padding: 0 1rem;
}
.recent {
  /* Follows .stats now (swapped above the bulk-mark tool) — the tighter gap
     .bulk used to have in that position, not the 1.5rem breathing room a
     section needs after the dense MemorizedGrid. */
  margin: 1rem auto 0;
}
:deep(.grid-root) {
  margin: 1.5rem auto 0;
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
  background: color-mix(in oklab, var(--color-success) 12%, transparent);
  color: var(--color-success);
  font-size: var(--text-xs);
  font-weight: 600;
}
.chip:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
