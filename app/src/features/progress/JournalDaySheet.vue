<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Mic, Pause, Play, TrendingDown, TrendingUp } from 'lucide-vue-next'
import { useI18n } from '@/core/i18n'
import { useJournalDay } from '@/composables/useJournalDay'
import { useJournalStore } from '@/stores/journal'
import { useJournalPersistence } from '@/composables/useJournalPersistence'
import { bandByRank, type StrengthRank } from '@/core/memorization/strengthBands'
import { readerLink } from '@/core/navigation/readerLinks'
import type { JournalEvent } from '@/core/storage/journalStorage'
import BottomSheet from '@/components/BottomSheet.vue'
import Icon from '@/components/Icon.vue'

/**
 * The expanded-day detail (Phase 12.4.3) — every populated section from
 * `useJournalDay`, plus the reflection-note editor (12.5.1) inline (there is
 * no other surface a note editor would appear on, so it isn't a separate
 * component). Recording playback here is deliberately minimal — its own
 * `<audio>` + blob-URL lifecycle, mirroring `RecordingPanel.vue`'s technique
 * — not the full record/delete panel, which stays that view's job.
 */
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ date: string }>()

const { t, locale } = useI18n()
const router = useRouter()
const journal = useJournalStore()
const persistence = useJournalPersistence(journal)

const dateRef = computed(() => props.date)
const { detail, loading } = useJournalDay(dateRef)

const dateLabel = computed(() =>
  new Date(`${props.date}T00:00:00`).toLocaleDateString(locale.value, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }),
)

function levelLabel(rank: StrengthRank): string {
  return t(`strengthBand.${bandByRank(rank).labelKey}`)
}

function eventLabel(e: JournalEvent): string {
  if (e.type === 'bulk-memorized') {
    return t(e.count === 1 ? 'journal.event.bulkMemorizedOne' : 'journal.event.bulkMemorizedOther', {
      count: e.count ?? 0,
    })
  }
  return t('journal.event.change', { from: levelLabel(e.fromRank ?? 0), to: levelLabel(e.toRank ?? 0) })
}

const hasAnything = computed(() => {
  const d = detail.value
  return (
    d.sections.newMemorization.length > 0 ||
    d.sections.revision.length > 0 ||
    d.sections.weak.length > 0 ||
    d.sections.habits.length > 0 ||
    d.events.length > 0 ||
    d.eventsOverflow > 0 ||
    d.recordings.length > 0 ||
    d.note.length > 0
  )
})

function openPage(page: number) {
  open.value = false
  void router.push(readerLink({ page }))
}

// —— Reflection note (12.5.1): editable for any day, autosaved (debounced) ——
const NOTE_MAX = 280
const noteDraft = ref('')
watch(
  () => detail.value.note,
  (n) => {
    // Only adopt the store's value when it's not what we're already editing —
    // avoids clobbering an in-flight draft if `detail` recomputes mid-edit.
    if (n !== noteDraft.value) noteDraft.value = n
  },
  { immediate: true },
)
function onNoteInput(): void {
  journal.setNote(props.date, noteDraft.value)
  persistence.scheduleNoteSave(props.date)
}
onBeforeUnmount(() => persistence.dispose())

// —— Recording playback ——
const audioEl = ref<HTMLAudioElement>()
const playingId = ref<string | null>(null)
let blobUrl: string | null = null
function stopPlayback(): void {
  audioEl.value?.pause()
  if (blobUrl) {
    URL.revokeObjectURL(blobUrl)
    blobUrl = null
  }
  playingId.value = null
}
function togglePlay(id: string, blob: Blob): void {
  if (playingId.value === id) {
    stopPlayback()
    return
  }
  stopPlayback()
  const el = audioEl.value
  if (!el) return
  blobUrl = URL.createObjectURL(blob)
  el.src = blobUrl
  playingId.value = id
  void el.play().catch(() => stopPlayback())
}
onBeforeUnmount(stopPlayback)

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
</script>

<template>
  <BottomSheet v-model:open="open" :label="dateLabel">
    <div class="sheet">
      <h2 class="sheet-title">{{ dateLabel }}</h2>

      <p v-if="loading" class="empty">{{ t('common.loading') }}</p>
      <p v-else-if="!hasAnything" class="empty">{{ t('journal.empty') }}</p>

      <section v-if="detail.sections.newMemorization.length" class="day-block day-block-new">
        <h3 class="day-block-title">{{ t('journal.sections.newMemorization') }}</h3>
        <div class="chips">
          <button v-for="p in detail.sections.newMemorization" :key="p" class="chip" @click="openPage(p)">
            {{ t('common.page', { n: p }) }}
          </button>
        </div>
      </section>

      <section v-if="detail.sections.revision.length" class="day-block day-block-revision">
        <h3 class="day-block-title">{{ t('journal.sections.revision') }}</h3>
        <div class="chips">
          <button v-for="p in detail.sections.revision" :key="p" class="chip" @click="openPage(p)">
            {{ t('common.page', { n: p }) }}
          </button>
        </div>
      </section>

      <section v-if="detail.sections.weak.length" class="day-block day-block-weak">
        <h3 class="day-block-title">{{ t('journal.sections.weak') }}</h3>
        <div class="chips">
          <button v-for="p in detail.sections.weak" :key="p" class="chip" @click="openPage(p)">
            {{ t('common.page', { n: p }) }}
          </button>
        </div>
      </section>

      <section v-if="detail.sections.habits.length" class="day-block">
        <h3 class="day-block-title">{{ t('journal.sections.habits') }}</h3>
        <ul class="habit-list">
          <li v-for="h in detail.sections.habits" :key="h.id">{{ t(h.nameKey) }}</li>
        </ul>
      </section>

      <section v-if="detail.events.length || detail.eventsOverflow > 0" class="day-block">
        <h3 class="day-block-title">{{ t('journal.sections.changes') }}</h3>
        <ul class="event-list">
          <li v-for="e in detail.events" :key="e.id" class="event-row">
            <Icon :icon="e.type === 'band-down' ? TrendingDown : TrendingUp" :size="15" class="event-icon" :class="`event-icon-${e.type}`" />
            <button v-if="e.page !== undefined" type="button" class="event-page" @click="openPage(e.page)">
              {{ t('common.page', { n: e.page }) }}
            </button>
            <span class="event-text">{{ eventLabel(e) }}</span>
          </li>
        </ul>
        <p v-if="detail.eventsOverflow > 0" class="overflow-hint">
          {{ t(detail.eventsOverflow === 1 ? 'journal.event.overflowOne' : 'journal.event.overflowOther', { n: detail.eventsOverflow }) }}
        </p>
      </section>

      <section v-if="detail.recordings.length" class="day-block">
        <h3 class="day-block-title">{{ t('journal.sections.recordings') }}</h3>
        <ul class="recording-list">
          <li v-for="r in detail.recordings" :key="r.id" class="recording-row">
            <button type="button" class="play-btn" @click="togglePlay(r.id, r.blob)">
              <Icon :icon="playingId === r.id ? Pause : Play" :size="16" />
            </button>
            <span class="recording-meta">
              <Icon :icon="Mic" :size="13" aria-hidden="true" />
              {{ t('common.page', { n: r.pageNumber }) }} · {{ fmtDuration(r.duration) }}
            </span>
          </li>
        </ul>
        <audio ref="audioEl" class="sr-audio" @ended="stopPlayback" />
      </section>

      <section class="day-block">
        <h3 class="day-block-title">{{ t('journal.sections.reflection') }}</h3>
        <textarea
          v-model="noteDraft"
          class="note-input"
          :maxlength="NOTE_MAX"
          :placeholder="t('journal.note.placeholder')"
          :aria-label="t('journal.note.aria')"
          rows="3"
          @input="onNoteInput"
        />
        <span class="note-counter">{{ t('journal.note.counter', { used: noteDraft.length, max: NOTE_MAX }) }}</span>
      </section>
    </div>
  </BottomSheet>
</template>

<style scoped>
.sheet {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  padding-bottom: 0.5rem;
}
.sheet-title {
  font-size: var(--text-base);
  font-weight: 600;
}
.empty {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  padding: 1rem 0;
  text-align: center;
}
.day-block {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.day-block-title {
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--color-text-muted);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.chip {
  padding: 0.35rem 0.7rem;
  border-radius: var(--radius-full);
  background: var(--color-elevated);
  color: var(--color-text);
  font-size: var(--text-xs);
  font-weight: 600;
}
.chip:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.day-block-new .chip {
  background: color-mix(in oklab, var(--color-accent) 14%, transparent);
  color: var(--color-accent);
}
.day-block-weak .chip {
  background: color-mix(in oklab, var(--color-danger) 12%, transparent);
  color: var(--color-danger);
}
.habit-list,
.event-list,
.recording-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: var(--text-sm);
}
.event-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.event-icon-band-up {
  color: var(--color-success);
}
.event-icon-band-down {
  color: var(--color-danger);
}
.event-icon-bulk-memorized {
  color: var(--color-accent);
}
.event-page {
  font-weight: 600;
  color: var(--color-text);
}
.event-text {
  color: var(--color-text-muted);
}
.overflow-hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.recording-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.play-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 2rem;
  width: 2rem;
  border-radius: 50%;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  flex-shrink: 0;
}
.play-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.recording-meta {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}
.sr-audio {
  display: none;
}
.note-input {
  width: 100%;
  min-height: 4.5rem;
  padding: 0.6rem 0.75rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-elevated);
  color: var(--color-text);
  font-size: var(--text-sm);
  font-family: inherit;
  resize: vertical;
}
.note-input:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}
.note-counter {
  align-self: flex-end;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}
</style>
