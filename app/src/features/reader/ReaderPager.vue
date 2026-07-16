<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useReaderStore } from '@/stores/reader'
import { useReaderPages } from '@/composables/useReaderPages'
import { getDataClient } from '@/core/data'
import type { SurahNames } from '@/core/data/types'
import ReadingSurface from './ReadingSurface.vue'
import Skeleton from '@/components/Skeleton.vue'

/**
 * Paged reader host: mounts only the current page and its two neighbours in a
 * track (the rest stay virtual), so a long surah never mounts more than three
 * surfaces. Data + fonts for the window are loaded and neighbours prefetched by
 * useReaderPages; a mushaf-frame skeleton shows until a page resolves.
 */
const reader = useReaderStore()
const pages = useReaderPages(reader)

// Surah names are tiny and shared across pages — load once.
const surahNames = ref<SurahNames>({})
onMounted(async () => {
  try {
    const data = getDataClient()
    await data.init()
    surahNames.value = await data.getSurahNames()
  } catch {
    /* names are non-critical chrome */
  }
})

// Fixed slots relative to the current page keep the DOM structure stable while
// paging; the track is translated so the middle slot is centred (3.3 animates).
const OFFSETS = [-1, 0, 1] as const
</script>

<template>
  <div class="pager" aria-busy="false">
    <div class="track">
      <div v-for="offset in OFFSETS" :key="offset" class="col" :aria-hidden="offset !== 0">
        <template v-if="reader.page + offset >= 1 && reader.page + offset <= reader.pageCount">
          <ReadingSurface
            v-if="pages.entry(reader.page + offset)?.status === 'ready'"
            :page="pages.entry(reader.page + offset)!.chunk!"
            :font-family="pages.entry(reader.page + offset)!.family!"
            :surah-names="surahNames"
            :text-size="reader.readingSize"
          />
          <div v-else class="page-skeleton" role="status" aria-label="Loading page">
            <Skeleton v-for="n in 12" :key="n" height="1.6em" :width="`${70 + ((n * 7) % 28)}%`" />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pager {
  overflow: hidden;
  width: 100%;
}
.track {
  display: flex;
  /* Three 100%-wide columns; show the middle one. 3.3 animates this during swipe. */
  transform: translateX(-100%);
}
.col {
  flex: 0 0 100%;
  min-width: 0;
}
.page-skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 1.5rem 1rem;
  align-items: center;
}
.page-skeleton > * {
  max-width: 40ch;
}
</style>
