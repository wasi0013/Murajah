# Murajah Beta.html - Implementation Roadmap

## Quick Start Reference

### For Developer
Read these in order:
1. `UPGRADE_SUMMARY.md` - High-level overview
2. `UPGRADE_PLAN.md` - Detailed technical plan
3. `IMPLEMENTATION_ROADMAP.md` - Step-by-step actions (THIS FILE)

---

## Decision Checklist (MUST CONFIRM)

Please confirm before proceeding:

### Technical Stack
- [ ] **Vue 3** for component framework? (Yes/No)
- [ ] **Tailwind CSS** for styling? (Yes/No)
- [ ] **IndexedDB** for storage? (Yes/No)
- [ ] **Composition API** for state management? (Yes/No)

### Features & Scope
- [ ] Include **dark mode toggle**? (Yes/No)
- [ ] Include **gesture support** (swipe navigation)? (Yes/No)
- [ ] Include **offline support** (PWA-style)? (Yes/No)
- [ ] Maintain **100% backward compatibility** with data? (Yes/No)

### Timeline & Effort
- [ ] Accept **8-9 day timeline**? (Yes/No)
- [ ] **Test on actual devices** (iPhone, iPad, Android)? (Yes/No)
- [ ] **Maintain production index.html** untouched? (Yes/No)

### Questions
```
1. Any specific mobile devices to prioritize?
2. Any NEW features beyond current index.html?
3. Should we auto-detect dark mode from OS?
4. Any performance targets?
5. Any design changes desired?
```

**Once approved, proceed to implementation steps below.**

---

## Implementation Steps (14 Sequential Phases)

### PHASE 1️⃣: Project Foundation (2-3 hours)

**Objective:** Create beta.html structure with Vue and Tailwind configured

#### 1.1 Create beta.html skeleton
```bash
# Reference: quiz.html for Vue + Tailwind setup
# Features:
# - Import Vue 3 (resources/js/vue.global.js)
# - Import Tailwind (resources/js/tailwind.3.4.7.js)
# - Create <div id="app"> root
# - Basic HTML structure
```

**File:** `/Volumes/Main/personal_projects/Murajah/source/beta.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Murajah - Beta</title>
    <link rel="icon" type="image/x-icon" href="resources/favicon.ico">
    
    <!-- Vue 3 -->
    <script src="resources/js/vue.global.js"></script>
    <!-- Tailwind CSS -->
    <script src="resources/js/tailwind.3.4.7.js"></script>
    
    <style>
        :root {
            --color-primary: #2196f3;
            --color-secondary: #1976d2;
            --color-accent: #82b1ff;
        }
        
        html {
            scroll-behavior: smooth;
        }
        
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        }
        
        /* Custom dark mode fixes (copy from quiz.html) */
        /* ... dark mode styles ... */
    </style>
</head>
<body>
    <div id="app" class="min-h-screen bg-white dark:bg-gray-900 transition-colors">
        <!-- Vue app will render here -->
    </div>

    <script>
        // Vue app initialization will go here
    </script>
</body>
</html>
```

#### 1.2 Create directory structure for utilities
```
source/resources/
├── js/
│   ├── stores/
│   │   ├── appStore.js
│   │   ├── quranStore.js
│   │   ├── memorizedStore.js
│   │   ├── mistakesStore.js
│   │   ├── audioStore.js
│   │   └── settingsStore.js
│   └── utils/
│       ├── idb.js
│       ├── audioRecorder.js
│       └── calculations.js
```

**Status:** Create empty files (placeholders)

#### 1.3 Initialize git changes
```bash
git status  # Verify only beta.html and utilities are new
```

---

### PHASE 2️⃣: IndexedDB Utilities (2-3 hours)

**Objective:** Create IndexedDB wrapper that replaces localStorage

**File:** `/Volumes/Main/personal_projects/Murajah/source/resources/js/utils/idb.js`

```javascript
/**
 * IndexedDB Wrapper for Murajah
 * Replaces localStorage with structured database
 */

const DB_NAME = 'MurajahDB';
const DB_VERSION = 1;

// Define store schemas
const STORES = {
  memorizedPages: { keyPath: 'pageNumber' },
  perfectRevisions: { keyPath: 'pageNumber' },
  mistakes: { keyPath: 'id', indexes: ['pageNumber', 'wordId'] },
  audioRecordings: { keyPath: 'id', indexes: ['pageNumber', 'recordedAt'] },
  settings: { keyPath: 'key' },
  quranLayout: { keyPath: 'pageNumber' },
  quranWords: { keyPath: 'id', indexes: ['pageNumber', 'surah'] }
};

class MurajahDB {
  constructor() {
    this.db = null;
  }

  // Initialize/upgrade database
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create stores if they don't exist
        for (const [storeName, config] of Object.entries(STORES)) {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: config.keyPath });
            
            // Create indexes if specified
            if (config.indexes) {
              config.indexes.forEach(index => {
                store.createIndex(index, index, { unique: false });
              });
            }
          }
        }
      };
    });
  }

  // MEMORIZED PAGES
  async addMemorized(pageNumber) {
    const tx = this.db.transaction(['memorizedPages'], 'readwrite');
    const store = tx.objectStore('memorizedPages');
    return store.add({ pageNumber, memorizedAt: new Date().toISOString() });
  }

  async removeMemorized(pageNumber) {
    const tx = this.db.transaction(['memorizedPages'], 'readwrite');
    const store = tx.objectStore('memorizedPages');
    return store.delete(pageNumber);
  }

  async getMemorized() {
    const tx = this.db.transaction(['memorizedPages'], 'readonly');
    const store = tx.objectStore('memorizedPages');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result.map(r => r.pageNumber));
      request.onerror = () => reject(request.error);
    });
  }

  async isMemorized(pageNumber) {
    const tx = this.db.transaction(['memorizedPages'], 'readonly');
    const store = tx.objectStore('memorizedPages');
    return new Promise((resolve, reject) => {
      const request = store.get(pageNumber);
      request.onsuccess = () => resolve(!!request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // PERFECT REVISIONS
  async setPerfectCount(pageNumber, count) {
    const tx = this.db.transaction(['perfectRevisions'], 'readwrite');
    const store = tx.objectStore('perfectRevisions');
    return store.put({
      pageNumber,
      count: Math.max(0, count),
      updatedAt: new Date().toISOString()
    });
  }

  async getPerfectCount(pageNumber) {
    const tx = this.db.transaction(['perfectRevisions'], 'readonly');
    const store = tx.objectStore('perfectRevisions');
    return new Promise((resolve, reject) => {
      const request = store.get(pageNumber);
      request.onsuccess = () => resolve(request.result?.count || 0);
      request.onerror = () => reject(request.error);
    });
  }

  // MISTAKES
  async addMistake(pageNumber, wordId) {
    const tx = this.db.transaction(['mistakes'], 'readwrite');
    const store = tx.objectStore('mistakes');
    const id = `mistake-${pageNumber}-${wordId}-${Date.now()}`;
    return store.add({ id, pageNumber, wordId, timestamp: new Date().toISOString() });
  }

  async removeMistake(pageNumber, wordId) {
    const tx = this.db.transaction(['mistakes'], 'readwrite');
    const store = tx.objectStore('mistakes');
    const index = store.index('wordId');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(wordId);
      request.onsuccess = () => {
        const results = request.result.filter(r => r.pageNumber === pageNumber);
        results.forEach(r => store.delete(r.id));
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getMistakes(pageNumber) {
    const tx = this.db.transaction(['mistakes'], 'readonly');
    const store = tx.objectStore('mistakes');
    const index = store.index('pageNumber');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(pageNumber);
      request.onsuccess = () => {
        const wordIds = request.result.map(r => r.wordId);
        resolve(wordIds);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // AUDIO RECORDINGS
  async saveAudio(pageNumber, audioBlob, duration) {
    const tx = this.db.transaction(['audioRecordings'], 'readwrite');
    const store = tx.objectStore('audioRecordings');
    const id = `audio-${pageNumber}-${Date.now()}`;
    
    return store.add({
      id,
      pageNumber,
      audioBlob,
      duration,
      recordedAt: new Date().toISOString(),
      name: `Page ${pageNumber} - ${new Date().toLocaleDateString()}`
    });
  }

  async getAudio(pageNumber) {
    const tx = this.db.transaction(['audioRecordings'], 'readonly');
    const store = tx.objectStore('audioRecordings');
    const index = store.index('pageNumber');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(pageNumber);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteAudio(id) {
    const tx = this.db.transaction(['audioRecordings'], 'readwrite');
    const store = tx.objectStore('audioRecordings');
    return store.delete(id);
  }

  async getAllAudio() {
    const tx = this.db.transaction(['audioRecordings'], 'readonly');
    const store = tx.objectStore('audioRecordings');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // SETTINGS
  async setSetting(key, value) {
    const tx = this.db.transaction(['settings'], 'readwrite');
    const store = tx.objectStore('settings');
    return store.put({ key, value, updatedAt: new Date().toISOString() });
  }

  async getSetting(key, defaultValue = null) {
    const tx = this.db.transaction(['settings'], 'readonly');
    const store = tx.objectStore('settings');
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result?.value ?? defaultValue);
      request.onerror = () => reject(request.error);
    });
  }

  // BULK OPERATIONS
  async exportData() {
    const data = {};
    
    for (const storeName of Object.keys(STORES)) {
      const tx = this.db.transaction([storeName], 'readonly');
      const store = tx.objectStore(storeName);
      
      data[storeName] = await new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
          // Convert Blobs to base64 for serialization
          const items = request.result.map(item => {
            if (item.audioBlob instanceof Blob) {
              return { ...item, audioBlob: 'BLOB_DATA' }; // Handle separately
            }
            return item;
          });
          resolve(items);
        };
        request.onerror = () => reject(request.error);
      });
    }
    
    return data;
  }

  async clearAll() {
    const tx = this.db.transaction(Object.keys(STORES), 'readwrite');
    
    for (const storeName of Object.keys(STORES)) {
      const store = tx.objectStore(storeName);
      store.clear();
    }
    
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

// Export singleton instance
window.murajahDB = new MurajahDB();
```

#### 2.1 Migrate localStorage to IndexedDB wrapper
- Create function: `migrateFromLocalStorage()`
- Reads old localStorage keys
- Writes to new IndexedDB stores
- Keeps both in sync during transition

#### 2.2 Test IndexedDB operations
```javascript
// Test code
await murajahDB.init();
await murajahDB.addMemorized(1);
const mem = await murajahDB.getMemorized(); // [1]
console.log(mem);
```

**Status:** ✅ Complete before moving to Phase 3

---

### PHASE 3️⃣: Create State Stores (2-3 hours)

**Objective:** Setup Vue 3 Composition API stores using reactive()

#### 3.1 appStore.js
```javascript
import { reactive, computed } from 'vue';

export const appStore = reactive({
  currentPage: 1,
  totalPages: 604,
  isLoading: false,
  theme: 'light', // 'light' | 'dark'
  appVersion: '2.0.0-beta',
  
  // Computed
  pagePercent: computed(() => (appStore.currentPage / appStore.totalPages) * 100)
});

export const setCurrentPage = (page) => {
  appStore.currentPage = Math.max(1, Math.min(page, appStore.totalPages));
  const url = new URL(window.location);
  url.searchParams.set('page', appStore.currentPage);
  window.history.replaceState({}, '', url.toString());
};

export const setTheme = (theme) => {
  appStore.theme = theme;
  murajahDB.setSetting('theme', theme);
  document.documentElement.classList.toggle('dark', theme === 'dark');
};

export const initAppStore = async () => {
  const savedTheme = await murajahDB.getSetting('theme', 'light');
  setTheme(savedTheme);
  
  // Get page from URL
  const url = new URL(window.location);
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  appStore.currentPage = Math.max(1, Math.min(page, appStore.totalPages));
};
```

#### 3.2 quranStore.js
```javascript
import { reactive } from 'vue';

export const quranStore = reactive({
  layoutData: [],
  wordsData: {},
  surahNames: {},
  translations: {},
  isLoaded: false
});

export const loadQuranData = async () => {
  try {
    const [layout, words, surah, trans] = await Promise.all([
      fetch('./resources/qpc-v2-15-lines.json').then(r => r.json()),
      fetch('./resources/qpc-v2-word-by-word.json').then(r => r.json()),
      fetch('./resources/surah-names.json').then(r => r.json()),
      fetch('./resources/english-wbw-translation.json').then(r => r.json())
    ]);
    
    quranStore.layoutData = layout.pages || [];
    quranStore.wordsData = words;
    quranStore.surahNames = surah;
    quranStore.translations = trans;
    quranStore.isLoaded = true;
  } catch (error) {
    console.error('Failed to load Quran data:', error);
  }
};

export const getPageLines = (pageNum) => {
  return quranStore.layoutData.filter(l => l.page_number === pageNum);
};

export const getWordById = (wordId) => {
  for (const key in quranStore.wordsData) {
    if (quranStore.wordsData[key].id === wordId) {
      return quranStore.wordsData[key];
    }
  }
  return null;
};

export const getSurahName = (num) => {
  return quranStore.surahNames?.[num] || `Surah ${num}`;
};
```

#### 3.3 memorizedStore.js
```javascript
import { reactive, computed } from 'vue';

export const memorizedStore = reactive({
  memorizedPages: new Set(),
  
  // Computed stats
  count: computed(() => memorizedStore.memorizedPages.size),
  percentage: computed(() => 
    Math.round((memorizedStore.count / 604) * 100)
  ),
  juzCount: computed(() => 
    Math.floor(memorizedStore.count / 20)
  )
});

export const toggleMemorized = async (pageNum) => {
  if (memorizedStore.memorizedPages.has(pageNum)) {
    memorizedStore.memorizedPages.delete(pageNum);
    await murajahDB.removeMemorized(pageNum);
  } else {
    memorizedStore.memorizedPages.add(pageNum);
    await murajahDB.addMemorized(pageNum);
  }
};

export const isMemorized = (pageNum) => {
  return memorizedStore.memorizedPages.has(pageNum);
};

export const bulkMarkMemorized = async (start, end) => {
  for (let p = start; p <= end; p++) {
    memorizedStore.memorizedPages.add(p);
    await murajahDB.addMemorized(p);
  }
};

export const loadMemorizedPages = async () => {
  const pages = await murajahDB.getMemorized();
  memorizedStore.memorizedPages = new Set(pages);
};
```

#### 3.4 mistakesStore.js, audioStore.js, settingsStore.js
*Similar structure as above*

**Status:** Create all 6 store files

---

### PHASE 4️⃣: Build QuranPage Component (2-3 hours)

**File:** Inline component in beta.html

```javascript
const QuranPageComponent = {
  template: `
    <div class="quran-page-container">
      <div class="max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-8">
        <!-- Quran lines -->
        <div v-for="line in pageLines" :key="line.id" class="quran-line mb-8">
          <!-- Words within line -->
          <span v-for="word in line.words" :key="word.id"
            class="quran-word cursor-pointer hover:bg-blue-100"
            :class="{ 'mistake-word': isMistake(word.id) }"
            @click="handleWordClick(word)">
            {{ word.text }}
          </span>
        </div>
      </div>
    </div>
  `,
  
  data() {
    return {
      quranStore,
      mistakesStore,
      currentPage: appStore.currentPage
    };
  },
  
  computed: {
    pageLines() {
      return getPageLines(appStore.currentPage);
    }
  },
  
  methods: {
    isMistake(wordId) {
      return mistakesStore.mistakes[appStore.currentPage]?.has(wordId);
    },
    
    handleWordClick(word) {
      // Show translation tooltip or toggle mistake
      console.log('Word clicked:', word);
    }
  }
};
```

---

### PHASE 5️⃣: Build Navigation Component (1-2 hours)

Component controls: Previous, Next, Page number, Go button

---

### PHASE 6️⃣: Build Dashboard Component (2-3 hours)

Includes:
- Progress bar
- Stats (memorized count, percentage)
- Juz pie chart
- Estimated completion date
- Settings form

---

### PHASE 7️⃣: Build Mistake Tracker (1-2 hours)

Bubble grid with mistake counts, clickable to navigate

---

### PHASE 8️⃣: Build Audio System (2-3 hours)

Recording, playback, delete, playlist display

---

### PHASE 9️⃣: Build Memorization Grid (1-2 hours)

Visual grid of all 604 pages with memorization status

---

### PHASE 🔟: Build Settings/Modals (1-2 hours)

Export, Import, Reset, Dark mode toggle, Theme selection

---

### PHASE 1️⃣1️⃣: Responsive Design Polish (2-3 hours)

Test and adjust layouts for:
- Mobile (320px)
- Tablet (768px)
- Desktop (1024px+)

---

### PHASE 1️⃣2️⃣: Dark Mode Implementation (1-2 hours)

Tailwind dark: utilities, toggle button, persistence

---

### PHASE 1️⃣3️⃣: Testing & QA (3-4 hours)

- Feature parity check
- Device testing (iPhone, iPad, Android)
- Browser testing (Chrome, Firefox, Safari)
- Performance profiling
- Accessibility audit

---

### PHASE 1️⃣4️⃣: Optimization & Deployment (1-2 hours)

- Remove unused CSS
- Minify code
- Optimize images
- Bundle size analysis
- Final QA

---

## Testing Checklist

### Functional Testing
- [ ] Page navigation works (prev/next)
- [ ] Go to page works
- [ ] Memorize button toggles correctly
- [ ] Perfect revision counter increments
- [ ] Mistake tracking works (click word)
- [ ] Audio recording/playback works
- [ ] Export/Import works
- [ ] Dark mode toggles correctly
- [ ] Settings persist after reload

### Responsive Testing
- [ ] iPhone SE (375px) - Usable
- [ ] iPhone 14 (390px) - Excellent
- [ ] iPad (768px) - Optimized
- [ ] iPad Pro (1024px) - Full featured
- [ ] Desktop (1920px) - Full featured

### Performance Testing
- [ ] Page load < 2s (mobile)
- [ ] Interaction response < 100ms
- [ ] 60 FPS animations
- [ ] Memory stable (no leaks)
- [ ] No console errors

### Accessibility Testing
- [ ] WCAG AA contrast ratio
- [ ] Keyboard navigation works
- [ ] Screen reader compatible
- [ ] Touch targets >= 44x44px
- [ ] Focus management correct

### Data Testing
- [ ] Data migrates from localStorage
- [ ] Export file is valid JSON
- [ ] Import restores all data
- [ ] No data loss during migration
- [ ] IndexedDB properly populated

---

## Rollback Plan

If beta.html has issues:

1. Keep index.html in production (unchanged)
2. Users can switch back via URL
3. Run data export before upgrading
4. Test beta on staging first
5. Gradual rollout strategy

---

## Success Criteria (Final)

✅ **Must Have:**
- [ ] Responsive on all devices
- [ ] All features working
- [ ] No data loss
- [ ] Fast performance
- [ ] No console errors

✅ **Should Have:**
- [ ] Dark mode working
- [ ] Accessibility good
- [ ] Smooth animations
- [ ] Export/Import working
- [ ] Audio system working

✅ **Nice to Have:**
- [ ] Gesture navigation
- [ ] Advanced analytics
- [ ] PWA support
- [ ] Offline functionality

---

## Resources

### Vue 3
- File: `resources/js/vue.global.js`
- Docs: https://vuejs.org/guide/

### Tailwind CSS
- File: `resources/js/tailwind.3.4.7.js`
- Docs: https://tailwindcss.com/
- Dark mode: https://tailwindcss.com/docs/dark-mode

### IndexedDB
- MDN: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API

### Reference
- `quiz.html` - Vue + Tailwind example
- `index.html` - Features to migrate

---

## Estimated Total Time

```
Phase 1-3:  Foundation        (6-8 hours)
Phase 4-9:  Components        (14-18 hours)
Phase 10-11: Features & Polish (6-8 hours)
Phase 12-14: Testing & QA     (8-10 hours)
─────────────────────────────────────────
Total:      34-44 developer hours
```

**Timeline:** 8-9 working days (assuming part-time development)

---

## Support & Questions

If you get stuck:

1. Check `index.html` for reference implementation
2. Check `quiz.html` for Vue/Tailwind patterns
3. Test IndexedDB operations in console
4. Use Vue DevTools for debugging
5. Check browser console for errors

---

**Status:** ⏳ Awaiting confirmation to start Phase 1

**Questions before we proceed?**
