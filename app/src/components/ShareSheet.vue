<script setup lang="ts">
import { computed } from 'vue'
import { Facebook, Link2, MessageCircle, Send, Share2, Twitter } from 'lucide-vue-next'
import BottomSheet from './BottomSheet.vue'
import Icon from './Icon.vue'
import { toast } from '@/composables/useToast'
import { useI18n } from '@/core/i18n'

/**
 * Share the current page: copy-to-clipboard + deep links into WhatsApp,
 * Telegram, Facebook, and X, plus the native OS share sheet where supported
 * (mobile browsers, mainly — it surfaces every share target installed on the
 * device, not just these four). A `BottomSheet` (the same primitive the
 * reader's own settings/"more" menu use) rather than a bespoke responsive
 * dialog — it already reads well at any width, so there's no separate
 * desktop/mobile layout to maintain.
 *
 * `url` is passed in rather than read from `window.location` here, so a
 * caller can build it from the reactive route (`router.currentRoute.value.
 * fullPath`) and it updates if the route changes while the sheet is open —
 * e.g. on /preview this is the literal link, highlight query params intact.
 */
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ url: string; title?: string }>()

const { t } = useI18n()

const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

async function copy() {
  try {
    await navigator.clipboard.writeText(props.url)
    toast(t('share.copied'), { variant: 'success' })
  } catch {
    toast(t('share.copyFailed'), { variant: 'error' })
  }
}

async function nativeShare() {
  try {
    await navigator.share({ url: props.url, title: props.title })
  } catch {
    /* user cancelled, or the browser rejected it (e.g. no share target) —
       neither is an error worth surfacing as one */
  }
}

function selectAll(e: FocusEvent) {
  ;(e.target as HTMLInputElement).select()
}

const encodedUrl = computed(() => encodeURIComponent(props.url))
const encodedTitle = computed(() => encodeURIComponent(props.title ?? ''))

// Each platform's public share-intent URL — no API key/SDK needed, and each
// opens in its own tab so the sheet (and the app) is never navigated away.
const targets = computed(() => [
  {
    name: t('share.whatsapp'),
    icon: MessageCircle,
    href: `https://wa.me/?text=${encodedTitle.value ? `${encodedTitle.value}%20` : ''}${encodedUrl.value}`,
  },
  {
    name: t('share.telegram'),
    icon: Send,
    href: `https://t.me/share/url?url=${encodedUrl.value}&text=${encodedTitle.value}`,
  },
  {
    name: t('share.facebook'),
    icon: Facebook,
    href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl.value}`,
  },
  {
    name: t('share.twitter'),
    icon: Twitter,
    href: `https://twitter.com/intent/tweet?url=${encodedUrl.value}&text=${encodedTitle.value}`,
  },
])
</script>

<template>
  <BottomSheet v-model:open="open" :label="t('share.title')">
    <div class="share-sheet">
      <h2 class="share-heading">{{ t('share.title') }}</h2>

      <div class="share-url-row">
        <input
          class="share-url"
          type="text"
          :value="url"
          readonly
          :aria-label="t('share.title')"
          @focus="selectAll"
        />
        <button type="button" class="share-copy" @click="copy">
          <Icon :icon="Link2" :size="16" />
          {{ t('share.copy') }}
        </button>
      </div>

      <button v-if="canNativeShare" type="button" class="share-native" @click="nativeShare">
        <Icon :icon="Share2" :size="18" />
        {{ t('share.more') }}
      </button>

      <div class="share-grid">
        <a
          v-for="target in targets"
          :key="target.name"
          class="share-target"
          :href="target.href"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span class="share-target-icon"><Icon :icon="target.icon" :size="22" /></span>
          <span class="share-target-name">{{ target.name }}</span>
        </a>
      </div>
    </div>
  </BottomSheet>
</template>

<style scoped>
.share-sheet {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-bottom: 0.5rem;
}
.share-heading {
  font-size: var(--text-lg);
  font-weight: 600;
}
.share-url-row {
  display: flex;
  gap: 0.5rem;
}
.share-url {
  flex: 1 1 auto;
  min-width: 0;
  height: 2.75rem;
  padding: 0 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-elevated);
  color: var(--color-text);
  font-size: var(--text-sm);
  /* Long preview links (highlight query params especially) shouldn't force
     horizontal scroll on a narrow sheet — the input scrolls internally. */
  text-overflow: ellipsis;
}
.share-url:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.share-copy {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0 1rem;
  height: 2.75rem;
  border-radius: var(--radius-md);
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-size: var(--text-sm);
  font-weight: 600;
  white-space: nowrap;
}
.share-copy:hover {
  background: var(--color-accent-hover);
}
.share-copy:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.share-native {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 2.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: var(--text-sm);
  font-weight: 600;
}
.share-native:hover {
  background: var(--color-elevated);
}
.share-native:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.share-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
}
.share-target {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 0.75rem 0.25rem;
  border-radius: var(--radius-md);
  color: var(--color-text);
  text-align: center;
}
.share-target:hover,
.share-target:focus-visible {
  background: var(--color-elevated);
}
.share-target:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
.share-target-icon {
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: var(--radius-full);
  background: var(--color-elevated);
  color: var(--color-text);
}
.share-target-name {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

/* A bit more breathing room once the sheet isn't fighting a phone's width. */
@media (min-width: 640px) {
  .share-grid {
    gap: 0.75rem;
  }
}
</style>
