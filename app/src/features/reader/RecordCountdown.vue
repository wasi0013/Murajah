<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from '@/core/i18n'

/** Full-screen "get ready" countdown before the quick-test recording starts. */
const props = defineProps<{ seconds: number }>()
const emit = defineEmits<{ done: [] }>()
const { t } = useI18n()

const remaining = ref(props.seconds)
let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  timer = setInterval(() => {
    remaining.value -= 1
    if (remaining.value <= 0) {
      clearInterval(timer)
      emit('done')
    }
  }, 1000)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div
    class="countdown"
    role="status"
    :aria-label="t('reader.quickTestCountdownAria', { n: remaining })"
  >
    <span class="countdown-n" aria-hidden="true">{{ remaining }}</span>
    <span class="countdown-label">{{ t('reader.quickTestGetReady') }}</span>
  </div>
</template>

<style scoped>
.countdown {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  background: color-mix(in srgb, var(--color-bg) 88%, transparent);
  backdrop-filter: blur(2px);
}
.countdown-n {
  font-size: 5rem;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--color-accent);
}
.countdown-label {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text-muted);
}
</style>
