import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { resolveReaderTarget } from '@/core/navigation/readerRoute'
import { surahSlug, surahForSlug } from '@/core/navigation/surahNames'
import { readerLink, mushafLink } from '@/core/navigation/readerLinks'
import type { NavIndex } from '@/core/data/types'

// A minimal QPC-shaped nav fixture (real page numbers for the asserted entries).
const nav: NavIndex = {
  surahToPage: { '1': 1, '2': 2, '25': 359, '114': 604 },
  ayahToPage: { '2:255': 42, '25:20': 363, '1:1': 1, '114:1': 604 },
  juzToPage: { '1': 1, '30': 582 },
  juzToVerse: { '1': '1:1', '30': '78:1' },
}

describe('resolveReaderTarget', () => {
  it('maps a surah to its start page (and its first ayah, to scroll to the exact line)', () => {
    expect(resolveReaderTarget({ surah: '1' }, nav)).toEqual({ page: 1, ayah: '1:1' })
    expect(resolveReaderTarget({ surah: '114' }, nav)).toEqual({ page: 604, ayah: '114:1' })
  })

  it('maps a surah + ayah to the ayah’s page, keeping the verse key', () => {
    expect(resolveReaderTarget({ surah: '2', ayah: '255' }, nav)).toEqual({ page: 42, ayah: '2:255' })
    expect(resolveReaderTarget({ surah: '25', ayah: '20' }, nav)).toEqual({ page: 363, ayah: '25:20' })
  })

  it('maps a page directly', () => {
    expect(resolveReaderTarget({ page: '50' }, nav)).toEqual({ page: 50 })
  })

  it('resolves a name-slug to the surah’s page (and its first ayah)', () => {
    expect(resolveReaderTarget({ slug: 'al-furqan' }, nav)).toEqual({ page: 359, ayah: '25:1' })
    expect(resolveReaderTarget({ slug: 'an-nas' }, nav)).toEqual({ page: 604, ayah: '114:1' })
  })

  it('returns null for out-of-range or unknown targets', () => {
    expect(resolveReaderTarget({ surah: '115' }, nav)).toBeNull()
    expect(resolveReaderTarget({ surah: '0' }, nav)).toBeNull()
    expect(resolveReaderTarget({ slug: 'nope' }, nav)).toBeNull()
    expect(resolveReaderTarget({ page: '0' }, nav)).toBeNull()
    // Ayah that doesn't exist in the index (no fabricated page).
    expect(resolveReaderTarget({ surah: '2', ayah: '999' }, nav)).toBeNull()
  })
})

describe('surah slugs', () => {
  it('round-trips every surah name through slug ⇄ number', () => {
    for (let n = 1; n <= 114; n++) {
      const slug = surahSlug(n)!
      expect(slug).toMatch(/^[a-z][a-z0-9-]*$/) // URL-safe
      expect(surahForSlug(slug)).toBe(n)
    }
  })

  it('handles apostrophes and spaces', () => {
    expect(surahSlug(1)).toBe('al-fatihah')
    expect(surahSlug(3)).toBe('ali-imran') // "Ali 'Imran"
    expect(surahSlug(5)).toBe('al-maidah') // "Al-Ma'idah"
    expect(surahForSlug('unknown')).toBeUndefined()
  })
})

describe('reader link builders', () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/page/:page(\\d+)', name: 'read-page', component: { template: '<div/>' } },
      { path: '/:surah(\\d{1,3})/:ayah(\\d+)', name: 'read-ayah', component: { template: '<div/>' } },
      { path: '/:surah(\\d{1,3})', name: 'read-surah', component: { template: '<div/>' } },
      { path: '/:slug([a-z][a-z0-9-]*)', name: 'read-slug', component: { template: '<div/>' } },
      { path: '/mushaf/:page(\\d+)?', name: 'mushaf', component: { template: '<div/>' } },
    ],
  })
  const path = (loc: Parameters<typeof router.resolve>[0]) => router.resolve(loc).path

  it('builds friendly URLs', () => {
    expect(path(readerLink({ surah: 1 }))).toBe('/1')
    expect(path(readerLink({ surah: 25, ayah: 20 }))).toBe('/25/20')
    expect(path(readerLink({ page: 5 }))).toBe('/page/5')
    expect(path(readerLink({ slug: 'al-fatihah' }))).toBe('/al-fatihah')
    expect(path(mushafLink(50))).toBe('/mushaf/50')
  })
})
