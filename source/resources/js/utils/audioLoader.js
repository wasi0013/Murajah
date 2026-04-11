/**
 * Audio Loader Utility
 * Handles loading and managing Quran audio URLs
 */

/**
 * Get audio URL for a specific verse (ayah)
 * @param {number} surah - Surah number (1-114)
 * @param {number} ayah - Ayah number
 * @returns {Object} Object with primary and fallback URLs
 */
export const getVerseAudioUrl = (surah, ayah) => {
  const surahPadded = String(surah).padStart(3, '0');
  const ayahPadded = String(ayah).padStart(3, '0');

  return {
    primary: `https://the-quran-project.github.io/Quran-Audio/Data/1/${surah}_${ayah}.mp3`,
    fallback: `https://everyayah.com/data/Alafasy_128kbps/${surahPadded}${ayahPadded}.mp3`
  };
};

/**
 * Get all verses (ayahs) on a specific page from quran.json data
 * @param {number} pageNum - Page number (1-604)
 * @param {Object|Array} quranData - Quran data (can be object with surah keys or flat array)
 * @returns {Array} Array of verses with surah and ayah info
 */
export const getPageVerses = (pageNum, quranData) => {
  if (!quranData) {
    console.warn(`[Murajah] Missing quran data for page ${pageNum}`);
    return [];
  }

  let allVerses = [];
  
  // quran.json is structured as an object with surah numbers as keys
  // e.g., { "1": [{chapter, verse, page, text}, ...], "2": [...], ... }
  if (Array.isArray(quranData)) {
    allVerses = quranData;
  } else if (typeof quranData === 'object') {
    Object.values(quranData).forEach(surahVerses => {
      if (Array.isArray(surahVerses)) {
        allVerses.push(...surahVerses);
      }
    });
  }

  if (allVerses.length === 0) {
    return [];
  }

  // Filter all verses on this page and sort by surah and ayah
  const verses = allVerses
    .filter(verse => verse && verse.page === pageNum)
    .sort((a, b) => {
      if (a.chapter !== b.chapter) {
        return a.chapter - b.chapter;
      }
      return a.verse - b.verse;
    });

  return verses;
};

/**
 * Preload audio for verses to reduce delay when playing
 * @param {Array} urls - Array of audio URLs to preload
 */
export const preloadAudio = (urls) => {
  urls.forEach(url => {
    const audio = new Audio();
    audio.src = url;
    audio.preload = 'metadata';
  });
};

/**
 * Test audio URL and return working one (primary or fallback)
 * @param {string} primaryUrl - Primary URL to test
 * @param {string} fallbackUrl - Fallback URL if primary fails
 * @returns {Promise<string>} Promise that resolves to working URL
 */
export const getWorkingAudioUrl = async (primaryUrl, fallbackUrl) => {
  try {
    const response = await fetch(primaryUrl, { method: 'HEAD' });
    if (response.ok) {
      return primaryUrl;
    }
  } catch (error) {
    // CORS blocked or network error — try direct Audio element load
    try {
      await new Promise((resolve, reject) => {
        const audio = new Audio();
        audio.preload = 'metadata';
        const cleanup = () => { audio.src = ''; audio.load(); };
        audio.addEventListener('loadedmetadata', () => { cleanup(); resolve(); }, { once: true });
        audio.addEventListener('error', () => { cleanup(); reject(new Error('Audio load failed')); }, { once: true });
        audio.src = primaryUrl;
        // Timeout after 5s
        setTimeout(() => { cleanup(); reject(new Error('Audio load timeout')); }, 5000);
      });
      return primaryUrl;
    } catch {
      console.debug('[Murajah] Primary audio URL failed, trying fallback:', error);
    }
  }

  return fallbackUrl;
};

/**
 * Surah start pages for QPC layout (used for page-by-page audio URL generation)
 */
// Surah page ranges for QPC layout, derived from actual audio file set.
// Each entry is [startPage, endPage] inclusive.
const SURAH_PAGE_RANGES_QPC = {
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
  111: [603, 603], 112: [604, 604], 113: [604, 604], 114: [604, 604]
};

/**
 * Page-by-page reciter configurations.
 * Alafasy uses multi-part files (pageXXX-SSSYYY.mp3), all others use simple PageXXX.mp3.
 */
export const PAGE_RECITERS = [
  { id: 'alafasy', baseUrl: 'https://wasi0013.github.io/VerseSplitterAI/examples/page_by_page/alafasy', multiPart: true },
  { id: 'abdul_basit', baseUrl: 'https://everyayah.com/data/Abdul_Basit_Murattal_192kbps/PageMp3s', multiPart: false },
  { id: 'husary', baseUrl: 'https://everyayah.com/data/Husary_128kbps/PageMp3s', multiPart: false },
  { id: 'ahmed_al_ajmi', baseUrl: 'https://everyayah.com/data/Ahmed_ibn_Ali_al-Ajamy_64kbps_QuranExplorer.Com/PageMp3s', multiPart: false },
  { id: 'shuraim', baseUrl: 'https://everyayah.com/data/Saood_ash-Shuraym_128kbps/PageMp3s', multiPart: false },
  { id: 'ayyoub', baseUrl: 'https://everyayah.com/data/Muhammad_Ayyoub_128kbps/PageMp3s', multiPart: false },
  { id: 'minshawy', baseUrl: 'https://everyayah.com/data/Minshawy_Murattal_128kbps/PageMp3s', multiPart: false },
  { id: 'abdur_rahman_as_sudais', baseUrl: 'https://everyayah.com/data/Abdurrahmaan_As-Sudais_192kbps/PageMp3s', multiPart: false },
  { id: 'hudhaify', baseUrl: 'https://everyayah.com/data/Hudhaify_128kbps/PageMp3s', multiPart: false },
  { id: 'juhaynee', baseUrl: 'https://everyayah.com/data/Abdullaah_3awwaad_Al-Juhaynee_128kbps/PageMp3s', multiPart: false },
  { id: 'abu_bakr', baseUrl: 'https://everyayah.com/data/Abu_Bakr_Ash-Shaatree_128kbps/PageMp3s', multiPart: false }
];

/**
 * Get the list of audio file URLs for page-by-page playback.
 * For Alafasy: multi-part files (pageXXX-SSSYYY.mp3) based on surah ranges.
 * For all others: simple single file (PageXXX.mp3).
 *
 * @param {number} pageNum - Page number (1-604, QPC layout only)
 * @param {string} [reciterId='alafasy'] - Reciter ID from PAGE_RECITERS
 * @returns {Array<string>} Array of audio URLs for this page, ordered by surah
 */
export const getPageAudioUrls = (pageNum, reciterId = 'alafasy') => {
  if (pageNum < 1 || pageNum > 604) {
    return [];
  }

  const reciter = PAGE_RECITERS.find(r => r.id === reciterId) || PAGE_RECITERS[0];

  if (!reciter.multiPart) {
    const pagePadded = String(pageNum).padStart(3, '0');
    return [`${reciter.baseUrl}/Page${pagePadded}.mp3`];
  }

  // Alafasy multi-part logic
  const surahsOnPage = [];
  for (let surah = 1; surah <= 114; surah++) {
    const [startPage, endPage] = SURAH_PAGE_RANGES_QPC[surah];

    if (startPage <= pageNum && pageNum <= endPage) {
      const offset = pageNum - startPage;
      const pagePadded = String(pageNum).padStart(3, '0');
      const surahPadded = String(surah).padStart(3, '0');
      const offsetPadded = String(offset).padStart(3, '0');
      const filename = `page${pagePadded}-${surahPadded}${offsetPadded}.mp3`;
      surahsOnPage.push(`${reciter.baseUrl}/${filename}`);
    }
  }

  return surahsOnPage;
};
