<script setup lang="ts">
import { computed } from 'vue'
import { Check } from 'lucide-vue-next'
import Icon from '@/components/Icon.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import { PAGE_RECITERS, VERSE_RECITERS } from '@/core/audio/reciters'
import { useAudioStore } from '@/stores/audio'

/**
 * Reciter picker (7.2.3) — a bottom sheet listing the grain-appropriate reciters
 * (verse-mode vs page-mode lists differ). Choosing one persists the preference and
 * asks the host to rebuild playback so the change is heard immediately.
 */
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ grain: 'verse' | 'page' }>()
const emit = defineEmits<{ change: [] }>()

const store = useAudioStore()

const reciters = computed(() => (props.grain === 'page' ? PAGE_RECITERS : VERSE_RECITERS))
const selectedId = computed(() =>
  props.grain === 'page' ? store.pageReciterId : store.verseReciterId,
)

function choose(id: string, close: () => void) {
  if (props.grain === 'page') store.pageReciterId = id
  else store.verseReciterId = id
  emit('change')
  close()
}
</script>

<template>
  <BottomSheet v-model:open="open" label="Choose reciter">
    <template #default="{ close }">
      <div class="picker">
        <h2 class="picker-title">Reciter</h2>
        <ul class="list" role="listbox" aria-label="Reciters">
          <li v-for="r in reciters" :key="r.id">
            <button
              type="button"
              role="option"
              class="item"
              :class="{ sel: r.id === selectedId }"
              :aria-selected="r.id === selectedId"
              @click="choose(r.id, close)"
            >
              <span class="name">{{ r.name }}</span>
              <Icon v-if="r.id === selectedId" :icon="Check" :size="18" class="tick" />
            </button>
          </li>
        </ul>
      </div>
    </template>
  </BottomSheet>
</template>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-bottom: env(safe-area-inset-bottom);
  max-height: 70vh;
}
.picker-title {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-text);
  padding: 0.25rem 0.25rem 0.5rem;
}
.list {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 3rem;
  padding: 0 0.85rem;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text);
  font-size: var(--text-base);
  cursor: pointer;
  transition: background var(--duration-fast);
}
.item:hover {
  background: color-mix(in srgb, var(--color-accent) 8%, transparent);
}
.item.sel {
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  color: var(--color-accent);
  font-weight: 700;
}
.tick {
  color: var(--color-accent);
}
</style>
