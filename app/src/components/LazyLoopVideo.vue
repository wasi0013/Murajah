<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Play } from 'lucide-vue-next'
import Icon from './Icon.vue'

/**
 * A silent, looping demo clip — the landing page's "screenshot", except it
 * moves. Nothing loads until it's actually needed:
 *  - Under `prefers-reduced-motion: reduce`, the poster is all that ever
 *    renders until the visitor explicitly taps play (WCAG 2.2.2 targets
 *    content that starts moving on its own — a direct tap doesn't count).
 *  - Otherwise, an IntersectionObserver mounts the `<video>` (with `autoplay`)
 *    the first time it scrolls into view, then just play()/pause()s it on
 *    every visibility change after that — never destroyed, so re-entering
 *    view resumes instantly instead of re-fetching.
 */
const props = defineProps<{
  src: string
  poster: string
  /** Accessible label — these loops are decorative demos, not standalone media. */
  label: string
}>()

const rootEl = ref<HTMLElement | null>(null)
const videoEl = ref<HTMLVideoElement | null>(null)
const started = ref(false)

const reducedMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

let observer: IntersectionObserver | null = null

onMounted(() => {
  if (reducedMotion) return // stays a static poster until tapped
  if (typeof IntersectionObserver !== 'function' || !rootEl.value) {
    // No IO support (or a non-browser test env) — a static poster forever
    // would be worse than just starting it.
    started.value = true
    return
  }
  observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      if (!entry) return
      if (entry.isIntersecting) {
        started.value = true
        void videoEl.value?.play()
      } else {
        videoEl.value?.pause()
      }
    },
    { threshold: 0.35 },
  )
  observer.observe(rootEl.value)
})

onBeforeUnmount(() => observer?.disconnect())

function tapToPlay() {
  started.value = true
}
</script>

<template>
  <div ref="rootEl" class="lazy-video">
    <video
      v-if="started"
      ref="videoEl"
      :src="props.src"
      :poster="props.poster"
      muted
      autoplay
      loop
      playsinline
      preload="none"
      :aria-label="props.label"
    />
    <template v-else>
      <img :src="props.poster" :alt="props.label" class="lazy-video-poster" />
      <button type="button" class="lazy-video-play" :aria-label="`Play: ${props.label}`" @click="tapToPlay">
        <Icon :icon="Play" :size="22" />
      </button>
    </template>
  </div>
</template>

<style scoped>
.lazy-video {
  position: relative;
  width: 100%;
  aspect-ratio: 390 / 844;
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: #000;
}
.lazy-video video,
.lazy-video-poster {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.lazy-video-play {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 3rem;
  height: 3rem;
  border-radius: var(--radius-full);
  border: none;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.lazy-video-play:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
