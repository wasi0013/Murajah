<script setup lang="ts">
import { BookOpen } from 'lucide-vue-next'
import { useSettingsStore, type ThemeName } from '@/stores/settings'

// Placeholder reader route for Phase 0. The real virtualized Quran reading
// surface (QPC uthmani + tajweed, Indopak) arrives in Phase 3.
const settings = useSettingsStore()
const themes: ThemeName[] = ['light', 'dark', 'sepia']

function cycleTheme() {
  const i = themes.indexOf(settings.theme)
  settings.setTheme(themes[(i + 1) % themes.length])
}
</script>

<template>
  <main class="grid min-h-dvh place-content-center gap-4 text-center">
    <BookOpen class="mx-auto size-8 text-accent" />
    <h1 class="text-2xl font-semibold text-text">Murajah</h1>
    <p class="text-text-muted">Reader shell — Phase 0 foundation.</p>

    <!-- Verifies Tailwind compiles + tokens switch at runtime -->
    <button
      class="mx-auto rounded-lg bg-accent px-4 py-2 text-accent-contrast transition"
      @click="cycleTheme"
    >
      Theme: {{ settings.theme }}
    </button>
  </main>
</template>
