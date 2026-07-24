import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { IDBFactory } from 'fake-indexeddb'
import { loadAudioPrefs, saveAudioPrefs, _resetUserDataDb } from '@/core/storage/userData'
import { useAudioPersistence } from '@/composables/useAudioPersistence'
import { useAudioStore } from '@/stores/audio'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetUserDataDb()
  setActivePinia(createPinia())
})

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('audio prefs storage', () => {
  it('round-trips grain, reciters, and speed through IndexedDB', async () => {
    await saveAudioPrefs({ grain: 'page', verseReciterId: 'alafasy', pageReciterId: 'husary', speed: 1.5 })
    expect(await loadAudioPrefs()).toEqual({
      grain: 'page',
      verseReciterId: 'alafasy',
      pageReciterId: 'husary',
      speed: 1.5,
    })
  })

  it('returns an empty object when nothing is stored', async () => {
    expect(await loadAudioPrefs()).toEqual({})
  })
})

describe('useAudioPersistence', () => {
  it('persists a preference change (debounced) and hydrates it back', async () => {
    const store = useAudioStore()
    const p = useAudioPersistence(store)
    store.grain = 'page'
    store.verseReciterId = 'ali_jaber'
    store.speed = 0.75
    store.autoScroll = false
    await tick(360) // past the 300ms debounce
    p.dispose()

    // A fresh store hydrates the persisted values.
    setActivePinia(createPinia())
    const store2 = useAudioStore()
    await useAudioPersistence(store2).hydrate()
    expect(store2.grain).toBe('page')
    expect(store2.verseReciterId).toBe('ali_jaber')
    expect(store2.speed).toBe(0.75)
    expect(store2.autoScroll).toBe(false)
  })

  it('ignores an unknown reciter id and an invalid speed on hydrate', async () => {
    await saveAudioPrefs({ verseReciterId: 'ghost-qari', speed: 3.3 })
    const store = useAudioStore()
    const before = { reciter: store.verseReciterId, speed: store.speed }
    await useAudioPersistence(store).hydrate()
    expect(store.verseReciterId).toBe(before.reciter) // unchanged — id not in registry
    expect(store.speed).toBe(before.speed) // unchanged — speed not allowed
  })

  it('round-trips the last-listened scope', async () => {
    const store = useAudioStore()
    const p = useAudioPersistence(store)
    store.lastListenScope = { kind: 'surah', surah: 25 }
    await tick(360)
    p.dispose()

    setActivePinia(createPinia())
    const store2 = useAudioStore()
    await useAudioPersistence(store2).hydrate()
    expect(store2.lastListenScope).toEqual({ kind: 'surah', surah: 25 })
  })

  it('never persists transient playback state', async () => {
    const store = useAudioStore()
    const p = useAudioPersistence(store)
    store.index = 5
    store.currentTime = 42
    await tick(360)
    p.dispose()
    const stored = await loadAudioPrefs()
    expect(stored).not.toHaveProperty('index')
    expect(stored).not.toHaveProperty('currentTime')
  })
})
