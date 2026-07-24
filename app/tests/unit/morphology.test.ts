import { describe, it, expect, vi } from 'vitest'
import { useMorphology } from '@/composables/useMorphology'
import type { DataClient } from '@/core/data'

function mockData() {
  const getMorphology = vi.fn(async (surah: number) =>
    surah === 1 ? { '1:1:1': '<i>bism</i>', '1:1:2': '<i>allah</i>' } : {},
  )
  return { init: vi.fn(async () => ({})), getMorphology } as unknown as DataClient & {
    getMorphology: ReturnType<typeof vi.fn>
  }
}

const el = () => document.createElement('span')
const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('useMorphology', () => {
  it('loads a word’s analysis and exposes open/active state', async () => {
    const data = mockData()
    const m = useMorphology(data)
    expect(m.open.value).toBe(false)

    await m.openFor('1:1:1', el())
    expect(m.open.value).toBe(true)
    expect(m.location.value).toBe('1:1:1')
    expect(m.content.value).toBe('<i>bism</i>')
  })

  it('caches per surah — only one fetch for repeated taps in the same surah', async () => {
    const data = mockData()
    const m = useMorphology(data)
    await m.openFor('1:1:1', el())
    await m.openFor('1:1:2', el())
    expect(m.content.value).toBe('<i>allah</i>')
    expect(data.getMorphology).toHaveBeenCalledTimes(1) // surah 1 fetched once
  })

  it('shows null content when a word has no analysis', async () => {
    const data = mockData()
    const m = useMorphology(data)
    await m.openFor('2:1:1', el()) // surah 2 → empty map
    expect(m.content.value).toBeNull()
  })

  it('close() clears the active word', async () => {
    const data = mockData()
    const m = useMorphology(data)
    await m.openFor('1:1:1', el())
    m.close()
    expect(m.open.value).toBe(false)
    expect(m.location.value).toBeNull()
    expect(m.anchor.value).toBeNull()
  })

  it('ignores a stale fetch if the user tapped a different word meanwhile', async () => {
    let resolveFirst: (v: Record<string, string>) => void = () => {}
    const getMorphology = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
      .mockImplementationOnce(async () => ({ '1:2:1': 'second' }))
    const data = { init: vi.fn(async () => ({})), getMorphology } as unknown as DataClient

    const m = useMorphology(data)
    const p1 = m.openFor('3:1:1', el()) // slow surah-3 fetch (pending)
    const p2 = m.openFor('1:2:1', el()) // surah-1 resolves immediately
    await flush() // let both fetches start (so resolveFirst is wired up)
    resolveFirst({ '3:1:1': 'stale' }) // late surah-3 result arrives after
    await Promise.all([p1, p2])
    await flush()
    // Active word is 1:2:1 — the stale surah-3 content must not clobber it.
    expect(m.location.value).toBe('1:2:1')
    expect(m.content.value).toBe('second')
  })
})
