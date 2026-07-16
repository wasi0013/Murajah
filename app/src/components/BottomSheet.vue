<script setup lang="ts">
// Mobile-first bottom sheet — a Dialog pinned to the bottom edge.
import Dialog from './Dialog.vue'

const open = defineModel<boolean>('open', { default: false })
defineProps<{ label?: string; labelledby?: string }>()
</script>

<template>
  <Dialog v-model:open="open" placement="bottom" :label="label" :labelledby="labelledby">
    <template #default="{ close }">
      <slot :close="close" />
    </template>
  </Dialog>
</template>
