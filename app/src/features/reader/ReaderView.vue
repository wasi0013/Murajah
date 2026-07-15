<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { BookOpen } from 'lucide-vue-next'
import { useSettingsStore, type ThemeName } from '@/stores/settings'
import { getDataClient } from '@/core/data'

// Placeholder reader route. The real virtualized reading surface (QPC uthmani +
// tajweed, Indopak) arrives in Phase 3. For now it proves the Phase 1 data path:
// the DataClient loads a page's chunk through the Web Worker, off the main thread.
const settings = useSettingsStore()
const themes: ThemeName[] = ['light', 'dark', 'sepia']

const status = ref('loading…')
const firstWord = ref('')

function cycleTheme() {
  const i = themes.indexOf(settings.theme)
  settings.setTheme(themes[(i + 1) % themes.length])
}

onMounted(async () => {
  try {
    const data = getDataClient()
    await data.init()
    const page = await data.getPage('qpc', 1)
    firstWord.value = page.words[0]?.text ?? ''
    status.value = `page 1 · ${page.words.length} words · ${page.layout.length} lines`
  } catch (err) {
    status.value = `data error: ${err instanceof Error ? err.message : String(err)}`
  }
})
</script>

<template>
  <main class="grid min-h-dvh place-content-center gap-4 text-center">
    <BookOpen class="mx-auto size-8 text-accent" />
    <h1 class="text-2xl font-semibold text-text">Murajah</h1>
    <p class="text-text-muted">Reader shell — Phase 1 data path.</p>

    <p class="font-mono text-sm text-text-muted" data-testid="page-status">{{ status }}</p>
    <p
      class="text-3xl"
      style="font-family: 'QPCPage', serif"
      lang="ar"
      dir="rtl"
      data-testid="first-word"
    >
      {{ firstWord }}
    </p>

    <button
      class="mx-auto rounded-lg bg-accent px-4 py-2 text-accent-contrast transition"
      @click="cycleTheme"
    >
      Theme: {{ settings.theme }}
    </button>
  </main>
</template>
