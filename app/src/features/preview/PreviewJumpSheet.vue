<script setup lang="ts">
import { watch } from 'vue'
import BottomSheet from '@/components/BottomSheet.vue'
import type { SurahNames } from '@/core/data/types'
import { usePreviewRangeFields, surahOptionLabel } from '@/composables/usePreviewRangeFields'
import { useI18n } from '@/core/i18n'

/**
 * Lets a visitor change which surah/range `/preview` is showing, from inside
 * the page itself — three plain `<select>`s (surah, from-ayah, to-ayah) in a
 * `BottomSheet`, the same primitive `ShareSheet` uses. A native select over a
 * custom combobox: 114/286-item lists are exactly what it's built for
 * (built-in type-ahead, no extra code), and it reads well at any width.
 *
 * Presentational only — emits `go`, the parent (`PreviewView`) does the
 * actual navigation. Changing surah resets the range to its first ayah
 * rather than trying to carry over a range that likely doesn't exist there.
 */
const props = defineProps<{
  surahNames: SurahNames
  surah?: number
  start?: number
  end?: number
}>()
const emit = defineEmits<{ go: [{ surah: number; start: number; end: number }] }>()
const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()

const { surah, start, end, startOptions, endOptions, onSurahChange, onStartChange } = usePreviewRangeFields({
  surah: props.surah ?? 1,
  start: props.start ?? 1,
  end: props.end ?? props.start ?? 1,
})

// Re-sync from the current route each time the sheet opens, so it never
// shows a stale pick left over from a previous open-then-cancel.
watch(open, (isOpen) => {
  if (!isOpen) return
  surah.value = props.surah ?? 1
  start.value = props.start ?? 1
  end.value = props.end ?? props.start ?? 1
})

const surahNumbers = Array.from({ length: 114 }, (_, i) => i + 1)

function submit() {
  emit('go', { surah: surah.value, start: start.value, end: end.value })
  open.value = false
}

function surahLabel(n: number): string {
  return surahOptionLabel(props.surahNames, n)
}
</script>

<template>
  <BottomSheet v-model:open="open" :label="t('preview.jumpTitle')">
    <form class="jump-sheet" @submit.prevent="submit">
      <h2 class="jump-heading">{{ t('preview.jumpTitle') }}</h2>

      <label class="jump-field">
        <span class="jump-label">{{ t('preview.jumpSurah') }}</span>
        <select v-model.number="surah" class="jump-select" dir="auto" @change="onSurahChange">
          <option v-for="n in surahNumbers" :key="n" :value="n">{{ surahLabel(n) }}</option>
        </select>
      </label>

      <div class="jump-row">
        <label class="jump-field">
          <span class="jump-label">{{ t('preview.jumpFrom') }}</span>
          <select v-model.number="start" class="jump-select" @change="onStartChange">
            <option v-for="n in startOptions" :key="n" :value="n">{{ n }}</option>
          </select>
        </label>
        <label class="jump-field">
          <span class="jump-label">{{ t('preview.jumpTo') }}</span>
          <select v-model.number="end" class="jump-select">
            <option v-for="n in endOptions" :key="n" :value="n">{{ n }}</option>
          </select>
        </label>
      </div>

      <button type="submit" class="jump-go">{{ t('preview.jumpGo') }}</button>
    </form>

    <!-- The person picking a range here is, more often than not, someone who
         just received a shared /preview link and wants to make their own —
         a one-tap path to the tutorial (see PreviewLandingView.vue), rather
         than leaving that page undiscoverable outside a typed-in URL. -->
    <RouterLink :to="{ name: 'preview-landing' }" class="jump-help" @click="open = false">
      {{ t('preview.jumpHelp') }}
    </RouterLink>
  </BottomSheet>
</template>

<style scoped>
.jump-sheet {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-bottom: 0.5rem;
}
.jump-heading {
  font-size: var(--text-lg);
  font-weight: 600;
}
.jump-row {
  display: flex;
  gap: 0.75rem;
}
.jump-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex: 1 1 0;
  min-width: 0;
}
.jump-label {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.jump-select {
  height: 2.75rem;
  padding: 0 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-elevated);
  color: var(--color-text);
  font-size: var(--text-sm);
  width: 100%;
}
.jump-select:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.jump-go {
  height: 2.75rem;
  border-radius: var(--radius-md);
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-size: var(--text-sm);
  font-weight: 600;
}
.jump-go:hover {
  background: var(--color-accent-hover);
}
.jump-go:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.jump-help {
  /* No horizontal padding of its own — BottomSheet's own `.dlg-sheet` already
     pads the whole slot (1.25rem), same as `.jump-sheet` above it; adding more
     here would inset this link relative to the "Go" button. */
  display: block;
  margin-top: 0.75rem;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  text-align: center;
  text-decoration: underline;
}
.jump-help:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
