<script setup lang="ts">
// Centered modal dialog — a Dialog placed in the viewport center.
import Dialog from './Dialog.vue'

const open = defineModel<boolean>('open', { default: false })
// Redeclares its own default rather than leaving `dismissible` `undefined` for
// Dialog to default — Vue's Boolean-prop casting resolves a bound `undefined`
// to `false` here (only an *absent* attribute falls through to a child's
// default), so this must default locally or every non-dismissible-unaware
// caller of Modal (nearly all of them) would silently get a non-dismissible
// dialog.
withDefaults(defineProps<{ label?: string; labelledby?: string; dismissible?: boolean }>(), {
  dismissible: true,
})
</script>

<template>
  <Dialog
    v-model:open="open"
    placement="center"
    :label="label"
    :labelledby="labelledby"
    :dismissible="dismissible"
  >
    <template #default="{ close }">
      <slot :close="close" />
    </template>
  </Dialog>
</template>
