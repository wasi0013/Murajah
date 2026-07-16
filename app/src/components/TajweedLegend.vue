<script setup lang="ts">
// Tajweed rule → colour legend. Colours use the semantic tajweed tokens; the
// exact rule→colour mapping is verified against the rendered tajweed page font
// in the reader (task 2.7.3). Shown when tajweed is on.
const rules = [
  { key: 'ghunnah', ar: 'غُنّة', en: 'Ghunnah' },
  { key: 'qalqalah', ar: 'قلقلة', en: 'Qalqalah' },
  { key: 'ikhfa', ar: 'إخفاء', en: 'Ikhfā' },
  { key: 'madd', ar: 'مدّ', en: 'Madd' },
] as const
</script>

<template>
  <ul class="flex flex-wrap gap-x-4 gap-y-2" aria-label="Tajweed rules">
    <li v-for="r in rules" :key="r.key" class="flex items-center gap-2 text-sm">
      <span
        class="inline-block size-3.5 rounded-full"
        :style="{ background: `var(--tajweed-${r.key})` }"
        aria-hidden="true"
      />
      <span dir="rtl" style="font-family: var(--font-arabic)">{{ r.ar }}</span>
      <span class="text-text-muted">{{ r.en }}</span>
    </li>
  </ul>
</template>
