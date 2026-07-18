<script setup lang="ts">
import { onMounted } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { hydrateLocale } from '@/core/i18n'
import ToastContainer from '@/components/ToastContainer.vue'

const settings = useSettingsStore()

onMounted(() => {
  // Load and apply the saved theme and language (each falls back to its default).
  void settings.hydrate()
  void hydrateLocale()
})
</script>

<template>
  <RouterView />
  <ToastContainer />
</template>
