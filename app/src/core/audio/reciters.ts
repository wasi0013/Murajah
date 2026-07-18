/**
 * Reciter registries — the verse- and page-mode URL tables.
 *
 * Ported (decision 5: "keep legacy sources as-is") from `audioLoader.js` and the
 * `getAudioUrl` switch in the legacy `QuranAudioPlayerComponent`. Pure data + URL
 * builders; no I/O. See the bug catalogue for what we deliberately did *not* carry
 * over (A2: the HEAD-probe — fallback is now driven by the `<audio>` error event).
 *
 * Sourcing note: most reciters stream from everyayah.com; three verse reciters
 * (Shuraim, Ali Jaber, Luhaidan) have a primary on a single github-pages host and
 * fall back to everyayah's Shuraim if that host is unreachable.
 */

import { DEFAULT_PAGE_RECITER, DEFAULT_VERSE_RECITER } from './defaults'
import type { AudioUrls, PageReciter, VerseReciter } from './types'
import { PAGE_COUNT_QPC, SURAH_PAGE_RANGES_QPC } from '@/core/quran/surahPages'

export { DEFAULT_VERSE_RECITER, DEFAULT_PAGE_RECITER }

const pad3 = (n: number) => String(n).padStart(3, '0')

const EVERYAYAH = 'https://everyayah.com/data'
const CUSTOM = 'https://wasi0013.github.io/Murajah/recitations'
const QURAN_PROJECT = 'https://the-quran-project.github.io/Quran-Audio/Data/1'

/** everyayah per-ayah file: `{base}/{dir}/{SSS}{AAA}.mp3`. */
const everyayahVerse = (dir: string) => (s: number, a: number) =>
  `${EVERYAYAH}/${dir}/${pad3(s)}${pad3(a)}.mp3`

/** The Shuraim everyayah recitation — the shared fallback for nearly every reciter. */
const shuraimFallback = everyayahVerse('Shuraim_128kbps')

interface VerseReciterDef {
  id: string
  name: string
  primary: (s: number, a: number) => string
  /** Defaults to the everyayah Shuraim recitation. */
  fallback?: (s: number, a: number) => string
}

const VERSE_RECITER_DEFS: VerseReciterDef[] = [
  { id: 'shuraim', name: 'Sheikh Shuraim', primary: (s, a) => `${CUSTOM}/sheikh_shuraim/${pad3(s)}${pad3(a)}.mp3` },
  { id: 'ali_jaber', name: 'Ali Jaber', primary: (s, a) => `${CUSTOM}/ali_jaber/${pad3(s)}${pad3(a)}.mp3` },
  { id: 'luhaidan', name: 'Muhammad Al-Luhaidan', primary: (s, a) => `${CUSTOM}/luhaidan/${pad3(s)}${pad3(a)}.mp3` },
  {
    id: 'alafasy',
    name: 'Mishary Rashid Al Afasy',
    // Unpadded surah_ayah on the quran-project host; everyayah Alafasy as fallback.
    primary: (s, a) => `${QURAN_PROJECT}/${s}_${a}.mp3`,
    fallback: everyayahVerse('Alafasy_128kbps'),
  },
  { id: 'abdullah_matrood', name: 'Abdullah Al Matrood', primary: everyayahVerse('Abdullah_Matroud_128kbps') },
  { id: 'ahmed_al_ajmi', name: 'Sheikh Ahmed Al Ajmi', primary: everyayahVerse('ahmed_ibn_ali_al_ajamy_128kbps') },
  { id: 'maher_muaiqly', name: 'Maher Al Muaiqly', primary: everyayahVerse('MaherAlMuaiqly128kbps') },
  { id: 'khalifa_al_tunaiji', name: 'Khalifa Al Tunaiji', primary: everyayahVerse('khalefa_al_tunaiji_64kbps') },
  { id: 'abdur_rahman_as_sudais', name: 'Abdur Rahman As Sudais', primary: everyayahVerse('Abdurrahmaan_As-Sudais_192kbps') },
  { id: 'minshawy', name: 'Muhammad Siddiq Al-Minshawy', primary: everyayahVerse('Minshawy_Murattal_128kbps') },
  { id: 'ayyoub', name: 'Muhammad Ayyoub', primary: everyayahVerse('Muhammad_Ayyoub_128kbps') },
  { id: 'abdul_basit', name: 'Abdul Basit Abd El-Samad', primary: everyayahVerse('Abdul_Basit_Murattal_192kbps') },
  { id: 'abu_bakr', name: 'Abu Bakr Al Shatri', primary: everyayahVerse('Abu_Bakr_Ash-Shaatree_128kbps') },
  { id: 'nasser', name: 'Nasser Al Qatami', primary: everyayahVerse('Nasser_Alqatami_128kbps') },
  { id: 'yasser', name: 'Yasser Al Dosari', primary: everyayahVerse('Yasser_Ad-Dussary_128kbps') },
  { id: 'hani', name: 'Hani Ar Rifai', primary: everyayahVerse('Hani_Rifai_192kbps') },
  { id: 'ghamdi', name: 'Saad Al Ghamdi', primary: everyayahVerse('Ghamadi_40kbps') },
  { id: 'hudhaify', name: 'Hudhaify', primary: everyayahVerse('Hudhaify_128kbps') },
]

export const VERSE_RECITERS: VerseReciter[] = VERSE_RECITER_DEFS.map((def) => ({
  id: def.id,
  name: def.name,
  verseUrl(surah, ayah): AudioUrls {
    return {
      primary: def.primary(surah, ayah),
      fallback: (def.fallback ?? shuraimFallback)(surah, ayah),
    }
  },
}))

// —— Page mode ————————————————————————————————————————————————————————————

interface PageReciterDef {
  id: string
  name: string
  baseUrl: string
  multiPart?: boolean
}

const PAGE_RECITER_DEFS: PageReciterDef[] = [
  // Alafasy is multi-part; its files come from `alafasyBase` (baseUrl is unused here).
  { id: 'alafasy', name: 'Mishary Rashid Al Afasy', baseUrl: '', multiPart: true },
  { id: 'abdul_basit', name: 'Abdul Basit Abd El-Samad', baseUrl: `${EVERYAYAH}/Abdul_Basit_Murattal_192kbps/PageMp3s` },
  { id: 'husary', name: 'Mahmoud Khalil Al-Husary', baseUrl: `${EVERYAYAH}/Husary_128kbps/PageMp3s` },
  { id: 'ahmed_al_ajmi', name: 'Sheikh Ahmed Al Ajmi', baseUrl: `${EVERYAYAH}/Ahmed_ibn_Ali_al-Ajamy_64kbps_QuranExplorer.Com/PageMp3s` },
  { id: 'shuraim', name: 'Sheikh Shuraim', baseUrl: `${EVERYAYAH}/Saood_ash-Shuraym_128kbps/PageMp3s` },
  { id: 'ayyoub', name: 'Muhammad Ayyoub', baseUrl: `${EVERYAYAH}/Muhammad_Ayyoub_128kbps/PageMp3s` },
  { id: 'minshawy', name: 'Muhammad Siddiq Al-Minshawy', baseUrl: `${EVERYAYAH}/Minshawy_Murattal_128kbps/PageMp3s` },
  { id: 'abdur_rahman_as_sudais', name: 'Abdur Rahman As Sudais', baseUrl: `${EVERYAYAH}/Abdurrahmaan_As-Sudais_192kbps/PageMp3s` },
  { id: 'hudhaify', name: 'Hudhaify', baseUrl: `${EVERYAYAH}/Hudhaify_128kbps/PageMp3s` },
  { id: 'juhaynee', name: 'Abdullah Awad Al-Juhani', baseUrl: `${EVERYAYAH}/Abdullaah_3awwaad_Al-Juhaynee_128kbps/PageMp3s` },
  { id: 'abu_bakr', name: 'Abu Bakr Al Shatri', baseUrl: `${EVERYAYAH}/Abu_Bakr_Ash-Shaatree_128kbps/PageMp3s` },
]

/** Alafasy's multi-part page files: one per surah present on the page. */
const alafasyBase = 'https://wasi0013.github.io/VerseSplitterAI/examples/page_by_page/alafasy'

/** Alafasy's file for one surah's audio on a page (the surah's part). */
function alafasySurahPart(page: number, surah: number): string | null {
  const range = SURAH_PAGE_RANGES_QPC[surah]
  if (!range) return null
  const [startPage, endPage] = range
  if (page < startPage || page > endPage) return null
  const offset = page - startPage
  return `${alafasyBase}/page${pad3(page)}-${pad3(surah)}${pad3(offset)}.mp3`
}

function alafasyPageUrls(page: number): string[] {
  const urls: string[] = []
  for (let surah = 1; surah <= 114; surah++) {
    const url = alafasySurahPart(page, surah)
    if (url) urls.push(url)
  }
  return urls
}

export const PAGE_RECITERS: PageReciter[] = PAGE_RECITER_DEFS.map((def) => ({
  id: def.id,
  name: def.name,
  multiPart: def.multiPart ?? false,
  pageUrls(page): string[] {
    if (page < 1 || page > PAGE_COUNT_QPC) return []
    if (def.multiPart) return alafasyPageUrls(page)
    return [`${def.baseUrl}/Page${pad3(page)}.mp3`]
  },
  surahPartUrl(page, surah): string | null {
    if (page < 1 || page > PAGE_COUNT_QPC) return null
    if (def.multiPart) return alafasySurahPart(page, surah)
    // Single-file reciters: the page file is the whole page, only meaningful when
    // the page is wholly within the surah — the scope builder handles that case via
    // pageUrls and never calls this, so return null to signal "not surah-split".
    return null
  },
}))

const verseById = new Map(VERSE_RECITERS.map((r) => [r.id, r]))
const pageById = new Map(PAGE_RECITERS.map((r) => [r.id, r]))

/**
 * Reciters offered in Listen (Phase 8): page reciters that *also* have a per-ayah
 * recording, so a surah plays in one voice — page files for whole pages, the same
 * qari's verse audio at partial-page edges. Alafasy (surah-split page files) never
 * needs the verse fallback but qualifies too. Page-only reciters (Husary, Juhaynee)
 * are excluded from Listen; they stay available in the reader's page player.
 */
export const CURATED_LISTEN_RECITERS: PageReciter[] = PAGE_RECITERS.filter(
  (r) => r.multiPart || verseById.has(r.id),
)

const curatedById = new Map(CURATED_LISTEN_RECITERS.map((r) => [r.id, r]))

/**
 * The page reciter Listen should use for a stored preference: the stored one when
 * it's in the curated single-voice set, otherwise the default (Alafasy). Never
 * mutates the stored preference — Listen just plays with a curated voice when the
 * reader's pick (e.g. Husary) has no per-ayah recording for boundary pages.
 */
export function listenReciter(id: string): PageReciter {
  return curatedById.get(id) ?? pageById.get(DEFAULT_PAGE_RECITER)!
}

/** Look up a verse reciter by id, falling back to the default if unknown. */
export function verseReciter(id: string): VerseReciter {
  return verseById.get(id) ?? verseById.get(DEFAULT_VERSE_RECITER)!
}

/** Look up a page reciter by id, falling back to the default if unknown. */
export function pageReciter(id: string): PageReciter {
  return pageById.get(id) ?? pageById.get(DEFAULT_PAGE_RECITER)!
}
