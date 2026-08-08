<script setup lang="ts">
import { useRoute } from 'vue-router'

/**
 * Shareable, read-only verse-range preview (`/preview/:surah/:range`) — a
 * link's complete state, always Uthmani tajweed, independent of the visitor's
 * own reader prefs (see plans/preview-route task list). This is a routing
 * stub: it proves the route resolves and carries the right params; the real
 * parsing/rendering land in later tasks. Deliberately does not import
 * `@/stores/reader` — the whole point of this view is to ignore it.
 */
const route = useRoute()
</script>

<template>
  <main class="preview-stub">
    <p>surah: {{ route.params.surah }}</p>
    <p>ayah: {{ route.params.ayah }}</p>
    <p>endAyah: {{ route.params.endAyah }}</p>
  </main>
</template>
