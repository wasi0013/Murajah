/**
 * Minimal Quran data fixtures for unit tests
 * These are small subsets of the real data for fast testing
 */

/**
 * Sample QPC layout data (pages 1-3 only)
 */
export const sampleQPCLayout = {
  pages: [
    {
      page_number: 1,
      lines: [
        { line_number: 1, first_word_id: '1:1:1', last_word_id: '1:1:4' },
        { line_number: 2, first_word_id: '1:2:1', last_word_id: '1:2:4' }
      ]
    },
    {
      page_number: 2,
      lines: [
        { line_number: 1, first_word_id: '2:1:1', last_word_id: '2:1:5' },
        { line_number: 2, first_word_id: '2:2:1', last_word_id: '2:2:5' }
      ]
    },
    {
      page_number: 3,
      lines: [
        { line_number: 1, first_word_id: '2:3:1', last_word_id: '2:3:5' }
      ]
    }
  ]
};

/**
 * Sample Indopak layout data (pages 1-3 only)
 */
export const sampleIndopakLayout = {
  pages: [
    {
      page_number: 1,
      lines: [
        { line_number: 1, first_word_id: '1:1:1', last_word_id: '1:1:4' }
      ]
    },
    {
      page_number: 2,
      lines: [
        { line_number: 1, first_word_id: '1:2:1', last_word_id: '1:2:4' }
      ]
    },
    {
      page_number: 3,
      lines: [
        { line_number: 1, first_word_id: '2:1:1', last_word_id: '2:1:5' }
      ]
    }
  ]
};

/**
 * Sample word data
 */
export const sampleWords = {
  '1:1:1': { id: '1:1:1', text: 'بِسْمِ', surah: 1, ayah: 1, position: 1 },
  '1:1:2': { id: '1:1:2', text: 'اللَّهِ', surah: 1, ayah: 1, position: 2 },
  '1:1:3': { id: '1:1:3', text: 'الرَّحْمَٰنِ', surah: 1, ayah: 1, position: 3 },
  '1:1:4': { id: '1:1:4', text: 'الرَّحِيمِ', surah: 1, ayah: 1, position: 4 },
  '1:2:1': { id: '1:2:1', text: 'الْحَمْدُ', surah: 1, ayah: 2, position: 1 },
  '1:2:2': { id: '1:2:2', text: 'لِلَّهِ', surah: 1, ayah: 2, position: 2 },
  '1:2:3': { id: '1:2:3', text: 'رَبِّ', surah: 1, ayah: 2, position: 3 },
  '1:2:4': { id: '1:2:4', text: 'الْعَالَمِينَ', surah: 1, ayah: 2, position: 4 }
};

/**
 * Sample English translations
 */
export const sampleEnglishTranslations = {
  '1:1:1': 'In the name',
  '1:1:2': 'of Allah',
  '1:1:3': 'the Most Gracious',
  '1:1:4': 'the Most Merciful',
  '1:2:1': 'All praise',
  '1:2:2': 'is for Allah',
  '1:2:3': 'Lord',
  '1:2:4': 'of the worlds'
};

/**
 * Sample Bangla translations
 */
export const sampleBanglaTranslations = {
  '1:1:1': 'আল্লাহর নামে',
  '1:1:2': 'আল্লাহ',
  '1:1:3': 'পরম করুণাময়',
  '1:1:4': 'অতি দয়ালু'
};

/**
 * Sample surah names
 */
export const sampleSurahNames = {
  1: 'الفاتحة',
  2: 'البقرة',
  3: 'آل عمران',
  114: 'الناس'
};

/**
 * Sample tafsir data (Bengali)
 */
export const sampleTafsirBn = {
  '1:1': 'বিসমিল্লাহির রাহমানির রাহীম - এই আয়াতে আল্লাহর নামে শুরু করার গুরুত্ব বোঝানো হয়েছে।',
  '1:2': 'সমস্ত প্রশংসা আল্লাহর জন্য যিনি সকল জগতের প্রতিপালক।'
};

/**
 * Sample tafsir mapping
 */
export const sampleTafsirMapping = {
  1: ['1:1', '1:2', '1:3', '1:4', '1:5', '1:6', '1:7'],
  2: ['2:1', '2:2', '2:3', '2:4', '2:5']
};

/**
 * Sample i18n translations
 */
export const sampleI18nEn = {
  app: {
    title: 'Murajah',
    loading: 'Loading...',
    welcome: 'Welcome to Murajah'
  },
  nav: {
    quran: 'Quran',
    tafsir: 'Tafsir',
    wordByWord: 'Word by Word'
  },
  settings: {
    language: 'Language',
    fontSize: 'Font Size',
    tajweed: 'Tajweed'
  },
  progress: {
    memorized: 'Memorized',
    pages: 'Pages',
    juz: 'Juz'
  }
};

/**
 * Sample i18n translations (Arabic)
 */
export const sampleI18nAr = {
  app: {
    title: 'مراجعة',
    loading: 'جار التحميل...',
    welcome: 'مرحباً بكم في مراجعة'
  },
  nav: {
    quran: 'القرآن',
    tafsir: 'التفسير',
    wordByWord: 'كلمة بكلمة'
  }
};

/**
 * Sample daily goal data
 */
export const sampleDailyGoal = {
  date: '2026-01-12',
  tasks: [
    { id: 'reciteAyahs', label: 'Recite 10 ayahs', completed: false },
    { id: 'recordRandomPage', label: 'Record a random page', completed: true, completedAt: '2026-01-12T10:30:00Z' },
    { id: 'reviewRange', label: 'Review pages 1-20', completed: false, range: { start: 1, end: 20 } }
  ],
  rotationIndex: 0
};

/**
 * Sample memorization data
 */
export const sampleMemorizedPages = [1, 2, 3, 582, 583, 584, 585, 586, 587, 588, 589, 590, 591, 592, 593, 594, 595, 596, 597, 598, 599, 600, 601, 602, 603, 604];

/**
 * Sample perfect revisions data
 */
export const samplePerfectRevisions = {
  1: 40,
  2: 45,
  3: 50,
  604: 100
};

/**
 * Sample mistakes data
 */
export const sampleMistakes = {
  1: ['1:1:2', '1:1:4'],
  2: ['1:2:1'],
  3: []
};

/**
 * Sample recordings metadata
 */
export const sampleRecordings = [
  {
    pageNumber: 1,
    recordedAt: '2026-01-10T09:00:00Z',
    duration: 120,
    timestamp: 1736503200000
  },
  {
    pageNumber: 604,
    recordedAt: '2026-01-11T14:30:00Z',
    duration: 90,
    timestamp: 1736609400000
  }
];

/**
 * Sample settings
 */
export const sampleSettings = {
  finishRevisionDays: 30,
  pagesPerDay: 1,
  fontSize: 'medium',
  tajweedEnabled: true,
  showTafsir: false,
  showWordByWord: false,
  layout: 'indopak',
  adjustRevisionChunk: 0,
  quranBackgroundColor: '#f1ece7',
  selectedTasks: ['reciteAyahs', 'recordRandomPage', 'reviewRange', 'memorizeDaily']
};

/**
 * Hasanah lookup table for score calculations (pages 1-10 only for testing)
 */
export const sampleHasanah = {
  1: 139, // Al-Fatiha
  2: 154,
  3: 188,
  4: 175,
  5: 164,
  6: 143,
  7: 150,
  8: 145,
  9: 132,
  10: 148
};

/**
 * Create a complete mock Quran data object
 */
export function createMockQuranData(layout = 'qpc') {
  return {
    layout: layout === 'qpc' ? sampleQPCLayout : sampleIndopakLayout,
    words: sampleWords,
    translations: sampleEnglishTranslations,
    translationsBn: sampleBanglaTranslations,
    surahNames: sampleSurahNames,
    tafsirMapping: sampleTafsirMapping,
    tafsir: {
      bn: sampleTafsirBn
    }
  };
}

/**
 * Create a mock app state for integration tests
 */
export function createMockAppState() {
  return {
    appStore: {
      currentPage: 1,
      isLoading: false,
      theme: 'light',
      appVersion: '26.01.12',
      errorMessage: '',
      successMessage: ''
    },
    settingsStore: { ...sampleSettings },
    memorizedStore: {
      memorizedPages: new Set(sampleMemorizedPages),
      lastUpdated: null
    },
    mistakesStore: {
      mistakes: new Map(Object.entries(sampleMistakes).map(([k, v]) => [parseInt(k), new Set(v)])),
      lastUpdated: null
    },
    audioStore: {
      recordings: [...sampleRecordings],
      isRecording: false,
      lastUpdated: null
    },
    perfectRevisionsStore: {
      perfectRevisions: new Map(Object.entries(samplePerfectRevisions).map(([k, v]) => [parseInt(k), v])),
      lastUpdated: null
    },
    dailyGoalsStore: {
      todayGoal: { ...sampleDailyGoal },
      goalHistory: [],
      streak: 5,
      longestStreak: 10,
      selectedTasks: sampleSettings.selectedTasks,
      lastUpdated: null
    }
  };
}
