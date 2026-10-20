<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AudioMiniPlayer from './AudioMiniPlayer.vue'
import ReciterPicker from './ReciterPicker.vue'
import type { AudioView } from '@/core/audio/pages'
import type { PlaylistItem } from '@/core/audio/playlist'
import type { Layout } from '@/core/data/types'
import { effectiveGrain as resolveGrain, pageAudioAvailable } from '@/core/audio/pageMode'
import { pageReciter, verseReciter } from '@/core/audio/reciters'
import { useAudioEngine } from '@/composables/useAudioEngine'
import { useAudioPersistence } from '@/composables/useAudioPersistence'
import { useQariPlayer } from '@/composables/useQariPlayer'
import { useAudioStore } from '@/stores/audio'

/**
 * Mounts the mini-player + reciter picker for a view and wires them to the engine.
 * The view passes the *reactive* context (which surface, layout, and page(s) are
 * showing); the host turns player intents (start / rebuild / pick) into engine work.
 * Rendered only when the player is open, so it and its deps stay lazy.
 */
const props = defineProps<{
  view: AudioView
  layout: Layout
  pages: number[]
  /**
   * The page(s) the parent would turn to next (`need-next-page`), or empty at the
   * end. Lets the queue be extended *before* the current page runs out — see
   * `maybeLookahead`.
   */
  nextPages?: number[]
}>()
const emit = defineEmits<{ 'need-next-page': [] }>()

/** Start the next page's lookahead once the queue is down to this many items. */
const LOOKAHEAD_REMAINING = 3

const store = useAudioStore()
const engine = useAudioEngine()
const player = useQariPlayer()
const prefs = useAudioPersistence(store)

onMounted(() => {
  void prefs.hydrate()
  // Fallback for when the lookahead below didn't land in time (or couldn't run):
  // autoplay-next ran off the end of "the page(s) in view"'s playlist, so ask the
  // parent (which owns page navigation) to turn the page, then — only if it
  // actually could (there's more Quran left) — start playing there. Detecting the
  // change here, rather than reusing the "follow the reader" watcher below, avoids
  // a race: `store.isPlaying` is already false by the time this fires (see
  // `useAudioEngine`'s 'exhausted' handling), so that watcher's guard wouldn't run.
  engine.setOnExhausted(() => {
    const before = props.pages.join(',')
    emit('need-next-page')
    void nextTick(() => {
      if (props.pages.join(',') !== before) void startHere()
    })
  })
})
onBeforeUnmount(() => {
  prefs.dispose()
  engine.setOnExhausted(null)
})

const pickerOpen = ref(false)

const pageAvailable = computed(() => pageAudioAvailable(props.layout))
// What's actually loaded right now, not the stored preference: playback can have
// been started by a sibling view (Listen, Today) whose grain may disagree with
// this one's `store.grain`. Falls back to the preference (page degrading to verse
// where the layout doesn't support it) only when nothing is loaded yet.
const effectiveGrain = computed(() => {
  const kind = store.current?.kind
  if (kind === 'verse') return 'verse'
  if (kind === 'page-part') return 'page'
  return resolveGrain(store.grain, props.layout)
})
const reciterName = computed(() =>
  effectiveGrain.value === 'page'
    ? pageReciter(store.pageReciterId).name
    : verseReciter(store.verseReciterId).name,
)

function ctx(pages = props.pages) {
  return { view: props.view, layout: props.layout, pages }
}

// —— Next-page lookahead ——————————————————————————————————————————————————
//
// Crossing a page used to be: last item ends → (silence) → parent turns the page
// → Vue tick → load the next page's verse data → build → fetch the first mp3.
// With the screen locked that silent, async gap is exactly where mobile OSes
// suspend the page or cut its network, so long sessions died at a page boundary.
// Instead, near the end of the page the next page's items are built and
// *appended* to the queue; the engine prefetches across the join like any other
// item, and the boundary is a plain in-list advance. The page turn then simply
// follows the audio (`activePage` entering the appended pages) — it's no longer
// on the critical path at all.

/** The queue this host started or extended — the only one it may extend. */
let ownPlaylist: readonly PlaylistItem[] | null = null
/**
 * Items appended for the next page(s), not yet reached by playback. `basePages`
 * is the view the lookahead was built from — the page turn only follows the audio
 * if the reader is still there (it may have been moved by hand meanwhile).
 */
let lookahead: { firstIndex: number; basePages: string } | null = null
/** Bumped by every (re)start, so a lookahead build that straddles one is dropped. */
let generation = 0
let lookaheadInFlight = false
/** Set while a page turn we requested (to follow the audio) is landing. */
let followingAudio = false

function itemPage(item: PlaylistItem): number | undefined {
  return item.page?.page ?? item.verse?.page
}

/** This view's queue: one it built, or one that plays only the page(s) in view. */
function ownsQueue(list: readonly PlaylistItem[]): boolean {
  if (list === ownPlaylist) return true
  return list.length > 0 && list.every((item) => props.pages.includes(itemPage(item) ?? -1))
}

async function startHere(): Promise<void> {
  generation++
  lookahead = null
  const before = store.playlist
  await player.start(ctx())
  if (store.playlist !== before) ownPlaylist = store.playlist
}

function maybeLookahead(): void {
  if (lookahead || lookaheadInFlight) return
  if (!store.autoNext || store.loopPlaylist) return
  const list = store.playlist
  if (!list.length || store.index < 0 || list.length - store.index > LOOKAHEAD_REMAINING) return
  if (!ownsQueue(list)) return
  // `nextPages` is relative to the page on screen, so only extend while that's
  // the page the queue ends on — otherwise (reader flipped elsewhere while
  // paused) we'd skip or repeat pages. The exhausted fallback covers that case.
  const lastPage = itemPage(list[list.length - 1])
  if (lastPage === undefined || !props.pages.includes(lastPage)) return
  const nextPages = props.nextPages ?? []
  if (!nextPages.length) return
  const basePages = props.pages.join(',')
  const gen = generation
  lookaheadInFlight = true
  player
    .build(ctx([...nextPages]))
    .then((items) => {
      // Restarted/replaced while we were loading (a restart may still be
      // awaiting its own build, so the playlist check alone isn't enough), or
      // the user turned on loop / turned off autoplay-next meanwhile: drop it.
      if (gen !== generation || store.playlist !== list) return
      if (!items.length || !store.autoNext || store.loopPlaylist) return
      engine.appendToPlaylist(items)
      ownPlaylist = store.playlist
      lookahead = { firstIndex: list.length, basePages }
    })
    .catch(() => {
      // Best-effort: the exhausted fallback still turns the page and starts it.
    })
    .finally(() => {
      lookaheadInFlight = false
    })
}

watch(() => [store.index, store.playlist, store.autoNext, store.loopPlaylist], maybeLookahead)

// The user turned on loop / turned off autoplay-next after the next page was
// appended: take it back off, so the current page loops (or stops) as asked.
watch(
  () => [store.autoNext, store.loopPlaylist],
  () => {
    if (!lookahead || (store.autoNext && !store.loopPlaylist)) return
    if (store.playlist === ownPlaylist && store.index < lookahead.firstIndex) {
      engine.trimPlaylist(lookahead.firstIndex)
      ownPlaylist = store.playlist
    }
    lookahead = null
  },
)

// Playback crossed into the appended page(s): drop the page just finished (the
// queue stays one page long — bounded, and `prev` stays within the page in view,
// as after a fresh start), then turn the page to follow the audio.
watch(
  () => store.index,
  (index) => {
    if (!lookahead || store.playlist !== ownPlaylist || index < lookahead.firstIndex) return
    const { firstIndex, basePages } = lookahead
    lookahead = null
    engine.dropBefore(firstIndex)
    ownPlaylist = store.playlist
    if (props.pages.join(',') !== basePages) return // the reader already moved on its own
    followingAudio = true
    emit('need-next-page')
    void nextTick(() => {
      followingAudio = false
    })
  },
)

// Follow the reader: when the visible page(s) change while audio is playing, stop
// the old page and immediately start the new one (verse or page grain alike). Only
// while playing — merely opening the player or pausing never yanks the page along.
// Not when the change is the page turn we just asked for to follow the audio
// across a lookahead join — that page is already playing; restarting it would
// jump back to its first ayah.
watch(
  () => props.pages.join(','),
  () => {
    if (followingAudio) {
      followingAudio = false
      return
    }
    if (store.isPlaying) void startHere()
  },
)

function onStart() {
  void startHere()
}
function onRebuild() {
  // Not `player.restart()`: playback may have been started by a different
  // view entirely (Listen, Today) whose own player instance holds the
  // context, not this one's. Always rebuild from what's actually on screen
  // here, same as the exhausted-callback and page-follow watcher above.
  void startHere()
}
function onClose() {
  engine.stop()
  store.open = false
}
</script>

<template>
  <AudioMiniPlayer
    v-if="store.open"
    :page-available="pageAvailable"
    :effective-grain="effectiveGrain"
    :reciter-name="reciterName"
    :show-repeat="effectiveGrain === 'verse'"
    @start="onStart"
    @rebuild="onRebuild"
    @open-picker="pickerOpen = true"
    @close="onClose"
  />
  <ReciterPicker v-model:open="pickerOpen" :grain="effectiveGrain" @change="onRebuild" />
</template>
