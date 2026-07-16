<script setup lang="ts">
// Centered modal dialog — a Dialog placed in the viewport center.
import Dialog from './Dialog.vue'

const open = defineModel<boolean>('open', { default: false })
defineProps<{ label?: string; labelledby?: string }>()
</script>

<template>
  <Dialog v-model:open="open" placement="center" :label="label" :labelledby="labelledby">
    <template #default="{ close }">
      <slot :close="close" />
    </template>
  </Dialog>
</template>
