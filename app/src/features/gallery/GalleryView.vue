<script setup lang="ts">
import { ref } from 'vue'
import { BookOpen, Search, Settings, Target, ListChecks, Play } from 'lucide-vue-next'
import { useSettingsStore, type ThemeName } from '@/stores/settings'
import Icon from '@/components/Icon.vue'
import Button from '@/components/Button.vue'

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

    <main class="mx-auto grid max-w-4xl gap-12 px-5 py-10">
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
          <span
            v-for="t in tajweed"
            :key="t"
            class="text-lg font-semibold"
            :style="{ color: `var(--tajweed-${t})` }"
          >
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
    </main>
  </div>
</template>
