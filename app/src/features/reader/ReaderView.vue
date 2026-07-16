<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronLeft, ChevronRight, Type } from 'lucide-vue-next'
import { useReaderStore, READING_SIZES } from '@/stores/reader'
import { useReaderRouteSync } from '@/composables/useReaderRouteSync'
import { useReaderPersistence } from '@/composables/useReaderPersistence'
import ReaderPager from './ReaderPager.vue'
import Slider from '@/components/Slider.vue'
import Button from '@/components/Button.vue'
import Icon from '@/components/Icon.vue'

/**
 * Reader host. Renders the paged reading surface and binds it to the URL +
 * persisted prefs. This is an interim shell: the full chrome (controls sheet,
 * bottom tab bar, layout/tajweed toggles, quick-jump) arrives in 3.10. The
 * text-size Slider (3.2.3) and prev/next live here for now.
 */
const reader = useReaderStore()
const router = useRouter()

const sync = useReaderRouteSync(reader, router)
const persistence = useReaderPersistence(reader)

onMounted(async () => {
  await persistence.hydrate() // saved prefs first…
  sync.applyRoute() // …then the URL wins for layout/page/toggles it specifies
})
onBeforeUnmount(() => {
  sync.dispose()
  persistence.dispose()
})

const maxStep = READING_SIZES.length - 1
const canPrev = computed(() => reader.page > 1)
const canNext = computed(() => reader.page < reader.pageCount)
</script>

<template>
  <main class="reader">
    <ReaderPager class="reader-surface" />

    <div class="reader-controls" role="toolbar" aria-label="Reader controls">
      <Button
        variant="ghost"
        :disabled="!canPrev"
        aria-label="Previous page"
        @click="reader.prevPage()"
      >
        <Icon :icon="ChevronLeft" />
      </Button>

      <span class="page-indicator" aria-live="polite">
        Page {{ reader.page }} / {{ reader.pageCount }}
      </span>

      <label class="size-control">
        <Icon :icon="Type" :size="16" label="Text size" />
        <Slider
          :model-value="reader.textSizeStep"
          :min="0"
          :max="maxStep"
          :step="1"
          label="Text size"
          @update:model-value="reader.setTextSizeStep($event)"
        />
      </label>

      <Button variant="ghost" :disabled="!canNext" aria-label="Next page" @click="reader.nextPage()">
        <Icon :icon="ChevronRight" />
      </Button>
    </div>
  </main>
</template>

<style scoped>
.reader {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: var(--color-bg);
}
.reader-surface {
  flex: 1;
}
.reader-controls {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom));
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
}
.page-indicator {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.size-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
  color: var(--color-text-muted);
}
</style>
