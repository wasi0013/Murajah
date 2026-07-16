<script setup lang="ts">
import { onMounted } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import ToastContainer from '@/components/ToastContainer.vue'

const settings = useSettingsStore()

onMounted(() => {
  // Apply the persisted/default theme to the document root.
  settings.setTheme(settings.theme)
})
</script>

<template>
  <RouterView />
  <ToastContainer />
</template>
