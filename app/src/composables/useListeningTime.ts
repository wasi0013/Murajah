import { onBeforeUnmount, onMounted } from 'vue'
import { useAudioStore } from '@/stores/audio'
import { useProgressStore } from '@/stores/progress'

/**
 * Accumulates active listening time while audio is playing — one second per
 * interval tick. Mounted in App (always alive) so it persists across navigation.
 * Audio can legitimately play in the background, so no visibility check is applied.
 */
export function useListeningTime() {
  const audio = useAudioStore()
  const progress = useProgressStore()
  let timer: ReturnType<typeof setInterval> | undefined

  onMounted(() => {
    timer = setInterval(() => {
      if (audio.isPlaying) progress.addListeningSeconds(1)
    }, 1000)
  })
  onBeforeUnmount(() => clearInterval(timer))
}
