<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { BookOpen, Brain, CalendarCheck, GraduationCap, Headphones, Home, ListOrdered, Menu, Radio, Settings } from 'lucide-vue-next'
import { useSettingsStore } from '@/stores/settings'
import { useReaderStore } from '@/stores/reader'
import { hydrateLocale, useI18n } from '@/core/i18n'
import { mushafLink } from '@/core/navigation/readerLinks'
import ToastContainer from '@/components/ToastContainer.vue'
import BottomTabBar from '@/components/BottomTabBar.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import Icon from '@/components/Icon.vue'

const { t } = useI18n()
const settings = useSettingsStore()
const router = useRouter()
const reader = useReaderStore()

onMounted(() => {
  // Load and apply the saved theme and language (each falls back to its default).
  void settings.hydrate()
  void hydrateLocale()
})

/**
 * Primary shell nav (redesign 2026 P1): every screen gets the same tab bar,
 * with the active tab derived from the current route rather than local state,
 * so deep links and back/forward navigation stay in sync. Quiz, Listen, Live
 * and Settings share the "More" sheet — there's only room for so many
 * top-level tabs, and none of those four is a daily-loop surface the way
 * Today/Progress/Mushaf/Surahs are.
 */
const READER_ROUTE_NAMES = new Set(['home', 'reader', 'read-page', 'read-surah', 'read-ayah', 'read-slug'])
const MORE_ROUTE_NAMES = new Set(['quiz', 'listen', 'live', 'settings'])
// The disabled-reader placeholder has nowhere useful for the tabs to lead.
const NO_SHELL_ROUTE_NAMES = new Set(['reader-disabled'])

const showShellNav = computed(() => !NO_SHELL_ROUTE_NAMES.has(String(router.currentRoute.value.name)))

const activeTab = computed(() => {
  const name = String(router.currentRoute.value.name)
  if (READER_ROUTE_NAMES.has(name)) return 'home'
  if (name === 'mushaf') return 'mushaf'
  if (name === 'contents') return 'surahs'
  if (name === 'today') return 'today'
  if (name === 'progress') return 'progress'
  if (MORE_ROUTE_NAMES.has(name)) return 'more'
  return ''
})

const tabs = computed(() => [
  { value: 'home', label: t('common.tabs.home'), icon: Home },
  { value: 'mushaf', label: t('common.tabs.mushaf'), icon: BookOpen },
  { value: 'surahs', label: t('common.tabs.surahs'), icon: ListOrdered },
  { value: 'today', label: t('common.tabs.today'), icon: CalendarCheck },
  { value: 'progress', label: t('common.tabs.progress'), icon: Brain },
  { value: 'more', label: t('common.tabs.more'), icon: Menu },
])

const moreOpen = ref(false)

function onTabSelect(tab: string) {
  if (tab === 'more') {
    moreOpen.value = true
    return
  }
  if (tab === activeTab.value) return // already there
  if (tab === 'home') void router.push({ name: 'home' })
  // QPC pages share the mushaf's 604-page scheme, so hand off the current
  // page; from Indopak (a different page count) the mushaf restores its own
  // last page instead of landing on a mismatched one.
  else if (tab === 'mushaf') {
    void router.push(reader.layout === 'qpc' ? mushafLink(reader.page) : { name: 'mushaf' })
  } else if (tab === 'surahs') void router.push({ name: 'contents' })
  else if (tab === 'today') void router.push({ name: 'today' })
  else if (tab === 'progress') void router.push({ name: 'progress' })
}

function goMore(name: string) {
  moreOpen.value = false
  void router.push({ name })
}
</script>

<template>
  <div class="app-shell">
    <div class="app-content">
      <RouterView />
    </div>
    <BottomTabBar
      v-if="showShellNav"
      class="shell-tabbar"
      :model-value="activeTab"
      :tabs="tabs"
      @update:model-value="onTabSelect"
    />
  </div>
  <ToastContainer />

  <BottomSheet v-model:open="moreOpen" :label="t('common.tabs.more')">
    <div class="more-menu">
      <h2 class="more-title">{{ t('common.tabs.more') }}</h2>
      <button class="more-item" type="button" @click="goMore('quiz')">
        <Icon :icon="GraduationCap" :size="18" />
        <span class="more-label">
          <span class="more-name">{{ t('common.moreQuiz') }}</span>
          <span class="more-sub">{{ t('common.moreQuizSub') }}</span>
        </span>
      </button>
      <button class="more-item" type="button" @click="goMore('listen')">
        <Icon :icon="Headphones" :size="18" />
        <span class="more-label">
          <span class="more-name">{{ t('common.moreListen') }}</span>
          <span class="more-sub">{{ t('common.moreListenSub') }}</span>
        </span>
      </button>
      <button class="more-item" type="button" @click="goMore('live')">
        <Icon :icon="Radio" :size="18" />
        <span class="more-label">
          <span class="more-name">{{ t('common.moreLive') }}</span>
          <span class="more-sub">{{ t('common.moreLiveSub') }}</span>
        </span>
      </button>
      <button class="more-item" type="button" @click="goMore('settings')">
        <Icon :icon="Settings" :size="18" />
        <span class="more-label">
          <span class="more-name">{{ t('common.moreSettings') }}</span>
          <span class="more-sub">{{ t('common.moreSettingsSub') }}</span>
        </span>
      </button>
    </div>
  </BottomSheet>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}
.app-content {
  flex: 1 0 auto;
  min-width: 0;
}
.shell-tabbar {
  position: sticky;
  bottom: 0;
  z-index: var(--z-sticky);
}
@media (min-width: 1024px) {
  .app-shell {
    flex-direction: row;
  }
  .shell-tabbar {
    order: -1;
    flex: 0 0 auto;
    position: sticky;
    top: 0;
    bottom: auto;
    height: 100dvh;
  }
}

.more-menu {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0 1rem 1rem;
}
.more-title {
  font-size: var(--text-lg);
  font-weight: 600;
  margin: 0 0 0.25rem;
}
.more-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0.5rem;
  border: none;
  background: none;
  border-radius: var(--radius-md);
  color: var(--color-text);
  text-align: start;
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-standard);
}
.more-item:hover,
.more-item:focus-visible {
  background: var(--color-elevated);
}
.more-item:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
.more-label {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.more-name {
  font-size: var(--text-base);
  font-weight: 500;
}
.more-sub {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
</style>
