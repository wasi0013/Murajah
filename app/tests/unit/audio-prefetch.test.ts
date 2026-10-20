import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createAudioPrefetcher } from '@/core/audio/prefetch'

interface Pending {
  url: string
  aborted: boolean
  respond: (res: { ok: boolean; status: number; blob: () => Promise<Blob> }) => void
}
let pending: Pending[]
let revoked: string[]
let seq = 0

const ok = (bytes = 'mp3') => ({ ok: true, status: 200, blob: async () => new Blob([bytes]) })
async function flush() {
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

beforeEach(() => {
  pending = []
  revoked = []
  seq = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (url: string, init: { signal: AbortSignal }) =>
        new Promise((resolve, reject) => {
          const p: Pending = { url, aborted: false, respond: resolve }
          init.signal.addEventListener('abort', () => {
            p.aborted = true
            reject(new DOMException('Aborted', 'AbortError'))
          })
          pending.push(p)
        }),
    ),
  )
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:${++seq}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((u: string) => {
    revoked.push(u)
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('createAudioPrefetcher', () => {
  it('resolves to an object URL only once the whole file is in memory', async () => {
    const p = createAudioPrefetcher()
    p.prefetch('a.mp3')
    expect(p.resolve('a.mp3')).toBeNull()
    pending[0].respond(ok())
    await flush()
    expect(p.resolve('a.mp3')).toBe('blob:1')
  })

  it('does not download the same URL twice', () => {
    const p = createAudioPrefetcher()
    p.prefetch('a.mp3')
    p.prefetch('a.mp3')
    expect(pending).toHaveLength(1)
  })

  it('an HTTP error or empty body is not cached, and can be retried later', async () => {
    const p = createAudioPrefetcher()
    p.prefetch('a.mp3')
    pending[0].respond({ ok: false, status: 404, blob: async () => new Blob(['x']) })
    await flush()
    expect(p.resolve('a.mp3')).toBeNull()
    p.prefetch('a.mp3')
    pending[1].respond(ok(''))
    await flush()
    expect(p.resolve('a.mp3')).toBeNull()
    p.prefetch('a.mp3')
    expect(pending).toHaveLength(3)
  })

  it('a network failure is swallowed (streaming takes over)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    const p = createAudioPrefetcher()
    p.prefetch('a.mp3')
    await flush()
    expect(p.resolve('a.mp3')).toBeNull()
  })

  it('retain aborts in-flight downloads and revokes held URLs that are not kept', async () => {
    const p = createAudioPrefetcher()
    p.prefetch('a.mp3')
    p.prefetch('b.mp3')
    p.prefetch('c.mp3')
    pending[0].respond(ok())
    await flush()
    p.retain(['b.mp3', null, undefined])
    expect(revoked).toEqual(['blob:1']) // a: held → revoked
    expect(pending[1].aborted).toBe(false) // b: kept
    expect(pending[2].aborted).toBe(true) // c: in flight → aborted
  })

  it('a download that completes after being dropped never creates a URL', async () => {
    const p = createAudioPrefetcher()
    p.prefetch('a.mp3')
    const respond = pending[0].respond
    p.clear()
    respond(ok()) // the race: response already on its way when aborted
    await flush()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(p.resolve('a.mp3')).toBeNull()
  })

  it('discard releases a single entry', async () => {
    const p = createAudioPrefetcher()
    p.prefetch('a.mp3')
    pending[0].respond(ok())
    await flush()
    p.discard('a.mp3')
    expect(revoked).toEqual(['blob:1'])
    expect(p.resolve('a.mp3')).toBeNull()
  })

  it('is a no-op where fetch/object URLs are unavailable', () => {
    vi.stubGlobal('fetch', undefined)
    const p = createAudioPrefetcher()
    p.prefetch('a.mp3')
    expect(p.resolve('a.mp3')).toBeNull()
  })

  it('an untyped / octet-stream body is retyped as MP3 (WebKit won’t sniff a blob URL)', async () => {
    let made: Blob | undefined
    vi.mocked(URL.createObjectURL).mockImplementation((b) => {
      made = b as Blob
      return 'blob:x'
    })
    const p = createAudioPrefetcher()
    p.prefetch('a.mp3')
    pending[0].respond({ ok: true, status: 200, blob: async () => new Blob(['x'], { type: 'application/octet-stream' }) })
    await flush()
    expect(made?.type).toBe('audio/mpeg')
    p.prefetch('b.mp3')
    pending[1].respond({ ok: true, status: 200, blob: async () => new Blob(['x'], { type: 'audio/wav' }) })
    await flush()
    expect(made?.type).toBe('audio/wav') // already audio: untouched
  })
})

