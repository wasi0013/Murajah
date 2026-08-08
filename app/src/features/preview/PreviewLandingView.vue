<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, BookOpen, Palette, Share2, Eye } from 'lucide-vue-next'
import { getDataClient } from '@/core/data'
import type { SurahNames } from '@/core/data/types'
import { previewLink, type HighlightColor } from '@/core/navigation/previewRoute'
import { usePreviewRangeFields, surahOptionLabel } from '@/composables/usePreviewRangeFields'
import { useI18n } from '@/core/i18n'
import Icon from '@/components/Icon.vue'
import PreviewColorBar from '@/features/preview/PreviewColorBar.vue'

/**
 * `/preview` (no params) — a standalone, beginner-friendly landing page for
 * the shareable verse-range viewer (see `PreviewView.vue`'s own doc comment
 * for that route). Two jobs: teach a non-technical visitor what a preview
 * link is and how to mark it up (a short numbered walkthrough plus a
 * throwaway tap-to-paint demo that touches no real Qur'an data), then let
 * them build their own via the same surah/from/to dropdowns `PreviewJumpSheet`
 * uses in-page — `usePreviewRangeFields` is the shared piece so the two
 * pickers can never drift on the surah-change/inverted-range rules.
 *
 * Standalone chrome, same as `/preview/:surah/:ayah` — reached from outside
 * the app (a link shared to a beginner) just as often as from inside it, so
 * it carries its own header rather than the shell tab bar (see `App.vue`'s
 * `NO_SHELL_ROUTE_NAMES`/`NO_ONBOARDING_ROUTE_NAMES`).
 */
const { t } = useI18n()
const router = useRouter()

const surahNames = ref<SurahNames>({})
onMounted(async () => {
  try {
    const data = getDataClient()
    await data.init()
    surahNames.value = await data.getSurahNames()
  } catch {
    /* surah name is chrome-only, non-critical */
  }
})

// —— "Build your own link" ——————————————————————————————————————
const { surah, start, end, startOptions, endOptions, onSurahChange, onStartChange } = usePreviewRangeFields({
  surah: 1,
  start: 1,
  end: 1,
})
const surahNumbers = Array.from({ length: 114 }, (_, i) => i + 1)

function surahLabel(n: number): string {
  return surahOptionLabel(surahNames.value, n)
}

function createLink() {
  void router.push(previewLink({ surah: surah.value, start: start.value, end: end.value }))
}

// A fixed, real example (Al-Fatihah, two colors already marked) — one tap
// to see the finished product before committing to picking a passage.
const exampleLink = {
  name: 'preview-range',
  params: { surah: '1', ayah: '1', endAyah: '7' },
  query: { red: '1', blue: '4' },
}

// —— Throwaway tap-to-paint demo —————————————————————————————————
// Deliberately not real Qur'an data or the real word-tap plumbing — just
// enough to let a first-time visitor feel "tap a color, then tap a word"
// before trying it for real on their own link. Nothing here is persisted or
// reflected in the URL.
const demoColor = ref<HighlightColor>('red')
const demoWords = ['بِسْمِ', 'اللَّهِ', 'الرَّحْمَٰنِ', 'الرَّحِيمِ']
const demoMarks = ref<(HighlightColor | null)[]>(demoWords.map(() => null))

// Same palette the real highlighter renders with (ReadingSurface.vue's
// `.state-hl-*`/`.state-mistake`: colored text + a wavy underline) — kept
// local since the demo paints inline styles rather than the real state
// classes (those live scoped inside ReadingSurface.vue's own `<style>`).
const DEMO_COLOR_VAR: Record<HighlightColor, string> = {
  red: 'var(--color-danger)',
  amber: 'var(--hl-amber)',
  blue: 'var(--hl-blue)',
  green: 'var(--hl-green)',
  purple: 'var(--hl-purple)',
  teal: 'var(--hl-teal)',
}

function toggleDemoWord(i: number) {
  demoMarks.value[i] = demoMarks.value[i] ? null : demoColor.value
}
function demoWordStyle(i: number): Record<string, string> | undefined {
  const color = demoMarks.value[i]
  if (!color) return undefined
  const v = DEMO_COLOR_VAR[color]
  return { color: v, textDecorationColor: v }
}
</script>

<template>
  <main class="landing">
    <header class="landing-header">
      <RouterLink :to="{ name: 'home' }" class="icon-btn" :aria-label="t('preview.landing.backHome')">
        <Icon :icon="ArrowLeft" :size="20" />
      </RouterLink>
      <h1 class="landing-title">{{ t('preview.landing.title') }}</h1>
      <RouterLink :to="{ name: 'download' }" class="icon-btn logo-link" :aria-label="t('pwa.installTitle')">
        <img src="/pwa-icon-192.png" alt="" width="28" height="28" class="logo-img" />
      </RouterLink>
    </header>

    <div class="landing-body">
      <div class="landing-hero">
        <h2 class="landing-hero-title">{{ t('preview.landing.heroTitle') }}</h2>
        <p class="landing-intro">{{ t('preview.landing.intro') }}</p>
      </div>

      <section class="landing-section" aria-labelledby="how-heading">
        <h2 id="how-heading" class="section-heading">{{ t('preview.landing.howItWorks') }}</h2>
        <ol class="steps">
          <li class="step">
            <span class="step-icon"><Icon :icon="BookOpen" :size="20" /></span>
            <span class="step-text">
              <span class="step-title">{{ t('preview.landing.step1Title') }}</span>
              <span class="step-body">{{ t('preview.landing.step1Body') }}</span>
            </span>
          </li>
          <li class="step">
            <span class="step-icon"><Icon :icon="Palette" :size="20" /></span>
            <span class="step-text">
              <span class="step-title">{{ t('preview.landing.step2Title') }}</span>
              <span class="step-body">{{ t('preview.landing.step2Body') }}</span>
            </span>
          </li>
          <li class="step">
            <span class="step-icon"><Icon :icon="Share2" :size="20" /></span>
            <span class="step-text">
              <span class="step-title">{{ t('preview.landing.step3Title') }}</span>
              <span class="step-body">{{ t('preview.landing.step3Body') }}</span>
            </span>
          </li>
          <li class="step">
            <span class="step-icon"><Icon :icon="Eye" :size="20" /></span>
            <span class="step-text">
              <span class="step-title">{{ t('preview.landing.step4Title') }}</span>
              <span class="step-body">{{ t('preview.landing.step4Body') }}</span>
            </span>
          </li>
        </ol>
      </section>

      <section class="landing-section" aria-labelledby="demo-heading">
        <h2 id="demo-heading" class="section-heading">{{ t('preview.landing.demoLabel') }}</h2>
        <p class="demo-hint">{{ t('preview.landing.demoHint') }}</p>
        <PreviewColorBar v-model="demoColor" class="demo-colors" />
        <p class="demo-words" dir="rtl" lang="ar">
          <button
            v-for="(w, i) in demoWords"
            :key="i"
            type="button"
            class="demo-word"
            :class="{ 'demo-word-marked': demoMarks[i] }"
            :style="demoWordStyle(i)"
            @click="toggleDemoWord(i)"
          >
            {{ w }}
          </button>
        </p>
        <RouterLink :to="exampleLink" class="example-link">{{ t('preview.landing.exampleLink') }}</RouterLink>
      </section>

      <section class="landing-section" aria-labelledby="create-heading">
        <h2 id="create-heading" class="section-heading">{{ t('preview.landing.createTitle') }}</h2>
        <p class="create-body">{{ t('preview.landing.createBody') }}</p>
        <form class="create-form" @submit.prevent="createLink">
          <label class="field">
            <span class="field-label">{{ t('preview.jumpSurah') }}</span>
            <select v-model.number="surah" class="field-select" dir="auto" @change="onSurahChange">
              <option v-for="n in surahNumbers" :key="n" :value="n">{{ surahLabel(n) }}</option>
            </select>
          </label>
          <div class="field-row">
            <label class="field">
              <span class="field-label">{{ t('preview.jumpFrom') }}</span>
              <select v-model.number="start" class="field-select" @change="onStartChange">
                <option v-for="n in startOptions" :key="n" :value="n">{{ n }}</option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">{{ t('preview.jumpTo') }}</span>
              <select v-model.number="end" class="field-select">
                <option v-for="n in endOptions" :key="n" :value="n">{{ n }}</option>
              </select>
            </label>
          </div>
          <p class="create-hint" role="note">{{ t('preview.landing.createHint') }}</p>
          <button type="submit" class="create-submit">{{ t('preview.landing.createButton') }}</button>
        </form>
      </section>
    </div>
  </main>
</template>

<style scoped>
.landing {
  min-height: 100dvh;
  background: var(--color-bg);
  color: var(--color-text);
}
.landing-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  background: var(--color-bg);
  z-index: var(--z-sticky);
}
.icon-btn {
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: var(--radius-md);
  color: var(--color-text);
  flex: 0 0 auto;
}
.icon-btn:hover,
.icon-btn:focus-visible {
  background: var(--color-elevated);
}
.icon-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
.landing-title {
  flex: 1 1 auto;
  font-size: var(--text-base);
  font-weight: 600;
  text-align: center;
}
.logo-img {
  border-radius: var(--radius-sm);
}

.landing-body {
  max-width: 34rem;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}
.landing-hero {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.landing-hero-title {
  font-size: var(--text-xl);
  font-weight: 700;
  line-height: 1.3;
}
.landing-intro {
  font-size: var(--text-base);
  color: var(--color-text-muted);
  line-height: 1.6;
}
.landing-section {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}
.section-heading {
  font-size: var(--text-lg);
  font-weight: 600;
}

.steps {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  list-style: none;
}
.step {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
}
.step-icon {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-full);
  background: var(--color-elevated);
  color: var(--color-accent);
}
.step-text {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding-top: 0.3rem;
}
.step-title {
  font-weight: 600;
  font-size: var(--text-base);
}
.step-body {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: 1.5;
}

.demo-hint {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.demo-colors {
  align-self: flex-start;
}
.demo-words {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-elevated);
  font-size: 1.6rem;
  line-height: 1.9;
}
.demo-word {
  border-radius: var(--radius-sm);
  padding: 0.1em 0.2em;
  color: var(--color-text);
}
.demo-word-marked {
  text-decoration: underline wavy;
  text-underline-offset: 0.35em;
}
.demo-word:hover {
  background: var(--color-bg);
}
.demo-word:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.example-link {
  align-self: flex-start;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-accent);
}
.example-link:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.create-body {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.create-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.field-row {
  display: flex;
  gap: 0.75rem;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex: 1 1 0;
  min-width: 0;
}
.field-label {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.field-select {
  height: 2.75rem;
  padding: 0 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-elevated);
  color: var(--color-text);
  font-size: var(--text-sm);
  width: 100%;
}
.field-select:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.create-submit {
  height: 2.75rem;
  border-radius: var(--radius-md);
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-size: var(--text-sm);
  font-weight: 600;
}
.create-submit:hover {
  background: var(--color-accent-hover);
}
.create-submit:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.create-hint {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: 1.5;
  padding: 0.75rem 0.9rem;
  border-radius: var(--radius-md);
  border-inline-start: 3px solid var(--color-accent);
  background: var(--color-elevated);
}
</style>
