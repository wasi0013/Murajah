import { toast } from '@/composables/useToast'
import { t } from '@/core/i18n'
import { isLikelyOffline } from '@/core/network/offline'

/**
 * Shared failure handler for `useQariPlayer.start`, `useTodayPlayer.play`,
 * and `useListenPlayer.play` — three independent (deliberately duplicated,
 * per their own doc comments) player-orchestration composables that each
 * `await data.init()` (and related fetches) with no `catch`, called by
 * their views with `void player.start(ctx())` / `void player.play(...)`
 * (fire-and-forget). Without this, a failure — most commonly: offline, so
 * the verse/page audio data for the requested page was never fetched or
 * cached — became a silent unhandled rejection: tapping Play just did
 * nothing (no spinner resolving, no error, nothing), which reads as the app
 * having crashed rather than "you're offline" (the actual, recoverable,
 * overwhelmingly common cause). Surfaced as a toast, the same mechanism
 * `router/index.ts` uses for a failed navigation.
 */
export function reportAudioStartError(error: unknown): void {
  console.error('[audio] failed to start playback:', error)
  toast(t(isLikelyOffline(error) ? 'common.networkError' : 'audio.startError'), { variant: 'error' })
}
