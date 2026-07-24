import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Cross-surface recording session state. `active` is read by whichever reading
 * surface is mounted (text reader or mushaf scan) so it can blur its page content
 * while a recitation is being captured — recording someone reciting from memory
 * shouldn't leave the text on screen to read from. `pendingPage` is how Today's
 * quick-test hands a randomly-picked page to the reader across a route
 * navigation: it's set right before the push, then claimed via `consumePending`
 * once the reader actually lands on that page.
 */
export const useRecorderStore = defineStore('recorder', () => {
  const active = ref(false)
  const pendingPage = ref<number | null>(null)

  /** Claim a pending auto-record target for `page`. One-shot: clears on match. */
  function consumePending(page: number): boolean {
    if (pendingPage.value !== page) return false
    pendingPage.value = null
    return true
  }

  return { active, pendingPage, consumePending }
})
