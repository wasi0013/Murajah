<script setup lang="ts">
import { Headphones } from 'lucide-vue-next'
import Icon from '@/components/Icon.vue'
import type { SurahRow } from '@/core/navigation/contents'
import { useI18n } from '@/core/i18n'

const { t } = useI18n()

/**
 * Presentational surah index. Two interaction modes:
 * - Default (no `selected` prop): a single-select navigation list — clicking a
 *   row emits the chosen surah number; the view resolves it to a page and
 *   navigates (keeps navigation in one place, and lets Listen reuse the same
 *   selection). With `showListen`, each row also offers a headphones shortcut
 *   that deep-links into Listen (emits `listen`).
 * - Selectable (`selected` passed, even `[]`): rows become checkboxes instead —
 *   clicking toggles membership in the caller's selection (emits `toggle`)
 *   rather than navigating. Used by the memorize-by-surah picker, where surah
 *   *number* alone isn't how anyone thinks of what they've memorized.
 */
defineProps<{ rows: SurahRow[]; showListen?: boolean; selected?: number[] }>()
defineEmits<{ select: [surah: number]; listen: [surah: number]; toggle: [surah: number] }>()
</script>

<template>
  <ul class="list" role="list">
    <li v-for="r in rows" :key="r.surah" class="row-wrap">
      <label v-if="selected" class="row row-check">
        <input
          type="checkbox"
          :checked="selected.includes(r.surah)"
          @change="$emit('toggle', r.surah)"
        />
        <span class="num" aria-hidden="true">{{ r.surah }}</span>
        <span class="main">
          <span class="translit">{{ r.translit }}</span>
          <span class="meta">
            {{ t(r.ayahs === 1 ? 'surahList.ayahOne' : 'surahList.ayahOther', { n: r.ayahs }) }}
            <span class="dot" aria-hidden="true">·</span>
            <span class="place" :class="r.place">{{ r.place === 'makki' ? t('surahList.makki') : t('surahList.madani') }}</span>
          </span>
        </span>
        <span class="arabic" dir="rtl" lang="ar">{{ r.arabic }}</span>
      </label>
      <button v-else type="button" class="row" @click="$emit('select', r.surah)">
        <span class="num" aria-hidden="true">{{ r.surah }}</span>
        <span class="main">
          <span class="translit">{{ r.translit }}</span>
          <span class="meta">
            {{ t(r.ayahs === 1 ? 'surahList.ayahOne' : 'surahList.ayahOther', { n: r.ayahs }) }}
            <span class="dot" aria-hidden="true">·</span>
            <span class="place" :class="r.place">{{ r.place === 'makki' ? t('surahList.makki') : t('surahList.madani') }}</span>
          </span>
        </span>
        <span class="arabic" dir="rtl" lang="ar">{{ r.arabic }}</span>
      </button>
      <button
        v-if="showListen"
        type="button"
        class="listen-btn"
        :aria-label="t('surahList.listen', { name: r.translit })"
        @click="$emit('listen', r.surah)"
      >
        <Icon :icon="Headphones" :size="18" />
      </button>
    </li>
  </ul>
</template>

<style scoped>
.list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.row-wrap {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.row {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  flex: 1 1 auto;
  min-width: 0;
  padding: 0.6rem 0.5rem;
  border-radius: var(--radius-md);
  background: none;
  text-align: start;
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-standard);
}
.row:hover {
  background: var(--color-elevated);
}
.row:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
.row-check input[type='checkbox'] {
  flex: 0 0 auto;
  width: 1.15rem;
  height: 1.15rem;
  accent-color: var(--color-accent);
}
.row-check input[type='checkbox']:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.num {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: var(--radius-full);
  background: color-mix(in oklab, var(--color-accent) 12%, transparent);
  color: var(--color-accent);
  font-size: var(--text-xs);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}
.translit {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text);
}
.meta {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.place.madani {
  /* Green Madani accent, darkened toward the text colour so small text clears AA
     contrast in every theme (mixing toward --color-text raises contrast both ways). */
  color: color-mix(in oklab, var(--color-success) 68%, var(--color-text));
}
.arabic {
  flex: 0 0 auto;
  font-size: var(--text-lg);
  color: var(--color-text);
  font-family: var(--font-arabic, serif);
}
.listen-btn {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-full);
  color: var(--color-accent);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-standard);
}
.listen-btn:hover {
  background: color-mix(in oklab, var(--color-accent) 12%, transparent);
}
.listen-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
</style>
