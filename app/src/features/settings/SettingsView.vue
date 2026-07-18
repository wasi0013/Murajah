<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Download, Upload } from 'lucide-vue-next'
import { useSettingsStore, type ThemeName } from '@/stores/settings'
import { exportUserData, importUserData, type ExportSnapshot } from '@/core/storage/exportImport'
import { downloadBackup, readBackupFile } from '@/core/storage/backupFile'
import { toast } from '@/composables/useToast'
import Icon from '@/components/Icon.vue'
import SegmentedControl from '@/components/SegmentedControl.vue'
import Button from '@/components/Button.vue'
import Modal from '@/components/Dialog.vue'

/**
 * The app's settings surface, reached from the reader's "More" sheet. It owns
 * the preferences with no in-context home — the colour theme — and hosts data
 * backup: a lossless JSON export and an import that replaces the data it carries
 * (after a confirm), then reloads so every view rehydrates from the new data.
 */
const router = useRouter()
const settings = useSettingsStore()

const themeOptions: { value: ThemeName; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'sepia', label: 'Sepia' },
]

// SegmentedControl is a two-way string model; funnel writes through setTheme so
// the choice is applied to the document and persisted, not just held in the ref.
const theme = computed<string>({
  get: () => settings.theme,
  set: (v) => settings.setTheme(v as ThemeName),
})

// —— Data backup ————————————————————————————————————
const fileInput = ref<HTMLInputElement>()
const pending = ref<ExportSnapshot | null>(null)
const confirmOpen = ref(false)
const importing = ref(false)

async function exportData() {
  try {
    downloadBackup(await exportUserData())
    toast('Backup downloaded.', { variant: 'success' })
  } catch {
    toast("Couldn't create a backup.", { variant: 'error' })
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
    toast(err instanceof Error ? err.message : 'This file is not a Murajah backup.', {
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
    toast('Backup restored — reloading…', { variant: 'success' })
    // Reload so every store rehydrates from the imported data (this view holds none).
    setTimeout(() => window.location.reload(), 600)
  } catch {
    importing.value = false
    toast("Couldn't restore this backup.", { variant: 'error' })
  }
}

function cancelImport() {
  confirmOpen.value = false
  pending.value = null
}
</script>

<template>
  <main class="settings-view">
    <header class="topbar">
      <button class="icon-btn" type="button" aria-label="Back to reader" @click="router.push('/')">
        <Icon :icon="ArrowLeft" :size="20" />
      </button>
      <h1 class="title">Settings</h1>
    </header>

    <section class="section" aria-label="Appearance">
      <h2 class="section-title">Appearance</h2>
      <div class="row">
        <span class="row-label">Theme</span>
        <SegmentedControl v-model="theme" :options="themeOptions" label="Colour theme" />
      </div>
      <p class="hint">Sepia is easier on the eyes for long reading sessions.</p>
    </section>

    <section class="section" aria-label="Your data">
      <h2 class="section-title">Your data</h2>
      <p class="lead">
        Everything is stored on this device. Export a backup to move to another device or keep a
        safety copy; importing replaces the data the file contains.
      </p>
      <div class="actions">
        <Button variant="secondary" @click="exportData">
          <Icon :icon="Download" :size="18" />
          Export backup
        </Button>
        <Button variant="secondary" @click="pickFile">
          <Icon :icon="Upload" :size="18" />
          Import backup
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

    <Modal v-model:open="confirmOpen" label="Import backup">
      <h3 class="modal-title">Import this backup?</h3>
      <p class="modal-body">
        This replaces the data the file contains — memorization, mistakes, your plan, and settings —
        on this device. It can't be undone.
      </p>
      <div class="modal-actions">
        <Button variant="ghost" :disabled="importing" @click="cancelImport">Cancel</Button>
        <Button variant="danger" :loading="importing" @click="confirmImport">Replace data</Button>
      </div>
    </Modal>
  </main>
</template>

<style scoped>
.settings-view {
  min-height: 100dvh;
  background: var(--color-bg);
  color: var(--color-text);
  padding-bottom: 3rem;
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
  gap: 0.75rem;
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
