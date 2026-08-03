<script setup lang="ts">
import { ref } from 'vue'
import { Check } from 'lucide-vue-next'
import { useOnboardingStore } from '@/stores/onboarding'
import { useI18n } from '@/core/i18n'
import { LOCALE_LIST, LOCALES, type Locale } from '@/core/i18n/types'
import Modal from '@/components/Modal.vue'
import Icon from '@/components/Icon.vue'

/**
 * First-run gate: a required language pick before the user sees anything
 * else. Non-dismissible (see Dialog's `dismissible` prop) — there's no
 * sensible "skip" for the one choice every other string in the app depends
 * on. Picking a language applies it immediately (live preview — this
 * modal's own hint/button copy and the document's dir/lang switch right
 * away); "Continue" just confirms and records that onboarding ran (see
 * useOnboardingStore).
 */
const onboarding = useOnboardingStore()
const { t, setLocale } = useI18n()

// Tracked separately from the reactive `locale` (which only updates once its
// catalog finishes loading — instant for `en`, a tick later for ar/bn) so the
// pick is highlighted the moment it's tapped, not after the network round trip.
const pickedLocale = ref<Locale | null>(null)

function choose(loc: Locale) {
  pickedLocale.value = loc
  void setLocale(loc)
}

function finish() {
  if (!pickedLocale.value) return
  onboarding.complete()
}
</script>

<template>
  <Modal :open="onboarding.active" :dismissible="false" :animate="false" :label="t('onboarding.title')">
    <div class="onboarding">
      <h2 class="onboarding-title">
        <span lang="en">Choose your language</span>
        <span lang="bn">আপনার ভাষা বেছে নিন</span>
        <span lang="ar" dir="rtl">اختر لغتك</span>
      </h2>

      <div class="onboarding-options" role="radiogroup" :aria-label="t('onboarding.title')">
        <button
          v-for="l in LOCALE_LIST"
          :key="l"
          type="button"
          role="radio"
          :aria-checked="pickedLocale === l"
          class="onboarding-option"
          :class="{ 'is-selected': pickedLocale === l }"
          @click="choose(l)"
        >
          <span class="onboarding-option-text">
            <span class="onboarding-option-native" :dir="LOCALES[l].dir">{{ LOCALES[l].native }}</span>
            <span class="onboarding-option-label">{{ LOCALES[l].label }}</span>
          </span>
          <Icon v-if="pickedLocale === l" :icon="Check" :size="18" class="onboarding-check" />
        </button>
      </div>

      <p v-if="pickedLocale" class="onboarding-hint">{{ t('onboarding.hint') }}</p>

      <button class="onboarding-continue" type="button" :disabled="!pickedLocale" @click="finish">
        {{ t('onboarding.continue') }}
      </button>
    </div>
  </Modal>
</template>

<style scoped>
.onboarding {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.onboarding-title {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font-size: var(--text-lg);
  font-weight: 600;
  text-align: center;
}
.onboarding-options {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.onboarding-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  height: 3.25rem;
  padding: 0 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
  transition:
    border-color var(--duration-fast) var(--ease-standard),
    background var(--duration-fast) var(--ease-standard);
}
.onboarding-option:hover {
  background: var(--color-elevated);
}
.onboarding-option:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.onboarding-option.is-selected {
  border-color: var(--color-accent);
  background: var(--color-elevated);
}
.onboarding-option-text {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}
.onboarding-option-native {
  font-size: var(--text-base);
  font-weight: 600;
}
.onboarding-option-label {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.onboarding-check {
  color: var(--color-accent);
  flex-shrink: 0;
}
.onboarding-hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  text-align: center;
  margin: -0.5rem 0 0;
}
.onboarding-continue {
  height: 2.75rem;
  border-radius: var(--radius-md);
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
}
.onboarding-continue:disabled {
  opacity: 0.5;
  cursor: default;
}
.onboarding-continue:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
