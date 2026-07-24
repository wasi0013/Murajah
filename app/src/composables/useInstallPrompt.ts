import { onMounted, onUnmounted, ref } from 'vue'
import { isIOS } from '@/core/pwa/platform'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  // iOS Safari has no `display-mode` media query support of its own but
  // exposes `navigator.standalone` instead; everywhere else uses the media query.
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/**
 * Custom install CTA (plan §10.6.2): Android/desktop Chrome fire
 * `beforeinstallprompt`, which this captures and defers so the app can offer
 * its own "Install" button (from Settings) instead of relying on the browser's
 * own address-bar affordance. iOS has no such API — `isIOSManualInstall`
 * tells the caller to show the "Share → Add to Home Screen" instruction text
 * instead. Both are false once the app is already running standalone.
 */
export function useInstallPrompt() {
  const canInstall = ref(false)
  const isIOSManualInstall = ref(isIOS() && !isStandalone())
  let deferredEvent: BeforeInstallPromptEvent | null = null

  function onBeforeInstallPrompt(e: Event): void {
    e.preventDefault()
    deferredEvent = e as BeforeInstallPromptEvent
    canInstall.value = true
  }

  function onInstalled(): void {
    canInstall.value = false
    isIOSManualInstall.value = false
    deferredEvent = null
  }

  onMounted(() => {
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
  })
  onUnmounted(() => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.removeEventListener('appinstalled', onInstalled)
  })

  async function promptInstall(): Promise<void> {
    if (!deferredEvent) return
    const event = deferredEvent
    deferredEvent = null
    canInstall.value = false
    await event.prompt()
    await event.userChoice
  }

  return { canInstall, isIOSManualInstall, promptInstall }
}
