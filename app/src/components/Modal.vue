<script setup lang="ts">
// Centered modal dialog — a Dialog placed in the viewport center.
import Dialog from './Dialog.vue'

const open = defineModel<boolean>('open', { default: false })
// Redeclares its own defaults rather than leaving these `undefined` for Dialog
// to default — Vue's Boolean-prop casting resolves a bound `undefined` to
// `false` here (only an *absent* attribute falls through to a child's
// default), so these must default locally or every caller of Modal that
// doesn't pass them (nearly all of them) would silently get a non-dismissible,
// non-animated dialog.
withDefaults(
  defineProps<{ label?: string; labelledby?: string; dismissible?: boolean; animate?: boolean }>(),
  { dismissible: true, animate: true },
)
</script>

<template>
  <Dialog
    v-model:open="open"
    placement="center"
    :label="label"
    :labelledby="labelledby"
    :dismissible="dismissible"
    :animate="animate"
  >
    <template #default="{ close }">
      <slot :close="close" />
    </template>
  </Dialog>
</template>
