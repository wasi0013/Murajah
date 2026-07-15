<script setup lang="ts">
import { onMounted } from 'vue'
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()

onMounted(() => {
  // Apply the persisted/default theme to the document root.
  settings.setTheme(settings.theme)
})
</script>

<template>
  <RouterView />
</template>
