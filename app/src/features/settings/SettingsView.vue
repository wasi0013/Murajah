<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowLeft,
  Download,
  RotateCcw,
  Smartphone,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-vue-next'
import { useSettingsStore, type ThemeName } from '@/stores/settings'
import { useI18n } from '@/core/i18n'
import { LOCALE_LIST, LOCALES, type Locale } from '@/core/i18n/types'
import { exportUserData, importUserData, type ExportSnapshot } from '@/core/storage/exportImport'
import { downloadBackup, readBackupFile } from '@/core/storage/backupFile'
import { resetApp, clearResourceCache } from '@/core/storage/resetApp'
import { toast } from '@/composables/useToast'
import { useInstallPrompt } from '@/composables/useInstallPrompt'
import { useOfflineDownload } from '@/composables/useOfflineDownload'
import Icon from '@/components/Icon.vue'
import SegmentedControl from '@/components/SegmentedControl.vue'
import Button from '@/components/Button.vue'
import Modal from '@/components/Dialog.vue'

/**
 * The app's settings surface, reached from the reader's "More" sheet. It owns
 * the preferences with no in-context home — the colour theme and app language —
 * and hosts data backup: a lossless JSON export and an import that replaces the
 * data it carries (after a confirm), then reloads so every view rehydrates.
 */
const router = useRouter()
const settings = useSettingsStore()
const { t, locale, setLocale } = useI18n()
const { canInstall, isIOSManualInstall, promptInstall } = useInstallPrompt()
const offline = useOfflineDownload()
onMounted(() => void offline.hydrate())

const themeOptions = computed<{ value: ThemeName; label: string }[]>(() => [
  { value: 'light', label: t('settings.appearance.light') },
  { value: 'dark', label: t('settings.appearance.dark') },
  { value: 'sepia', label: t('settings.appearance.sepia') },
])

// SegmentedControl is a two-way string model; funnel writes through setTheme so
// the choice is applied to the document and persisted, not just held in the ref.
const theme = computed<string>({
  get: () => settings.theme,
  set: (v) => settings.setTheme(v as ThemeName),
})

// Each language names itself (endonym) in the picker, regardless of active UI
// language. Switching is async (the catalog lazy-loads) but the setter is sync.
const languageOptions = LOCALE_LIST.map((l) => ({ value: l, label: LOCALES[l].native }))
const language = computed<string>({
  get: () => locale.value,
  set: (v) => void setLocale(v as Locale),
})

// —— Data backup ————————————————————————————————————
const fileInput = ref<HTMLInputElement>()
const pending = ref<ExportSnapshot | null>(null)
const confirmOpen = ref(false)
const importing = ref(false)

async function exportData() {
  try {
    downloadBackup(await exportUserData())
    toast(t('settings.data.exported'), { variant: 'success' })
  } catch {
    toast(t('settings.data.exportFailed'), { variant: 'error' })
  }
}

function pickFile() {
  fileInput.value?.click()
}

// A picked file is validated up front; only a good backup opens the confirm, so
// the destructive step is never reached for junk input.
async function onFileChosen(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // allow re-picking the same file
  if (!file) return
  try {
    pending.value = await readBackupFile(file)
    confirmOpen.value = true
  } catch (err) {
    toast(err instanceof Error ? err.message : t('settings.data.notBackup'), {
      variant: 'error',
    })
  }
}

async function confirmImport() {
  const snap = pending.value
  if (!snap) return
  importing.value = true
  try {
    await importUserData(snap)
    confirmOpen.value = false
    pending.value = null
    toast(t('settings.data.restored'), { variant: 'success' })
    // Reload so every store rehydrates from the imported data (this view holds none).
    setTimeout(() => window.location.reload(), 600)
  } catch {
    importing.value = false
    toast(t('settings.data.restoreFailed'), { variant: 'error' })
  }
}

function cancelImport() {
  confirmOpen.value = false
  pending.value = null
}

// —— Full reset ————————————————————————————————————
const resetConfirmOpen = ref(false)
const resetting = ref(false)

async function confirmReset() {
  resetting.value = true
  try {
    await resetApp()
    resetConfirmOpen.value = false
    toast(t('settings.reset.done'), { variant: 'success' })
    // Hard navigation (not router.push): every store, the SW registration, and
    // all caches must reinitialize from scratch, exactly like a first visit.
    setTimeout(() => {
      window.location.href = '/'
    }, 600)
  } catch {
    resetting.value = false
    toast(t('settings.reset.failed'), { variant: 'error' })
  }
}

function cancelReset() {
  resetConfirmOpen.value = false
}

// —— Clear cache (safe — never touches memorization data) —————————
const clearCacheConfirmOpen = ref(false)
const clearingCache = ref(false)

async function confirmClearCache() {
  clearingCache.value = true
  try {
    await clearResourceCache()
    clearCacheConfirmOpen.value = false
    toast(t('offline.clearCache.cleared'), { variant: 'success' })
    // Reload so every in-memory cache (the data worker's dedupe map, loaded
    // font faces) starts clean against the now-empty persistent caches.
    setTimeout(() => window.location.reload(), 600)
  } catch {
    clearingCache.value = false
    toast(t('offline.clearCache.clearFailed'), { variant: 'error' })
  }
}

function cancelClearCache() {
  clearCacheConfirmOpen.value = false
}
</script>

<template>
  <main class="settings-view">
    <header class="topbar">
      <button
        class="icon-btn"
        type="button"
        :aria-label="t('common.backToReader')"
        @click="router.push('/')"
      >
        <Icon :icon="ArrowLeft" :size="20" />
      </button>
      <h1 class="title">{{ t('settings.title') }}</h1>
    </header>

    <section v-if="canInstall || isIOSManualInstall" class="section" :aria-label="t('pwa.installTitle')">
      <h2 class="section-title">{{ t('pwa.installTitle') }}</h2>
      <p class="lead">{{ t('pwa.installBody') }}</p>
      <Button v-if="canInstall" variant="secondary" @click="promptInstall">
        <Icon :icon="Smartphone" :size="18" />
        {{ t('pwa.install') }}
      </Button>
      <p v-else class="hint">{{ t('pwa.iosInstallHint') }}</p>
    </section>

    <section class="section" :aria-label="t('settings.appearance.title')">
      <h2 class="section-title">{{ t('settings.appearance.title') }}</h2>
      <div class="row">
        <span class="row-label">{{ t('settings.appearance.theme') }}</span>
        <SegmentedControl
          v-model="theme"
          :options="themeOptions"
          :label="t('settings.appearance.themeLabel')"
        />
      </div>
      <p class="hint">{{ t('settings.appearance.hint') }}</p>
    </section>

    <section class="section" :aria-label="t('settings.language.title')">
      <h2 class="section-title">{{ t('settings.language.title') }}</h2>
      <div class="row">
        <span class="row-label">{{ t('settings.language.label') }}</span>
        <SegmentedControl
          v-model="language"
          :options="languageOptions"
          :label="t('settings.language.label')"
        />
      </div>
      <p class="hint">{{ t('settings.language.hint') }}</p>
    </section>

    <section class="section" :aria-label="t('settings.data.title')">
      <h2 class="section-title">{{ t('settings.data.title') }}</h2>
      <p class="lead">{{ t('settings.data.lead') }}</p>
      <div class="actions">
        <Button variant="secondary" @click="exportData">
          <Icon :icon="Download" :size="18" />
          {{ t('settings.data.export') }}
        </Button>
        <Button variant="secondary" @click="pickFile">
          <Icon :icon="Upload" :size="18" />
          {{ t('settings.data.import') }}
        </Button>
      </div>
      <input
        ref="fileInput"
        class="sr-only"
        type="file"
        accept="application/json,.json"
        aria-hidden="true"
        tabindex="-1"
        @change="onFileChosen"
      />
    </section>

    <section class="section" :aria-label="t('offline.title')">
      <h2 class="section-title">{{ t('offline.title') }}</h2>

      <div class="offline-pack">
        <p class="lead">{{ t('offline.lead', { size: offline.state.pack.sizeEstimateMb }) }}</p>
        <div class="actions">
          <Button
            v-if="offline.state.pack.status === 'idle' || offline.state.pack.status === 'canceled'"
            variant="secondary"
            @click="offline.download"
          >
            <Icon :icon="Download" :size="18" />
            {{ offline.state.pack.status === 'canceled' ? t('offline.canceled') : t('offline.action') }}
          </Button>
          <template v-else-if="offline.state.pack.status === 'downloading'">
            <span class="row-label">{{ t('offline.progress', { done: offline.state.pack.done, total: offline.state.pack.total }) }}</span>
            <Button variant="ghost" @click="offline.cancel">
              <Icon :icon="X" :size="16" />
              {{ t('offline.cancel') }}
            </Button>
          </template>
          <span v-else-if="offline.state.pack.status === 'done'" class="row-label">{{ t('offline.downloaded') }}</span>
        </div>
      </div>

      <div class="offline-pack">
        <p class="lead">{{ t('offline.clearCache.lead') }}</p>
        <div class="actions">
          <Button variant="warn" @click="clearCacheConfirmOpen = true">
            <Icon :icon="Trash2" :size="18" />
            {{ t('offline.clearCache.action') }}
          </Button>
        </div>
      </div>
    </section>

    <section class="section section-danger" :aria-label="t('settings.reset.title')">
      <h2 class="section-title danger-title">
        <Icon :icon="TriangleAlert" :size="18" />
        {{ t('settings.reset.title') }}
      </h2>
      <p class="lead">{{ t('settings.reset.warning') }}</p>
      <p class="hint">{{ t('settings.reset.backupHint') }}</p>
      <div class="actions">
        <Button variant="danger" @click="resetConfirmOpen = true">
          <Icon :icon="RotateCcw" :size="18" />
          {{ t('settings.reset.action') }}
        </Button>
      </div>
    </section>

    <Modal v-model:open="confirmOpen" :label="t('settings.data.import')">
      <h3 class="modal-title">{{ t('settings.data.confirmTitle') }}</h3>
      <p class="modal-body">{{ t('settings.data.confirmBody') }}</p>
      <div class="modal-actions">
        <Button variant="ghost" :disabled="importing" @click="cancelImport">
          {{ t('common.cancel') }}
        </Button>
        <Button variant="danger" :loading="importing" @click="confirmImport">
          {{ t('settings.data.replace') }}
        </Button>
      </div>
    </Modal>

    <Modal v-model:open="resetConfirmOpen" :label="t('settings.reset.title')">
      <h3 class="modal-title">{{ t('settings.reset.confirmTitle') }}</h3>
      <p class="modal-body">{{ t('settings.reset.confirmBody') }}</p>
      <div class="modal-actions">
        <Button variant="ghost" :disabled="resetting" @click="cancelReset">
          {{ t('common.cancel') }}
        </Button>
        <Button variant="danger" :loading="resetting" @click="confirmReset">
          {{ t('settings.reset.confirmAction') }}
        </Button>
      </div>
    </Modal>

    <Modal v-model:open="clearCacheConfirmOpen" :label="t('offline.clearCache.title')">
      <h3 class="modal-title">{{ t('offline.clearCache.confirmTitle') }}</h3>
      <p class="modal-body">{{ t('offline.clearCache.confirmBody') }}</p>
      <div class="modal-actions">
        <Button variant="ghost" :disabled="clearingCache" @click="cancelClearCache">
          {{ t('common.cancel') }}
        </Button>
        <Button variant="warn" :loading="clearingCache" @click="confirmClearCache">
          {{ t('offline.clearCache.confirmAction') }}
        </Button>
      </div>
    </Modal>
  </main>
</template>

<style scoped>
.settings-view {
  min-height: 100%;
  background: var(--color-bg);
  color: var(--color-text);
  padding-bottom: 3rem;
}
@media (min-width: 1024px) {
  .settings-view {
    max-width: 42rem;
    margin-inline: auto;
  }
}
.topbar {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: calc(0.6rem + env(safe-area-inset-top)) 1rem 0.6rem;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}
.title {
  font-size: var(--text-lg);
  font-weight: 600;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 2.25rem;
  width: 2.25rem;
  border-radius: var(--radius-md);
  color: var(--color-text);
}
.icon-btn:hover {
  background: var(--color-elevated);
}
.icon-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.section {
  max-width: 46rem;
  margin: 1.25rem auto 0;
  padding: 0 1rem;
}
.section-title {
  font-size: var(--text-sm);
  font-weight: 600;
  margin-bottom: 0.75rem;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.row-label {
  font-size: var(--text-base);
}
.hint {
  margin-top: 0.6rem;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.lead {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin-bottom: 0.9rem;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}
.offline-pack + .offline-pack {
  margin-top: 1.25rem;
}
.section-danger {
  margin-top: 2.5rem;
  margin-bottom: 1.5rem;
  padding: 1rem;
  border: 1px solid color-mix(in oklab, var(--color-danger) 40%, transparent);
  border-radius: var(--radius-md);
  background: color-mix(in oklab, var(--color-danger) 6%, transparent);
}
.danger-title {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  /* Mixed toward the theme's own (guaranteed high-contrast) text colour rather
     than used raw — on the section's tinted background, --color-danger alone
     falls just under WCAG AA (4.15:1 vs 4.5:1 required) in the light theme. */
  color: color-mix(in oklab, var(--color-danger) 70%, var(--color-text) 30%);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.modal-title {
  font-size: var(--text-lg);
  font-weight: 600;
  margin-bottom: 0.5rem;
}
.modal-body {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin-bottom: 1.25rem;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
