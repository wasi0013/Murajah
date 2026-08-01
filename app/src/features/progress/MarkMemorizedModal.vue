<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { usePlanStore } from '@/stores/plan'
import { useProgressStore } from '@/stores/progress'
import { getPagesForJuz, totalPagesForLayout } from '@/core/memorization/planBuilder'
import { getPagesForSurah } from '@/core/quran/surahPages'
import { surahRows, type SurahRow } from '@/core/navigation/contents'
import { getDataClient } from '@/core/data'
import type { SurahNames } from '@/core/data/types'
import { useI18n } from '@/core/i18n'
import { toast } from '@/composables/useToast'
import BottomSheet from '@/components/BottomSheet.vue'
import SegmentedControl from '@/components/SegmentedControl.vue'
import QuizScopePicker from '@/features/quiz/QuizScopePicker.vue'
import SurahList from '@/features/contents/SurahList.vue'

/**
 * A friendlier alternative to typing a page range by hand (9.x): pick whole
 * surahs or juz already memorized, and every page in the selection is marked
 * memorized in one action — the progress store's `bulkMarkMemorized`, same as
 * the manual range form, just a friendlier input for "I know this surah".
 *
 * Juz keeps the quiz scope picker's compact number grid — juz numbers are how
 * people actually talk about what they've memorized ("I finished juz 5").
 * Surahs get the same named, checkbox list as the Contents browser instead —
 * nobody thinks of what they've memorized as "surah 47".
 */
const open = defineModel<boolean>('open', { default: false })

const plan = usePlanStore()
const progress = useProgressStore()
const { t } = useI18n()

const kind = ref<'juz' | 'surah'>('juz')
const selectedJuz = ref<number[]>([])
const selectedSurahs = ref<number[]>([])

// Arabic surah names are a nicety fetched once — the translit name + number
// (from the static `surahRows` table) are already meaningful without them.
const surahNames = ref<SurahNames>({})
const surahRowsData = computed<SurahRow[]>(() => surahRows(surahNames.value))
onMounted(async () => {
  try {
    const data = getDataClient()
    await data.init()
    surahNames.value = await data.getSurahNames()
  } catch {
    /* names are a nicety; the numbered translit list still works */
  }
})

function toggleSurah(n: number): void {
  const i = selectedSurahs.value.indexOf(n)
  selectedSurahs.value =
    i === -1 ? [...selectedSurahs.value, n] : selectedSurahs.value.filter((x) => x !== n)
}

const kindOptions = computed(() => [
  { value: 'juz', label: t('progress.pick.kindJuz') },
  { value: 'surah', label: t('progress.pick.kindSurah') },
])

// A fresh pick every time the sheet opens — an abandoned selection shouldn't
// linger and surprise the user (or get committed) the next time they open it.
watch(open, (isOpen) => {
  if (!isOpen) return
  kind.value = 'juz'
  selectedJuz.value = []
  selectedSurahs.value = []
})

const pages = computed<number[]>(() =>
  kind.value === 'juz'
    ? getPagesForJuz(selectedJuz.value, plan.juzToPage, totalPagesForLayout('qpc'))
    : getPagesForSurah(selectedSurahs.value),
)

const alreadyMemorizedCount = computed(
  () => pages.value.filter((p) => progress.isMemorized(p)).length,
)

/** Something is checked in the grid, even if it hasn't resolved to any pages yet. */
const hasPick = computed(() =>
  kind.value === 'juz' ? selectedJuz.value.length > 0 : selectedSurahs.value.length > 0,
)

// A picked juz can still resolve to zero pages if the nav index (`plan.juzToPage`)
// hasn't loaded yet — `getPagesForJuz` has nothing to expand it against.
const juzNavPending = computed(() => hasPick.value && kind.value === 'juz' && pages.value.length === 0)

// A picked surah can legitimately resolve to zero pages too, for a different
// reason: `getPagesForSurah` only counts a page once every surah on it is
// selected (a shared page could be mostly a *different*, unmemorized surah).
// A short surah entirely on shared pages (e.g. Al-Qiyamah) needs its neighbour
// picked too before anything is marked — this distinguishes that from "nothing
// picked yet" so it doesn't read as broken.
const surahPartialOnly = computed(
  () => hasPick.value && kind.value === 'surah' && pages.value.length === 0,
)

/** Nothing to do with an empty pick (or a pick that resolves to zero pages). */
const invalid = computed(() => pages.value.length === 0)

const kindHintKey = computed(() =>
  kind.value === 'surah' ? 'progress.pick.hintSurah' : 'progress.pick.hintJuz',
)

function confirm() {
  if (invalid.value) return
  const total = pages.value.length
  progress.bulkMarkMemorized(pages.value, true)
  toast(t(total === 1 ? 'progress.pick.confirmedOne' : 'progress.pick.confirmedOther', { n: total }), {
    variant: 'success',
  })
  open.value = false
}
</script>

<template>
  <BottomSheet v-model:open="open" :label="t('progress.pick.title')">
    <div class="pick">
      <h2 class="pick-title">{{ t('progress.pick.title') }}</h2>
      <p class="pick-hint">{{ t(kindHintKey) }}</p>

      <SegmentedControl v-model="kind" :options="kindOptions" :label="t('progress.pick.kindLabel')" />

      <QuizScopePicker v-if="kind === 'juz'" kind="juz" v-model:juz="selectedJuz" />
      <div v-else class="surah-scroll">
        <SurahList :rows="surahRowsData" :selected="selectedSurahs" @toggle="toggleSurah" />
      </div>

      <p class="pick-summary" aria-live="polite">
        <template v-if="juzNavPending">{{ t('progress.pick.juzLoading') }}</template>
        <template v-else-if="surahPartialOnly">{{ t('progress.pick.surahPartial') }}</template>
        <template v-else-if="pages.length === 0">{{ t('progress.pick.summaryNone') }}</template>
        <template v-else>
          {{
            t(
              pages.length === 1 ? 'progress.pick.summarySelectedOne' : 'progress.pick.summarySelectedOther',
              { n: pages.length },
            )
          }}
          <template v-if="alreadyMemorizedCount > 0">
            {{
              t(
                alreadyMemorizedCount === 1
                  ? 'progress.pick.alreadyMemorizedOne'
                  : 'progress.pick.alreadyMemorizedOther',
                { n: alreadyMemorizedCount },
              )
            }}
          </template>
        </template>
      </p>

      <button class="confirm" type="button" :disabled="invalid" @click="confirm">
        {{ t('progress.pick.confirm') }}
      </button>
    </div>
  </BottomSheet>
</template>

<style scoped>
.pick {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding-bottom: 0.5rem;
}
.pick-title {
  font-size: var(--text-base);
  font-weight: 600;
}
.pick-hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  margin-top: -0.5rem;
}
.pick-summary {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  min-height: 1.25rem;
}
.surah-scroll {
  max-height: 18rem;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0.25rem;
}
.confirm {
  height: 2.75rem;
  border-radius: var(--radius-md);
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
}
.confirm:disabled {
  opacity: 0.5;
  cursor: default;
}
.confirm:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
