<script setup lang="ts">
import { ref } from 'vue'
import { BookOpen, Search, Settings, Target, ListChecks, Play, HelpCircle, Menu } from 'lucide-vue-next'
import { useSettingsStore, type ThemeName } from '@/stores/settings'
import Icon from '@/components/Icon.vue'
import Button from '@/components/Button.vue'
import SegmentedControl from '@/components/SegmentedControl.vue'
import Toggle from '@/components/Toggle.vue'
import Slider from '@/components/Slider.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import Modal from '@/components/Modal.vue'
import Tabs from '@/components/Tabs.vue'
import Skeleton from '@/components/Skeleton.vue'
import Popover from '@/components/Popover.vue'
import BottomTabBar from '@/components/BottomTabBar.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import TajweedLegend from '@/components/TajweedLegend.vue'
import ReadingSurface from '@/features/reader/ReadingSurface.vue'
import { toast } from '@/composables/useToast'
import { onMounted } from 'vue'
import type { Jump } from '@/core/navigation/parseJump'
import { getDataClient } from '@/core/data'
import { getFontLoader } from '@/core/fonts'
import type { PageChunk, SurahNames } from '@/core/data/types'

const layout = ref('qpc')
const tafsirLang = ref('ar')
const activeTab = ref('read')
const paletteOpen = ref(false)
const navTabs = [
  { value: 'read', label: 'Read', icon: BookOpen },
  { value: 'surahs', label: 'Surahs', icon: ListChecks },
  { value: 'goals', label: 'Goals', icon: Target },
  { value: 'quiz', label: 'Quiz', icon: HelpCircle },
  { value: 'more', label: 'More', icon: Menu },
]
function onJump(j: Jump) {
  toast(`Jump → ${JSON.stringify(j)}`)
}

// Reading surface — real page-1 data + fonts.
const page1 = ref<PageChunk | null>(null)
const surahNames = ref<SurahNames>({})
const qpcFamily = ref('serif')
const tajweedFamily = ref('serif')
const surfaceTajweed = ref(true)
const wordStates = {
  '1:1:2': 'mistake',
  '1:2:2': 'morphology',
  '1:3:1': 'selected',
} as const

onMounted(async () => {
  try {
    const data = getDataClient()
    const fonts = getFontLoader()
    await Promise.all([data.init(), fonts.init()])
    ;[page1.value, surahNames.value, qpcFamily.value, tajweedFamily.value] = await Promise.all([
      data.getPage('qpc', 1),
      data.getSurahNames(),
      fonts.ensure({ layout: 'qpc', page: 1 }),
      fonts.ensure({ layout: 'qpc', page: 1, tajweed: true }),
    ])
  } catch (err) {
    toast(`Reading surface failed: ${err instanceof Error ? err.message : String(err)}`, {
      variant: 'error',
    })
  }
})
const tajweedOn = ref(true)
const wbw = ref(false)
const textSize = ref(2)
const sheetOpen = ref(false)
const modalOpen = ref(false)

// Dev/design gallery — every primitive in every theme + RTL. Code-split, so it
// never enters the reader bundle. Grows as Phase 2 primitives land.
const settings = useSettingsStore()
const themes: ThemeName[] = ['light', 'dark', 'sepia']
const rtl = ref(false)

const swatches = [
  'bg', 'surface', 'elevated', 'border', 'text', 'text-muted',
  'accent', 'success', 'warn', 'danger',
]
const tajweed = ['ghunnah', 'qalqalah', 'ikhfa', 'madd']
</script>

<template>
  <div class="min-h-dvh bg-bg text-text" :dir="rtl ? 'rtl' : 'ltr'">
    <!-- Controls -->
    <header
      class="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-border bg-surface/90 px-5 py-3 backdrop-blur"
    >
      <strong class="me-auto text-lg">Murajah · Design Gallery</strong>
      <div class="flex gap-1.5">
        <Button
          v-for="t in themes"
          :key="t"
          size="sm"
          :variant="settings.theme === t ? 'primary' : 'secondary'"
          @click="settings.setTheme(t)"
        >
          {{ t }}
        </Button>
      </div>
      <Button size="sm" variant="secondary" @click="rtl = !rtl">
        dir: {{ rtl ? 'RTL' : 'LTR' }}
      </Button>
    </header>

    <main class="mx-auto grid grid-cols-1 max-w-4xl gap-12 px-5 py-10">
      <!-- Colors -->
      <section class="grid gap-4">
        <h2 class="text-xl font-semibold">Color roles</h2>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div v-for="s in swatches" :key="s" class="grid gap-1.5">
            <div
              class="h-14 rounded-lg border border-border"
              :style="{ background: `var(--color-${s})` }"
            />
            <code class="text-xs text-text-muted">{{ s }}</code>
          </div>
        </div>
        <h3 class="mt-2 text-sm font-medium text-text-muted">Tajweed (functional)</h3>
        <div class="flex flex-wrap gap-4">
          <span v-for="t in tajweed" :key="t" class="flex items-center gap-2 text-sm">
            <span
              class="inline-block size-4 rounded-full"
              :style="{ background: `var(--tajweed-${t})` }"
              aria-hidden="true"
            />
            {{ t }}
          </span>
        </div>
      </section>

      <!-- Typography -->
      <section class="grid gap-4">
        <h2 class="text-xl font-semibold">Typography</h2>
        <p class="text-3xl" style="letter-spacing: var(--tracking-tight)">Display 3xl — Murajah</p>
        <p class="text-2xl">Heading 2xl — memorize &amp; revise</p>
        <p class="text-lg">Large — daily revision keeps ḥifẓ alive.</p>
        <p class="text-base max-w-[65ch] text-text-muted">
          Base body. The reading surface uses the real mushaf fonts; this is UI text in the
          native system stack, covering Latin and বাংলা (Bengali) for the subcontinent base.
        </p>
        <div class="grid gap-2 rounded-lg border border-border bg-surface p-4" dir="rtl">
          <span
            v-for="(sz, i) in ['sm', 'md', 'lg']"
            :key="i"
            :style="{
              fontFamily: 'var(--font-arabic)',
              fontSize: `var(--reading-size-${sz})`,
              lineHeight: 'var(--qpc-line-height)',
            }"
          >
            بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
          </span>
        </div>
      </section>

      <!-- Icons -->
      <section class="grid gap-4">
        <h2 class="text-xl font-semibold">Icons</h2>
        <div class="flex flex-wrap gap-5 text-text">
          <Icon :icon="BookOpen" label="Read" />
          <Icon :icon="Search" label="Search" />
          <Icon :icon="ListChecks" label="Surahs" />
          <Icon :icon="Target" label="Goals" />
          <Icon :icon="Play" label="Play" />
          <Icon :icon="Settings" :size="28" class="text-accent" label="Settings" />
        </div>
      </section>

      <!-- Buttons -->
      <section class="grid gap-4">
        <h2 class="text-xl font-semibold">Button</h2>
        <div class="flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
          <Button variant="primary"><Icon :icon="Play" :size="18" /> With icon</Button>
        </div>
      </section>

      <!-- Form controls -->
      <section class="grid gap-5">
        <h2 class="text-xl font-semibold">Form controls</h2>
        <div class="flex flex-wrap items-center gap-8">
          <label class="grid gap-1.5 text-sm text-text-muted">
            Layout
            <SegmentedControl
              v-model="layout"
              label="Reading layout"
              :options="[
                { value: 'qpc', label: 'Madani' },
                { value: 'indopak', label: 'Indopak' },
              ]"
            />
          </label>
          <label class="flex items-center gap-2.5 text-sm">
            <Toggle v-model="tajweedOn" label="Tajweed" /> Tajweed
          </label>
          <label class="flex items-center gap-2.5 text-sm">
            <Toggle v-model="wbw" label="Word by word" /> Word-by-word
          </label>
        </div>
        <label class="grid max-w-xs gap-1.5 text-sm text-text-muted">
          Text size — step {{ textSize }}
          <Slider v-model="textSize" :min="1" :max="5" :step="1" label="Text size" />
        </label>
      </section>

      <!-- Overlays -->
      <section class="grid gap-4">
        <h2 class="text-xl font-semibold">Overlays</h2>
        <div class="flex flex-wrap gap-3">
          <Button variant="secondary" @click="sheetOpen = true">Open bottom sheet</Button>
          <Button variant="secondary" @click="modalOpen = true">Open modal</Button>
        </div>

        <BottomSheet v-model:open="sheetOpen" label="Reading settings">
          <template #default="{ close }">
            <h3 class="mb-3 text-lg font-semibold">Reading settings</h3>
            <div class="grid gap-4">
              <label class="flex items-center justify-between text-sm">
                Tajweed <Toggle v-model="tajweedOn" label="Tajweed" />
              </label>
              <label class="flex items-center justify-between text-sm">
                Word-by-word <Toggle v-model="wbw" label="Word by word" />
              </label>
              <Button block @click="close">Done</Button>
            </div>
          </template>
        </BottomSheet>

        <Modal v-model:open="modalOpen" label="Reset progress">
          <template #default="{ close }">
            <h3 class="mb-2 text-lg font-semibold">Reset progress?</h3>
            <p class="mb-5 text-sm text-text-muted">
              This clears memorized pages and mistakes on this device. This can't be undone.
            </p>
            <div class="flex justify-end gap-2">
              <Button variant="ghost" @click="close">Cancel</Button>
              <Button variant="danger" @click="close">Reset</Button>
            </div>
          </template>
        </Modal>
      </section>

      <!-- Tabs -->
      <section class="grid gap-4">
        <h2 class="text-xl font-semibold">Tabs</h2>
        <Tabs
          v-model="tafsirLang"
          label="Tafsir language"
          :tabs="[
            { value: 'ar', label: 'العربية' },
            { value: 'en', label: 'English' },
            { value: 'bn', label: 'বাংলা' },
          ]"
        >
          <template #default="{ active }">
            <p class="max-w-[60ch] text-sm text-text-muted">
              Tafsir panel for <b class="text-text">{{ active }}</b> — the reader swaps
              per-surah tafsir chunks here (Phase 3/8).
            </p>
          </template>
        </Tabs>
      </section>

      <!-- Feedback: Popover, Toast, Skeleton -->
      <section class="grid gap-5">
        <h2 class="text-xl font-semibold">Feedback</h2>

        <div class="flex flex-wrap items-center gap-3">
          <Popover label="Word morphology">
            <template #trigger>
              <Button variant="secondary">Tap a word</Button>
            </template>
            <template #default>
              <p class="text-sm font-semibold" style="font-family: var(--font-arabic)" dir="rtl">
                الْحَمْدُ
              </p>
              <p class="mt-1 text-xs text-text-muted">noun · definite · nominative — "the praise"</p>
            </template>
          </Popover>

          <Button variant="secondary" @click="toast('Marked page as memorized', { variant: 'success' })">
            Success toast
          </Button>
          <Button variant="secondary" @click="toast('Could not save — retry', { variant: 'error' })">
            Error toast
          </Button>
        </div>

        <div class="grid max-w-sm gap-2">
          <Skeleton width="60%" height="1.25rem" />
          <Skeleton height="1rem" />
          <Skeleton width="80%" height="1rem" />
        </div>
      </section>

      <!-- Reading surface (real page 1) -->
      <section class="grid gap-4">
        <div class="flex flex-wrap items-center gap-4">
          <h2 class="me-auto text-xl font-semibold">Reading surface — page 1</h2>
          <label class="flex items-center gap-2 text-sm">
            <Toggle v-model="surfaceTajweed" label="Tajweed" /> Tajweed
          </label>
        </div>
        <TajweedLegend v-if="surfaceTajweed" />
        <div class="mx-auto w-full max-w-md overflow-x-auto rounded-xl border border-border bg-surface p-3 shadow-sm">
          <ReadingSurface
            v-if="page1"
            :page="page1"
            :font-family="surfaceTajweed ? tajweedFamily : qpcFamily"
            :surah-names="surahNames"
            :word-states="wordStates"
          />
          <p v-else class="p-8 text-center text-sm text-text-muted">loading page…</p>
        </div>
        <p class="text-sm text-text-muted">
          Word states — <span class="text-danger">mistake (wavy underline)</span>,
          morphology-active (accent tint), selected (raised). The real reader wraps this with
          virtualization + tap interaction in Phase 3.
        </p>
      </section>

      <!-- Navigation shell -->
      <section class="grid gap-4">
        <h2 class="text-xl font-semibold">Navigation</h2>
        <div>
          <Button variant="secondary" @click="paletteOpen = true">
            <Icon :icon="Search" :size="16" /> Quick jump (⌘K)
          </Button>
        </div>
        <div class="max-w-sm overflow-hidden rounded-lg border border-border">
          <BottomTabBar v-model="activeTab" :tabs="navTabs" />
        </div>
        <p class="text-sm text-text-muted">Active tab: <b class="text-text">{{ activeTab }}</b></p>
        <CommandPalette v-model:open="paletteOpen" :shortcut="false" @select="onJump" />
      </section>
    </main>
  </div>
</template>
