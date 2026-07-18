<script setup lang="ts">
import { onMounted } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import ToastContainer from '@/components/ToastContainer.vue'

const settings = useSettingsStore()

onMounted(() => {
  // Load and apply the saved theme (falls back to the default) before paint.
  void settings.hydrate()
})
</script>

<template>
  <RouterView />
  <ToastContainer />
</template>
