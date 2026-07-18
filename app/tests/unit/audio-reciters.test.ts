import { describe, it, expect } from 'vitest'
import {
  VERSE_RECITERS,
  PAGE_RECITERS,
  CURATED_LISTEN_RECITERS,
  verseReciter,
  pageReciter,
  listenReciter,
  DEFAULT_VERSE_RECITER,
  DEFAULT_PAGE_RECITER,
} from '@/core/audio/reciters'

describe('VERSE_RECITERS', () => {
  it('every reciter yields a well-formed primary + fallback URL for a spot-check ayah', () => {
    for (const r of VERSE_RECITERS) {
      const { primary, fallback } = r.verseUrl(2, 255) // Ayat al-Kursi
      expect(primary).toMatch(/^https:\/\/\S+\.mp3$/)
      expect(fallback).toMatch(/^https:\/\/\S+\.mp3$/)
    }
  })

  it('zero-pads surah and ayah to 3 digits (everyayah convention)', () => {
    // Husary-style everyayah path: 001001.mp3 for Fatiha:1.
    const { primary } = verseReciter('minshawy').verseUrl(1, 1)
    expect(primary).toContain('/001001.mp3')
  })

  it('the custom-hosted reciters use the github-pages primary and Shuraim fallback', () => {
    const { primary, fallback } = verseReciter('luhaidan').verseUrl(114, 6)
    expect(primary).toBe('https://wasi0013.github.io/Murajah/recitations/luhaidan/114006.mp3')
    expect(fallback).toBe('https://everyayah.com/data/Shuraim_128kbps/114006.mp3')
  })

  it('Alafasy uses the unpadded quran-project primary and its own everyayah fallback', () => {
    const { primary, fallback } = verseReciter('alafasy').verseUrl(2, 255)
    expect(primary).toBe('https://the-quran-project.github.io/Quran-Audio/Data/1/2_255.mp3')
    expect(fallback).toBe('https://everyayah.com/data/Alafasy_128kbps/002255.mp3')
  })

  it('has unique ids and a resolvable default', () => {
    const ids = VERSE_RECITERS.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain(DEFAULT_VERSE_RECITER)
  })
})

describe('PAGE_RECITERS', () => {
  it('single-part reciters emit one Page{PPP}.mp3 URL', () => {
    const urls = pageReciter('husary').pageUrls(42)
    expect(urls).toEqual(['https://everyayah.com/data/Husary_128kbps/PageMp3s/Page042.mp3'])
  })

  it('Alafasy (multi-part) emits one file per surah present on the page', () => {
    // Page 604 (QPC) carries the end of surahs 112, 113, 114.
    const urls = pageReciter('alafasy').pageUrls(604)
    expect(urls.length).toBe(3)
    for (const u of urls) expect(u).toMatch(/page604-\d{6}\.mp3$/)
  })

  it('Alafasy offset is the page minus the surah start page', () => {
    // Surah 2 starts on page 2; page 3 is offset 001.
    const urls = pageReciter('alafasy').pageUrls(3)
    expect(urls).toEqual(['https://wasi0013.github.io/VerseSplitterAI/examples/page_by_page/alafasy/page003-002001.mp3'])
  })

  it('returns [] for out-of-range pages (QPC is 1..604)', () => {
    expect(pageReciter('shuraim').pageUrls(0)).toEqual([])
    expect(pageReciter('shuraim').pageUrls(605)).toEqual([])
  })

  it('has unique ids and a resolvable default', () => {
    const ids = PAGE_RECITERS.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain(DEFAULT_PAGE_RECITER)
  })
})

describe('reciter lookup', () => {
  it('falls back to the default for an unknown id', () => {
    expect(verseReciter('nope').id).toBe(DEFAULT_VERSE_RECITER)
    expect(pageReciter('nope').id).toBe(DEFAULT_PAGE_RECITER)
  })
})

describe('CURATED_LISTEN_RECITERS (single-voice set for Listen)', () => {
  it('includes Alafasy and excludes the page-only reciters (Husary, Juhaynee)', () => {
    const ids = CURATED_LISTEN_RECITERS.map((r) => r.id)
    expect(ids).toContain('alafasy')
    expect(ids).not.toContain('husary')
    expect(ids).not.toContain('juhaynee')
  })

  it('every curated reciter is either multi-part or has a matching per-ayah recording', () => {
    const verseIds = new Set(VERSE_RECITERS.map((r) => r.id))
    for (const r of CURATED_LISTEN_RECITERS) {
      expect(r.multiPart || verseIds.has(r.id)).toBe(true)
    }
  })

  it('listenReciter keeps a curated stored pick, else falls back to Alafasy', () => {
    expect(listenReciter('shuraim').id).toBe('shuraim') // curated → kept
    expect(listenReciter('husary').id).toBe(DEFAULT_PAGE_RECITER) // page-only → Alafasy
    expect(listenReciter('nope').id).toBe(DEFAULT_PAGE_RECITER)
  })
})
