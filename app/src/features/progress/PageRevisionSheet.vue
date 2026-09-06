<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { BookOpen, CalendarCheck } from 'lucide-vue-next'
import { useProgressStore, todayISODate } from '@/stores/progress'
import { readerLink } from '@/core/navigation/readerLinks'
import {
  STRENGTH_BANDS,
  bandForStrength,
  bandByRank,
  effectiveRank,
  daysSince,
  type StrengthRank,
} from '@/core/memorization/strengthBands'
import { createLevelEditController } from '@/core/memorization/levelEditController'
import { useI18n } from '@/core/i18n'
import Icon from '@/components/Icon.vue'
import Toggle from '@/components/Toggle.vue'
import BottomSheet from '@/components/BottomSheet.vue'

/**
 * Per-page revision sheet: memorized toggle, level dropdown, last-revised date,
 * and the "revised today" clean-revision action. Shared between Progress
 * (`ProgressView.vue`, every lens) and the reader's own foot-of-page brain
 * button (`ReaderPager.vue`) — the reader hides "open in reader" since the
 * page it would open is already the one on screen.
 */
const props = withDefaults(
  defineProps<{
    /** The page this sheet edits; the sheet is open whenever this is non-null. */
    page: number | null
    showOpenInReader?: boolean
  }>(),
  { showOpenInReader: true },
)
const emit = defineEmits<{ 'update:page': [number | null] }>()

const { t, locale } = useI18n()
const router = useRouter()
const progress = useProgressStore()

const sheetOpen = computed({
  get: () => props.page !== null,
  set: (v) => {
    if (!v) emit('update:page', null)
  },
})

function openInReader(page: number) {
  void router.push(readerLink({ page }))
}

// —— Memorization level (7-band dropdown, replaces the raw-number stepper) ——
function levelLabel(rank: StrengthRank): string {
  return t(`strengthBand.${bandByRank(rank).labelKey}`)
}
const selectedRawRank = computed<StrengthRank>(() =>
  props.page === null ? 0 : bandForStrength(progress.strengthOf(props.page)).rank,
)
const selectedDaysSince = computed(() =>
  props.page === null ? Infinity : daysSince(progress.reviewData.get(props.page)?.lastReviewDate),
)
const selectedEffectiveRank = computed<StrengthRank>(() =>
  props.page === null
    ? 0
    : effectiveRank(
        progress.isMemorized(props.page),
        progress.strengthOf(props.page),
        selectedDaysSince.value,
      ),
)

// —— Manual level picks: exact-restore on revert + debounced decay-clock stamp ——
// Picking a level always applies immediately, but two things are protected
// against a fat-fingered pick: (1) flipping back to the band a page started
// this run in restores the *exact* prior raw strength rather than flooring
// it (setStrengthBand always writes a band's floor, which would otherwise be
// lossy for real revision history built up above that floor), and (2) the
// "last revised" stamp only commits 60s after the *last* edit in a run, and
// only if the level actually netted out different — see levelEditController.ts.
// Deliberately not cancelled on unmount so a pending stamp survives closing
// this sheet within the same app session (the Pinia store is app-global) —
// only a full reload within the 60s window loses it.
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
    const page = props.page
    if (page === null) return
    levelEdits.pickLevel(page, rank)
  },
})

const lastRevisedISO = computed(() => {
  const page = props.page
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
  if (props.page === null || selectedEffectiveRank.value === selectedRawRank.value) return ''
  return t('progress.sheet.decayedNote', { level: levelLabel(selectedEffectiveRank.value) })
})

/** Calendar (native date input) — an explicit manual date edit, applied immediately, no cooldown. */
function onLastRevisedChange(e: Event): void {
  const page = props.page
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
  const page = props.page
  if (page === null) return
  levelEdits.cancel(page)
  progress.recordPerfectRevision(page)
}
</script>

<template>
  <BottomSheet v-model:open="sheetOpen" :label="page ? t('common.page', { n: page }) : t('common.pageWord')">
    <div v-if="page" class="sheet">
      <h2 class="sheet-title">{{ t('common.page', { n: page }) }}</h2>

      <div class="row">
        <span>{{ t('progress.sheet.memorized') }}</span>
        <Toggle
          :model-value="progress.isMemorized(page)"
          :label="t('progress.sheet.memorized')"
          @update:model-value="progress.toggleMemorized(page)"
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

      <button v-if="showOpenInReader" class="open-reader" @click="openInReader(page)">
        <Icon :icon="BookOpen" :size="16" />
        <span>{{ t('progress.sheet.openReader') }}</span>
      </button>
    </div>
  </BottomSheet>
</template>

<style scoped>
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
