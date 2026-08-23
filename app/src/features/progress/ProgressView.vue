<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, BookOpen, CalendarCheck, ListChecks } from 'lucide-vue-next'
import { useMemorization } from '@/composables/useMemorization'
import { useProgressPersistence } from '@/composables/useProgressPersistence'
import { useMistakesPersistence } from '@/composables/useMistakesPersistence'
import { usePlanPersistence } from '@/composables/usePlanPersistence'
import { usePlanStore } from '@/stores/plan'
import { TOTAL_PAGES, todayISODate } from '@/stores/progress'
import { readerLink } from '@/core/navigation/readerLinks'
import { estimateCompletion } from '@/core/memorization/completion'
import { formatReadingTime } from '@/core/memorization/progressView'
import { STRENGTH_BANDS, bandForStrength, bandByRank, effectiveRank, daysSince, type StrengthRank } from '@/core/memorization/strengthBands'
import { createLevelEditController } from '@/core/memorization/levelEditController'
import { useI18n } from '@/core/i18n'
import Icon from '@/components/Icon.vue'
import Toggle from '@/components/Toggle.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import SegmentedControl from '@/components/SegmentedControl.vue'
import MemorizedGrid from './MemorizedGrid.vue'
import JuzProgressGrid from './JuzProgressGrid.vue'
import PageDotsGrid from './PageDotsGrid.vue'
import MarkMemorizedModal from './MarkMemorizedModal.vue'
import JournalPanel from './JournalPanel.vue'

/**
 * Memorization progress. Four lenses: **Overview** — summary stats, bulk
 * range-mark, the 604-page grid, weakest-page suggestions; **Juz** — per-juz
 * progress + a completion estimate; **Pages** — the per-page revision heatmap;
 * **Journal** (Phase 12) — the daily practice calendar + reflection notes,
 * reached directly via `/progress?tab=journal` from Today's repointed streak
 * button. Tapping a page opens a sheet to toggle memorized, adjust its
 * strength (a clean revision awards hasanah), or open it in the reader.
 * Canonical 604 scheme.
 */
const router = useRouter()
const route = useRoute()
const { progress, stats, weakestPages, juzGroups } = useMemorization()
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

// —— Memorization level (7-band dropdown, replaces the raw-number stepper) ——
function levelLabel(rank: StrengthRank): string {
  return t(`strengthBand.${bandByRank(rank).labelKey}`)
}
const selectedRawRank = computed<StrengthRank>(() =>
  selectedPage.value === null ? 0 : bandForStrength(progress.strengthOf(selectedPage.value)).rank,
)
const selectedDaysSince = computed(() =>
  selectedPage.value === null
    ? Infinity
    : daysSince(progress.reviewData.get(selectedPage.value)?.lastReviewDate),
)
const selectedEffectiveRank = computed<StrengthRank>(() =>
  selectedPage.value === null
    ? 0
    : effectiveRank(progress.strengthOf(selectedPage.value), selectedDaysSince.value),
)

// —— Manual level picks: exact-restore on revert + debounced decay-clock stamp ——
// Picking a level always applies immediately, but two things are protected
// against a fat-fingered pick: (1) flipping back to the band a page started
// this run in restores the *exact* prior raw strength rather than flooring
// it (setStrengthBand always writes a band's floor, which would otherwise be
// lossy for real revision history built up above that floor), and (2) the
// "last revised" stamp only commits 60s after the *last* edit in a run, and
// only if the level actually netted out different — see levelEditController.ts.
// Deliberately not cancelled on unmount so a pending stamp survives
// navigating away from this view within the same app session (the Pinia
// store is app-global) — only a full reload within the 60s window loses it.
const levelEdits = createLevelEditController({
  currentStrength: (page) => progress.strengthOf(page),
  writeBandFloor: (page, rank) => progress.setStrengthBand(page, rank),
  restoreStrength: (page, value) => progress.bumpStrength(page, value - progress.strengthOf(page)),
  stamp: (page, date) => progress.touchReviewDate(page, date),
  today: todayISODate,
})

// The dropdown is bound to the *raw* band, never the effective/capped one —
// binding to the capped value would risk writing the cap's lower bound back
// over a legitimately higher raw strength the moment the sheet re-renders.
const levelSelection = computed<StrengthRank>({
  get: () => selectedRawRank.value,
  set: (rank) => {
    const page = selectedPage.value
    if (page === null) return
    levelEdits.pickLevel(page, rank)
  },
})

const lastRevisedISO = computed(() => {
  const page = selectedPage.value
  return page === null ? '' : (progress.reviewData.get(page)?.lastReviewDate ?? '')
})
const lastRevisedLabel = computed(() => {
  const iso = lastRevisedISO.value
  if (!iso) return ''
  return new Date(`${iso}T00:00:00`).toLocaleDateString(locale.value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
})
// Shows the EFFECTIVE (decay-capped) level, not the raw one — the dropdown
// above already shows the raw band, so repeating it here would be circular
// and would leave the decayed level invisible anywhere in the sheet. Never
// phrased as "downgraded from X to Y" — a single lastReviewDate can't
// reconstruct which bands a page passed through, only whether it's capped now.
const levelNote = computed(() => {
  if (selectedPage.value === null || selectedEffectiveRank.value === selectedRawRank.value) return ''
  return t('progress.sheet.decayedNote', { level: levelLabel(selectedEffectiveRank.value) })
})

/** Calendar (native date input) — an explicit manual date edit, applied immediately, no cooldown. */
function onLastRevisedChange(e: Event): void {
  const page = selectedPage.value
  const value = (e.target as HTMLInputElement).value
  if (page === null || !value) return
  levelEdits.cancel(page) // an explicit date edit supersedes any pending auto-stamp
  progress.touchReviewDate(page, value)
}

/**
 * The invisible `<input type="date">` overlaying the visible date text
 * already receives clicks (it focuses on click), but on desktop that alone
 * doesn't open the calendar dropdown — browsers only auto-open it for a
 * click on the control's own little calendar-icon affordance, invisible
 * here since the whole input is transparent. `showPicker()` opens it
 * explicitly from this click handler (same user gesture, so it's allowed).
 * Not supported everywhere (older Firefox/Safari) — falls through to a
 * plain focus there, so keyboard/typed entry still works.
 */
function openDatePicker(e: MouseEvent): void {
  const input = e.currentTarget as HTMLInputElement
  if (typeof input.showPicker === 'function') {
    try {
      input.showPicker()
    } catch {
      /* not focused via a trusted gesture in this browser — input still has focus */
    }
  }
}

/** "Revised today" — replaces the old raw stepper's "+"; a full clean-revision completion. */
function recordRevisedToday(): void {
  const page = selectedPage.value
  if (page === null) return
  levelEdits.cancel(page)
  progress.recordPerfectRevision(page)
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

const hasanahFmt = computed(() => stats.value.totalHasanah.toLocaleString('en-US'))
const readingTimeFmt = computed(() => formatReadingTime(stats.value.readingSeconds))
const listeningTimeFmt = computed(() => formatReadingTime(stats.value.listeningSeconds))
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
    <section class="stats" :aria-label="t('progress.summaryAria')">
      <div class="stat">
        <span class="stat-n">{{ stats.memorizedCount }}<span class="stat-of">/{{ stats.totalPages }}</span></span>
        <span class="stat-l">{{ t('progress.stats.pagesPercent', { percent: stats.percent }) }}</span>
      </div>
      <div class="stat">
        <span class="stat-n">{{ hasanahFmt }}</span>
        <span class="stat-l">{{ t('progress.stats.hasanah') }}</span>
      </div>
      <div class="stat">
        <span class="stat-n">{{ readingTimeFmt }}</span>
        <span class="stat-l">{{ t('progress.stats.readingTime') }}</span>
      </div>
      <div class="stat">
        <span class="stat-n">{{ listeningTimeFmt }}</span>
        <span class="stat-l">{{ t('progress.stats.listeningTime') }}</span>
      </div>
      <div class="stat">
        <span class="stat-n">{{ stats.mistakePages }}</span>
        <span class="stat-l">{{ t('progress.stats.mistakePages') }}</span>
      </div>
      <div class="stat">
        <span class="stat-n">{{ stats.averageStrength }}</span>
        <span class="stat-l">{{ t('progress.stats.avgStrength') }}</span>
      </div>
    </section>

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

    <MemorizedGrid @select="openPage" />

    <section v-if="weakestPages.length" class="weakest" :aria-label="t('progress.weakestAria')">
      <h2 class="section-title">{{ t('progress.needsReview') }}</h2>
      <div class="chips">
        <button v-for="p in weakestPages" :key="p" class="chip" @click="openPage(p)">
          {{ t('common.page', { n: p }) }}
        </button>
      </div>
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
          :strength="progress.strength"
          :review-data="progress.reviewData"
          @select="openInReader"
        />
      </template>
    </section>

    <section v-else class="panel" :aria-label="t('journal.title')">
      <JournalPanel />
    </section>

    <BottomSheet
      v-model:open="sheetOpen"
      :label="selectedPage ? t('common.page', { n: selectedPage }) : t('common.pageWord')"
    >
      <div v-if="selectedPage" class="sheet">
        <h2 class="sheet-title">{{ t('common.page', { n: selectedPage }) }}</h2>

        <div class="row">
          <span>{{ t('progress.sheet.memorized') }}</span>
          <Toggle
            :model-value="progress.isMemorized(selectedPage)"
            :label="t('progress.sheet.memorized')"
            @update:model-value="progress.toggleMemorized(selectedPage)"
          />
        </div>

        <div class="row level-row">
          <label class="level-field" for="page-level-select">
            <span>{{ t('progress.sheet.level') }}</span>
            <select
              id="page-level-select"
              v-model.number="levelSelection"
              class="level-select"
              :aria-label="t('strengthBand.aria')"
            >
              <option v-for="band in STRENGTH_BANDS" :key="band.rank" :value="band.rank">
                {{ levelLabel(band.rank) }}
              </option>
            </select>
          </label>
        </div>
        <p v-if="levelNote" class="hint">{{ levelNote }}</p>

        <div class="row">
          <label class="last-revised-field" for="page-last-revised">
            <span>{{ t('progress.sheet.lastRevised') }}</span>
            <!-- The visible, clickable date text; the real <input type="date">
                 sits transparently on top of it (still in the a11y tree —
                 opacity doesn't remove that — and still keyboard-reachable),
                 so tapping the date itself opens the native calendar picker
                 rather than a bare, unstyled native control. -->
            <span class="last-revised-control">
              <span class="last-revised-fmt" aria-hidden="true">
                {{ lastRevisedLabel || t('progress.sheet.noRevisionYet') }}
              </span>
              <input
                id="page-last-revised"
                type="date"
                class="date-input"
                :value="lastRevisedISO"
                :max="todayISODate()"
                :aria-label="t('progress.sheet.lastRevised')"
                @click="openDatePicker"
                @change="onLastRevisedChange"
              />
            </span>
          </label>
        </div>

        <button class="revised-today" @click="recordRevisedToday">
          <Icon :icon="CalendarCheck" :size="16" />
          <span>{{ t('progress.sheet.revisedToday') }}</span>
        </button>
        <p class="hint">{{ t('progress.sheet.revisedTodayHint') }}</p>

        <button class="open-reader" @click="openInReader(selectedPage)">
          <Icon :icon="BookOpen" :size="16" />
          <span>{{ t('progress.sheet.openReader') }}</span>
        </button>
      </div>
    </BottomSheet>

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
  flex-direction: column;
  align-items: flex-start;
  gap: 0.65rem;
  max-width: 46rem;
  margin: 1rem auto 0;
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
.level-row {
  justify-content: flex-start;
}
.level-field {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  justify-content: space-between;
}
.level-select {
  height: 2.25rem;
  padding: 0 0.6rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-elevated);
  color: var(--color-text);
  font-size: var(--text-sm);
  font-weight: 600;
}
.level-select:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.last-revised-field {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  justify-content: space-between;
}
.last-revised-control {
  position: relative;
  display: inline-flex;
  /* input[type=date] carries its own UA min-width, which can exceed the
     visible chip (most likely in RTL) — clip it so the invisible hit area
     never extends past the visible date text. */
  overflow: hidden;
  border-radius: var(--radius-md);
}
.last-revised-fmt {
  display: inline-flex;
  align-items: center;
  height: 2.25rem;
  padding: 0 0.6rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-elevated);
  color: var(--color-text);
  font-size: var(--text-sm);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
/* The real control, invisible but on top — still keyboard/AT reachable
   (opacity doesn't remove it from the accessibility tree), so a click or tap
   anywhere on the visible date text opens the native calendar picker. */
.date-input {
  position: absolute;
  inset: 0;
  width: 100%;
  opacity: 0;
  cursor: pointer;
}
.last-revised-control:focus-within .last-revised-fmt {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.revised-today {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 2.5rem;
  border-radius: var(--radius-md);
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-size: var(--text-sm);
  font-weight: 600;
}
.revised-today:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
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
