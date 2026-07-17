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

import type { AudioUrls, PageReciter, VerseReciter } from './types'

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

/** Default verse reciter (the app's historical default). */
export const DEFAULT_VERSE_RECITER = 'shuraim'

// —— Page mode ————————————————————————————————————————————————————————————

/**
 * Surah page ranges for the QPC layout, `[startPage, endPage]` inclusive. Only the
 * multi-part reciter (Alafasy) needs these, to compute the per-surah file offset on
 * a page. Ported verbatim from the legacy `SURAH_PAGE_RANGES_QPC`.
 */
const SURAH_PAGE_RANGES_QPC: Record<number, [number, number]> = {
  1: [1, 1], 2: [2, 49], 3: [50, 76], 4: [77, 106], 5: [106, 127],
  6: [128, 150], 7: [151, 176], 8: [177, 186], 9: [187, 207], 10: [208, 221],
  11: [221, 235], 12: [235, 248], 13: [249, 255], 14: [255, 261], 15: [262, 267],
  16: [267, 281], 17: [282, 293], 18: [293, 304], 19: [305, 312], 20: [312, 321],
  21: [322, 331], 22: [332, 341], 23: [342, 349], 24: [350, 359], 25: [359, 366],
  26: [367, 376], 27: [377, 385], 28: [385, 396], 29: [396, 404], 30: [404, 410],
  31: [411, 414], 32: [415, 417], 33: [418, 427], 34: [428, 434], 35: [434, 440],
  36: [440, 445], 37: [446, 452], 38: [453, 458], 39: [458, 467], 40: [467, 476],
  41: [477, 482], 42: [483, 489], 43: [489, 495], 44: [496, 498], 45: [499, 502],
  46: [502, 506], 47: [507, 510], 48: [511, 515], 49: [515, 517], 50: [518, 520],
  51: [520, 523], 52: [523, 525], 53: [526, 528], 54: [528, 531], 55: [531, 534],
  56: [534, 537], 57: [537, 541], 58: [542, 545], 59: [545, 548], 60: [549, 551],
  61: [551, 552], 62: [553, 554], 63: [554, 555], 64: [556, 557], 65: [558, 559],
  66: [560, 561], 67: [562, 564], 68: [564, 566], 69: [566, 568], 70: [568, 570],
  71: [570, 571], 72: [572, 573], 73: [574, 575], 74: [575, 577], 75: [577, 578],
  76: [578, 580], 77: [580, 581], 78: [582, 583], 79: [583, 584], 80: [585, 586],
  81: [586, 586], 82: [587, 587], 83: [587, 589], 84: [589, 590], 85: [590, 590],
  86: [591, 591], 87: [591, 592], 88: [592, 593], 89: [593, 594], 90: [594, 595],
  91: [595, 595], 92: [595, 596], 93: [596, 596], 94: [596, 597], 95: [597, 597],
  96: [597, 598], 97: [598, 598], 98: [598, 599], 99: [599, 599], 100: [599, 600],
  101: [600, 600], 102: [600, 600], 103: [601, 601], 104: [601, 601], 105: [601, 601],
  106: [602, 602], 107: [602, 602], 108: [602, 602], 109: [603, 603], 110: [603, 603],
  111: [603, 603], 112: [604, 604], 113: [604, 604], 114: [604, 604],
}

const PAGE_COUNT_QPC = 604

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

function alafasyPageUrls(page: number): string[] {
  const urls: string[] = []
  for (let surah = 1; surah <= 114; surah++) {
    const [startPage, endPage] = SURAH_PAGE_RANGES_QPC[surah]
    if (startPage <= page && page <= endPage) {
      const offset = page - startPage
      urls.push(`${alafasyBase}/page${pad3(page)}-${pad3(surah)}${pad3(offset)}.mp3`)
    }
  }
  return urls
}

export const PAGE_RECITERS: PageReciter[] = PAGE_RECITER_DEFS.map((def) => ({
  id: def.id,
  name: def.name,
  pageUrls(page): string[] {
    if (page < 1 || page > PAGE_COUNT_QPC) return []
    if (def.multiPart) return alafasyPageUrls(page)
    return [`${def.baseUrl}/Page${pad3(page)}.mp3`]
  },
}))

/** Default page reciter (the app's historical default). */
export const DEFAULT_PAGE_RECITER = 'alafasy'

const verseById = new Map(VERSE_RECITERS.map((r) => [r.id, r]))
const pageById = new Map(PAGE_RECITERS.map((r) => [r.id, r]))

/** Look up a verse reciter by id, falling back to the default if unknown. */
export function verseReciter(id: string): VerseReciter {
  return verseById.get(id) ?? verseById.get(DEFAULT_VERSE_RECITER)!
}

/** Look up a page reciter by id, falling back to the default if unknown. */
export function pageReciter(id: string): PageReciter {
  return pageById.get(id) ?? pageById.get(DEFAULT_PAGE_RECITER)!
}
