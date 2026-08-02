<script setup lang="ts">
import { computed } from 'vue'
import { Repeat, X } from 'lucide-vue-next'
import Icon from '@/components/Icon.vue'
import { useAudioEngine } from '@/composables/useAudioEngine'
import { useAudioStore } from '@/stores/audio'
import { useI18n } from '@/core/i18n'

/**
 * The expandable advanced tray (7.2.2): AB-repeat, speed, repeat-count /
 * spaced-repetition, and the autoplay-next / loop-playlist transport companions.
 * Kept out of the always-visible mini-player so the default surface stays simple.
 *
 * AB-repeat is driven entirely by the engine's reducer (`core/audio/abRepeat.ts`):
 * setting both A and B starts the loop immediately; setting B alone loops from the
 * start; and the Loop button — always tappable, not just once markers exist — loops
 * the whole item with no markers, or fills in whichever end is missing (start or
 * duration) so a lone A marker can be turned into "loop from here to the end" right
 * away, without waiting for the item to finish playing once first.
 * Changing repeat-count or the spaced drill needs the playlist rebuilt, so those
 * emit `rebuild`; autoplay-next / loop-playlist are read live by the engine, so
 * they don't. That section only renders when `showRepeat` is true (BUG fix: it
 * used to render unconditionally everywhere, including contexts — page grain;
 * Listen's whole-scope playthrough — where no caller ever wires `repeatCount`/
 * `spaced` into playback, so toggling it visibly changed state and rebuilt the
 * playlist but had no audible effect).
 */
withDefaults(defineProps<{ showRepeat?: boolean }>(), { showRepeat: true })
const store = useAudioStore()
const engine = useAudioEngine()
const emit = defineEmits<{ rebuild: [] }>()
const { t } = useI18n()

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

const hasA = computed(() => store.ab.a !== null)
const hasB = computed(() => store.ab.b !== null)
const hasMarkers = computed(() => hasA.value || hasB.value)

function setRepeat(n: number) {
  store.repeatCount = Math.max(1, Math.min(9, n))
  emit('rebuild')
}
function toggleSpaced() {
  store.spaced = !store.spaced
  emit('rebuild')
}
</script>

<template>
  <div class="tray">
    <!-- AB-repeat -->
    <section class="group" aria-labelledby="ab-label">
      <span id="ab-label" class="group-label">{{ t('audio.abRepeat') }}</span>
      <div class="ab-row">
        <button
          type="button"
          class="chip ab"
          :class="{ on: hasA }"
          :aria-pressed="hasA"
          @click="engine.markA()"
        >
          A<span v-if="hasA" class="ab-time">{{ t('audio.secondsShort', { n: store.ab.a!.toFixed(1) }) }}</span>
        </button>
        <button
          type="button"
          class="chip ab"
          :class="{ on: hasB }"
          :aria-pressed="hasB"
          @click="engine.markB()"
        >
          B<span v-if="hasB" class="ab-time">{{ t('audio.secondsShort', { n: store.ab.b!.toFixed(1) }) }}</span>
        </button>
        <button
          type="button"
          class="chip"
          :class="{ on: store.ab.loop }"
          :aria-pressed="store.ab.loop"
          @click="engine.toggleAbLoop()"
        >
          <Icon :icon="Repeat" :size="15" />
          <span>{{ t('audio.loop') }}</span>
        </button>
        <button
          v-if="hasMarkers"
          type="button"
          class="chip ghost"
          :aria-label="t('audio.clearMarkers')"
          @click="engine.clearAbMarkers()"
        >
          <Icon :icon="X" :size="15" />
        </button>
      </div>
    </section>

    <!-- Speed -->
    <section class="group" aria-labelledby="speed-label">
      <span id="speed-label" class="group-label">{{ t('audio.speed') }}</span>
      <div class="seg" role="radiogroup" :aria-label="t('audio.speedAria')">
        <button
          v-for="s in SPEEDS"
          :key="s"
          type="button"
          role="radio"
          class="seg-btn"
          :class="{ on: store.speed === s }"
          :aria-checked="store.speed === s"
          @click="engine.setSpeed(s)"
        >
          {{ s }}×
        </button>
      </div>
    </section>

    <!-- Repeat count + spaced drill: only where a caller actually wires it into
         playback (reader/mushaf verse grain, Today's verses-of-day tab) — hidden
         elsewhere (page grain everywhere; Listen, which is a straight-through
         whole-scope playthrough, not a per-verse drill, even when its current
         item happens to be a verse) so the control never implies an effect it
         doesn't have. See `showRepeat` prop. -->
    <section v-if="showRepeat" class="group" aria-labelledby="drill-label">
      <span id="drill-label" class="group-label">{{ t('audio.repetition') }}</span>
      <div class="drill-row">
        <div class="stepper" role="group" :aria-label="t('audio.repeatEachAria')">
          <button
            type="button"
            class="step"
            :aria-label="t('audio.fewerRepeats')"
            @click="setRepeat(store.repeatCount - 1)"
          >
            −
          </button>
          <span class="step-val">{{ t('audio.repeatEachLabel', { n: store.repeatCount }) }}</span>
          <button
            type="button"
            class="step"
            :aria-label="t('audio.moreRepeats')"
            @click="setRepeat(store.repeatCount + 1)"
          >
            +
          </button>
        </div>
        <button
          type="button"
          class="chip"
          :class="{ on: store.spaced }"
          :aria-pressed="store.spaced"
          @click="toggleSpaced()"
        >
          {{ t('audio.spacedDrill') }}
        </button>
      </div>
    </section>

    <!-- Transport companions -->
    <section class="group toggles">
      <label class="switch">
        <input type="checkbox" v-model="store.autoNext" />
        <span>{{ t('audio.autoplayNext') }}</span>
      </label>
      <label class="switch">
        <input type="checkbox" v-model="store.loopPlaylist" />
        <span>{{ t('audio.loopList') }}</span>
      </label>
      <label class="switch">
        <input type="checkbox" v-model="store.autoScroll" />
        <span>{{ t('audio.autoScroll') }}</span>
      </label>
    </section>
  </div>
</template>

<style scoped>
.tray {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 0.85rem 0.25rem 0.25rem;
  border-top: 1px solid var(--color-border);
}
.group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.group-label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.ab-row,
.drill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-height: 2.25rem;
  padding: 0 0.7rem;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: border-color var(--duration-fast), background var(--duration-fast);
}
.chip.on {
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 14%, var(--color-surface));
  color: var(--color-accent);
}
.chip:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.chip.ghost {
  border-style: dashed;
  color: var(--color-text-muted);
}
.chip.ab {
  min-width: 2.6rem;
  justify-content: center;
}
.ab-time {
  font-size: var(--text-xs);
  font-weight: 500;
  opacity: 0.8;
}
.seg {
  display: inline-flex;
  gap: 0.25rem;
  padding: 0.25rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  flex-wrap: wrap;
}
.seg-btn {
  min-height: 1.9rem;
  padding: 0 0.55rem;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background var(--duration-fast), color var(--duration-fast);
}
.seg-btn.on {
  background: var(--color-accent);
  color: var(--color-accent-contrast);
}
.stepper {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  padding: 0.15rem;
}
.step {
  width: 2rem;
  height: 2rem;
  border-radius: var(--radius-full);
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-text);
  cursor: pointer;
}
.step:hover {
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
}
.step-val {
  min-width: 4.2rem;
  text-align: center;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.toggles {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 0.75rem 1.25rem;
  padding-top: 0.15rem;
}
.switch {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
  cursor: pointer;
}
.switch input {
  width: 1.05rem;
  height: 1.05rem;
  accent-color: var(--color-accent);
}
</style>
