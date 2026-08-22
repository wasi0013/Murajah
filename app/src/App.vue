<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { BookOpen, Brain, CalendarCheck, GraduationCap, Headphones, Home, ListOrdered, MessageCircle, Radio, Settings, Store } from 'lucide-vue-next'
import { useSettingsStore } from '@/stores/settings'
import { useReaderStore } from '@/stores/reader'
import { useOnboardingStore } from '@/stores/onboarding'
import { hydrateLocale, useI18n } from '@/core/i18n'
import { useListeningTime } from '@/composables/useListeningTime'
import { useProgressPersistence } from '@/composables/useProgressPersistence'
import { mushafLink } from '@/core/navigation/readerLinks'
import { DISCORD_URL, PLAY_STORE_URL } from '@/core/links'
import ToastContainer from '@/components/ToastContainer.vue'
import BottomTabBar from '@/components/BottomTabBar.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import OnboardingModal from '@/components/OnboardingModal.vue'
import Icon from '@/components/Icon.vue'

const { t } = useI18n()
const settings = useSettingsStore()
const router = useRouter()
const reader = useReaderStore()
const onboarding = useOnboardingStore()

// Kicked off here (component setup) rather than onMounted — these are pure
// IndexedDB reads with no DOM dependency, so there's no reason to wait for
// the initial mount to fire before starting them.
// Load and apply the saved theme and language (each falls back to its default)
// — these affect the reader's own paint, so they stay on the critical path.
void settings.hydrate()
void hydrateLocale()
// Load once here and keep its debounced save watcher alive for the app's
// whole lifetime — every view's own `hydrate()` call (see useProgressPersistence)
// just awaits this same load, so no route can be missing a save path for
// progress mutated from outside its own lifetime (e.g. useListeningTime below).
void useProgressPersistence().hydrate()
useListeningTime()

// Never-onboarded (first visit) or a fresh install after "Reset app" — both
// leave no `onboardingCompleted` pref, so this decides whether to show it.
void onboarding.hydrate()

/**
 * Primary shell nav (redesign 2026 P1): every screen gets the same tab bar,
 * with the active tab derived from the current route rather than local state,
 * so deep links and back/forward navigation stay in sync. `tabs` are the
 * daily-loop surfaces (Home/Mushaf/Surahs/Today/Progress) — always visible.
 * `moreTabs` (Quiz/Listen/Live/Settings) are secondary: unpacked as ordinary
 * inline tabs on the desktop rail (room enough there), but tucked behind a
 * "More" sheet on the mobile bottom bar, which has no room to spare (see
 * BottomTabBar's `tab-desktop-only`/`tab-mobile-only` split).
 */
const READER_ROUTE_NAMES = new Set(['home', 'reader', 'read-page', 'read-surah', 'read-ayah', 'read-slug'])
// The disabled-reader placeholder has nowhere useful for the tabs to lead.
// /preview and /preview/:surah/:ayah are shareable, standalone verse-range
// pages (reached from outside the app, like /download) — their own minimal
// header is the way back, so the full shell tab bar would just be unused
// chrome around someone else's link (or a beginner's first visit to the
// tutorial). `preview-landing` is the bare `/preview` tutorial + link-builder
// page; `preview`/`preview-range` are an actual shared link.
const NO_SHELL_ROUTE_NAMES = new Set(['reader-disabled', 'preview-landing', 'preview', 'preview-range', 'preview-page'])
// The install page (/download) and every /preview route are all reached from
// outside links, so a first-time visitor there has no saved prefs and would
// otherwise trip the non-dismissible language-picker modal (OnboardingModal)
// right on top of the content they followed the link to see. /download keeps
// the tab bar (it's the page's way back into the app); the /preview routes
// have none, by design — see NO_SHELL_ROUTE_NAMES above.
const NO_ONBOARDING_ROUTE_NAMES = new Set(['download', 'preview-landing', 'preview', 'preview-range', 'preview-page'])

const showShellNav = computed(() => !NO_SHELL_ROUTE_NAMES.has(String(router.currentRoute.value.name)))
const showOnboarding = computed(() => !NO_ONBOARDING_ROUTE_NAMES.has(String(router.currentRoute.value.name)))

const activeTab = computed(() => {
  const name = String(router.currentRoute.value.name)
  if (READER_ROUTE_NAMES.has(name)) return 'home'
  if (name === 'mushaf') return 'mushaf'
  if (name === 'contents') return 'surahs'
  if (['today', 'progress', 'quiz', 'listen', 'live', 'settings'].includes(name)) return name
  return ''
})

const tabs = computed(() => [
  { value: 'home', label: t('common.tabs.home'), icon: Home },
  { value: 'mushaf', label: t('common.tabs.mushaf'), icon: BookOpen },
  { value: 'surahs', label: t('common.tabs.surahs'), icon: ListOrdered },
  { value: 'today', label: t('common.tabs.today'), icon: CalendarCheck },
  { value: 'progress', label: t('common.tabs.progress'), icon: Brain },
])

const moreTabs = computed(() => [
  { value: 'quiz', label: t('common.tabs.quiz'), icon: GraduationCap },
  { value: 'listen', label: t('common.tabs.listen'), icon: Headphones },
  { value: 'live', label: t('common.tabs.live'), icon: Radio },
  { value: 'settings', label: t('common.tabs.settings'), icon: Settings },
])

const moreOpen = ref(false)

function onTabSelect(tab: string) {
  if (tab === activeTab.value) return // already there
  if (tab === 'home') void router.push({ name: 'home' })
  // QPC pages share the mushaf's 604-page scheme, so hand off the current
  // page; from Indopak (a different page count) the mushaf restores its own
  // last page instead of landing on a mismatched one.
  else if (tab === 'mushaf') {
    void router.push(reader.layout === 'qpc' ? mushafLink(reader.page) : { name: 'mushaf' })
  } else if (tab === 'surahs') void router.push({ name: 'contents' })
  else if (['today', 'progress', 'quiz', 'listen', 'live', 'settings'].includes(tab)) void router.push({ name: tab })
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
      :more-tabs="moreTabs"
      @update:model-value="onTabSelect"
      @more="moreOpen = true"
    />
  </div>
  <ToastContainer />
  <OnboardingModal v-if="showOnboarding" />

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
      <div class="more-divider" role="separator"></div>
      <a class="more-item" :href="DISCORD_URL" target="_blank" rel="noopener noreferrer" @click="moreOpen = false">
        <Icon :icon="MessageCircle" :size="18" />
        <span class="more-label">
          <span class="more-name">{{ t('common.discord') }}</span>
          <span class="more-sub">{{ t('common.discordSub') }}</span>
        </span>
      </a>
      <a class="more-item" :href="PLAY_STORE_URL" target="_blank" rel="noopener noreferrer" @click="moreOpen = false">
        <Icon :icon="Store" :size="18" />
        <span class="more-label">
          <span class="more-name">{{ t('common.playStore') }}</span>
          <span class="more-sub">{{ t('common.playStoreSub') }}</span>
        </span>
      </a>
    </div>
  </BottomSheet>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  /* A real `height`, not just `min-height` — this is what gives descendants
     (e.g. the mushaf's internal scroll-snap pager) one definite height anchor
     to resolve against. Content-heavy views (e.g. Progress's page grid) are
     unaffected: nothing here clips them, they still overflow into normal
     page scroll exactly as before — this only stops height from being
     ambiguous/auto when a view legitimately wants to fill (not exceed) the
     viewport. */
  height: 100dvh;
}
.app-content {
  flex: 1 1 auto;
  /* Flex items default to min-height:auto (never shrink below content's
     natural size), which would otherwise stop this from ever settling
     smaller than the tallest thing a view has ever rendered. */
  min-height: 0;
  min-width: 0;
  /* This, not the document, is the scroll container for tall views (e.g.
     Progress's grid) — .app-shell is a fixed 100dvh box now, so overflow
     has to be caught here or it escapes to the document and drags the
     whole shell (tab bar included) into the page scroll, breaking the tab
     bar's `sticky` (its containing block is .app-shell, which would then
     be scrolling out from under it). The mushaf route is unaffected: it
     sets its own `overflow: hidden` and manages scrolling internally. */
  overflow-y: auto;
}
.shell-tabbar {
  position: sticky;
  bottom: 0;
  z-index: var(--z-sticky);
}
/*
 * The mini-player (`AudioMiniPlayer.vue`) is `position: fixed; bottom: 0` with
 * a higher z-index than this bar (--z-dropdown > --z-sticky, deliberately, so
 * the player's own controls stay clickable over page content) — but with
 * nothing reserving space for it, that also means it fully covers this bar's
 * Today/Progress/etc. buttons whenever it's docked, since both anchor to the
 * same bottom:0. Shift the bar up by the player's own measured height
 * instead, the same fix MushafView already applies to its page image
 * (`.player-open`/`--audio-player-h`) — just missing here for primary nav.
 *
 * Deliberately keyed on `--audio-player-h` itself, not on the audio store's
 * `open` flag (a global "is something playing" bit that's true on every
 * route once anything is playing, including the many routes — Surahs,
 * Progress, Quiz, Settings, … — that never render an `AudioMiniPlayer` at
 * all). `AudioMiniPlayer` sets this var on mount and reliably clears it in
 * its own `onBeforeUnmount`, so it's only ever non-empty while a player is
 * actually occupying screen space on the *current* view — an earlier version
 * of this rule kept the bar's space reserved on every other route too,
 * leaving a permanent empty gap above the tab bar (e.g. Today/Progress)
 * whenever playback had been started elsewhere (Home/Mushaf) and was still
 * going in the background. The `0px` fallback only ever matters for the
 * single frame between a player mounting and its first ResizeObserver
 * measurement landing — not worth a larger placeholder for.
 */
.shell-tabbar {
  margin-bottom: var(--audio-player-h, 0px);
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
  .shell-tabbar {
    /* Desktop reflows into a left rail (above) — the bottom-fixed player
       only ever reaches the rail's own foot (Discord/Play Store links), never
       the primary tabs at its top, so no reservation is needed here. */
    margin-bottom: 0;
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
  text-decoration: none;
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-standard);
}
.more-divider {
  height: 1px;
  background: var(--color-border);
  margin: 0.4rem 0.5rem;
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
