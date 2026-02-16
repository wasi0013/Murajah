/**
 * Test helpers for Murajah tests
 * Common utilities for setting up test environments
 */

/**
 * Wait for a specified number of milliseconds
 * @param {number} ms - Milliseconds to wait
 */
export const wait = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Clear all IndexedDB databases used by Murajah
 */
export async function clearAllDatabases() {
  const dbNames = ['murajah-db', 'quiz-db', 'test-db'];
  
  for (const dbName of dbNames) {
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve(); // Continue even if blocked
    });
  }
}

/**
 * Create a mock MurajahDB instance for testing
 * This mirrors the class defined in index.html
 */
export class MockMurajahDB {
  constructor() {
    this.dbName = 'murajah-db';
    this.version = 5;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        if (!db.objectStoreNames.contains('appData')) {
          db.createObjectStore('appData', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('recordings')) {
          db.createObjectStore('recordings', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('dailyGoals')) {
          db.createObjectStore('dailyGoals', { keyPath: 'date' });
        }
        if (!db.objectStoreNames.contains('quranCache')) {
          db.createObjectStore('quranCache', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('resourceCache')) {
          db.createObjectStore('resourceCache', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('notes')) {
          db.createObjectStore('notes', { keyPath: 'id' });
        }
      };
    });
  }

  async saveData(data) {
    const tx = this.db.transaction(['appData'], 'readwrite');
    const store = tx.objectStore('appData');
    store.put({ id: 'murajah-data', ...data });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async loadData() {
    const tx = this.db.transaction(['appData'], 'readonly');
    const store = tx.objectStore('appData');
    return new Promise((resolve, reject) => {
      const request = store.get('murajah-data');
      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          const { id, ...data } = result;
          resolve(data);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clearAll() {
    const storeNames = ['appData', 'recordings', 'dailyGoals', 'resourceCache'];
    if (this.db.objectStoreNames.contains('notes')) {
      storeNames.push('notes');
    }
    const tx = this.db.transaction(storeNames, 'readwrite');
    tx.objectStore('appData').clear();
    tx.objectStore('recordings').clear();
    tx.objectStore('dailyGoals').clear();
    tx.objectStore('resourceCache').clear();
    if (this.db.objectStoreNames.contains('notes')) {
      tx.objectStore('notes').clear();
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async saveRecording(index, recording) {
    const tx = this.db.transaction(['recordings'], 'readwrite');
    const store = tx.objectStore('recordings');
    store.put({ id: `recording-${index}`, ...recording });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async loadRecording(index) {
    const tx = this.db.transaction(['recordings'], 'readonly');
    const store = tx.objectStore('recordings');
    return new Promise((resolve, reject) => {
      const request = store.get(`recording-${index}`);
      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          const { id, ...data } = result;
          resolve(data);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteRecording(index) {
    const tx = this.db.transaction(['recordings'], 'readwrite');
    const store = tx.objectStore('recordings');
    store.delete(`recording-${index}`);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async saveTheme(theme) {
    const tx = this.db.transaction(['appData'], 'readwrite');
    const store = tx.objectStore('appData');
    store.put({ id: 'murajah-theme', value: theme });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async loadTheme() {
    const tx = this.db.transaction(['appData'], 'readonly');
    const store = tx.objectStore('appData');
    return new Promise((resolve, reject) => {
      const request = store.get('murajah-theme');
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : 'light');
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveLanguage(locale) {
    const tx = this.db.transaction(['appData'], 'readwrite');
    const store = tx.objectStore('appData');
    store.put({ id: 'murajah-language', value: locale });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async loadLanguage(defaultLocale = 'en') {
    const tx = this.db.transaction(['appData'], 'readonly');
    const store = tx.objectStore('appData');
    return new Promise((resolve, reject) => {
      const request = store.get('murajah-language');
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : defaultLocale);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveReciter(reciterId) {
    const tx = this.db.transaction(['appData'], 'readwrite');
    const store = tx.objectStore('appData');
    store.put({ id: 'murajah-reciter', value: reciterId });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async loadReciter(defaultReciter = 'shuraim') {
    const tx = this.db.transaction(['appData'], 'readonly');
    const store = tx.objectStore('appData');
    return new Promise((resolve, reject) => {
      const request = store.get('murajah-reciter');
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : defaultReciter);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveDailyGoal(dailyGoal) {
    const tx = this.db.transaction(['dailyGoals'], 'readwrite');
    const store = tx.objectStore('dailyGoals');
    store.put({ ...dailyGoal, savedAt: new Date().toISOString() });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async loadDailyGoal(date) {
    const tx = this.db.transaction(['dailyGoals'], 'readonly');
    const store = tx.objectStore('dailyGoals');
    return new Promise((resolve, reject) => {
      const request = store.get(date);
      request.onsuccess = () => {
        resolve(request.result || null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async loadDailyGoalHistory(daysBack = 90) {
    const tx = this.db.transaction(['dailyGoals'], 'readonly');
    const store = tx.objectStore('dailyGoals');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const allRecords = request.result;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysBack);
        const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
        const recentRecords = allRecords.filter(record => record.date >= cutoffDateStr);
        resolve(recentRecords.sort((a, b) => new Date(a.date) - new Date(b.date)));
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteDailyGoal(date) {
    const tx = this.db.transaction(['dailyGoals'], 'readwrite');
    const store = tx.objectStore('dailyGoals');
    store.delete(date);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async setSetting(key, value) {
    const tx = this.db.transaction(['appData'], 'readwrite');
    const store = tx.objectStore('appData');
    store.put({ id: `setting-${key}`, value: value });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getSetting(key, defaultValue = null) {
    const tx = this.db.transaction(['appData'], 'readonly');
    const store = tx.objectStore('appData');
    return new Promise((resolve, reject) => {
      const request = store.get(`setting-${key}`);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : defaultValue);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveUrlState(state) {
    const tx = this.db.transaction(['appData'], 'readwrite');
    const store = tx.objectStore('appData');
    store.put({ id: 'murajah-url-state', ...state, savedAt: new Date().toISOString() });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async loadUrlState() {
    const tx = this.db.transaction(['appData'], 'readonly');
    const store = tx.objectStore('appData');
    return new Promise((resolve, reject) => {
      const request = store.get('murajah-url-state');
      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          const { id, savedAt, ...state } = result;
          resolve(state);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveCachedResource(record) {
    if (!record || !record.id) {
      throw new Error('Cache record must include an id field');
    }
    const tx = this.db.transaction(['quranCache'], 'readwrite');
    const store = tx.objectStore('quranCache');
    store.put(record);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async loadCachedResource(cacheId) {
    const tx = this.db.transaction(['quranCache'], 'readonly');
    const store = tx.objectStore('quranCache');
    return new Promise((resolve, reject) => {
      const request = store.get(cacheId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async setLanguageSelectionFlag() {
    const tx = this.db.transaction(['appData'], 'readwrite');
    const store = tx.objectStore('appData');
    store.put({ id: 'murajah-language-selected', value: true });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async hasLanguageBeenSelected() {
    const tx = this.db.transaction(['appData'], 'readonly');
    const store = tx.objectStore('appData');
    return new Promise((resolve, reject) => {
      const request = store.get('murajah-language-selected');
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : false);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // ── Notes CRUD ──

  async saveNote(note) {
    const tx = this.db.transaction(['notes'], 'readwrite');
    const store = tx.objectStore('notes');
    store.put(note);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async loadNote(noteId) {
    const tx = this.db.transaction(['notes'], 'readonly');
    const store = tx.objectStore('notes');
    return new Promise((resolve, reject) => {
      const request = store.get(noteId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async loadAllNotes() {
    const tx = this.db.transaction(['notes'], 'readonly');
    const store = tx.objectStore('notes');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteNote(noteId) {
    const tx = this.db.transaction(['notes'], 'readwrite');
    const store = tx.objectStore('notes');
    store.delete(noteId);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

/**
 * Create mock fetch responses for JSON files
 */
export function createFetchMock(responses = {}) {
  return (url) => {
    const urlString = typeof url === 'string' ? url : url.toString();
    
    for (const [pattern, response] of Object.entries(responses)) {
      if (urlString.includes(pattern)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(response),
          text: () => Promise.resolve(JSON.stringify(response)),
          clone: function() { return this; }
        });
      }
    }
    
    // Default 404 response
    return Promise.resolve({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    });
  };
}

/**
 * Mock MediaRecorder for audio tests
 */
export class MockMediaRecorder {
  constructor(stream) {
    this.stream = stream;
    this.state = 'inactive';
    this.ondataavailable = null;
    this.onstop = null;
    this.onerror = null;
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    if (this.ondataavailable) {
      this.ondataavailable({ data: new Blob(['test'], { type: 'audio/webm' }) });
    }
    if (this.onstop) {
      this.onstop();
    }
  }

  static isTypeSupported(type) {
    return type === 'audio/webm' || type === 'audio/mp4';
  }
}

/**
 * Mock navigator.mediaDevices for audio tests
 */
export const mockMediaDevices = {
  getUserMedia: () => Promise.resolve({
    getTracks: () => [{ stop: () => {} }]
  })
};

/**
 * Assert that two arrays have the same elements (order-independent)
 */
export function assertSameElements(actual, expected) {
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  expect(sortedActual).toEqual(sortedExpected);
}

/**
 * Create a date string in YYYY-MM-DD format
 */
export function formatDateString(date = new Date()) {
  return date.toISOString().split('T')[0];
}

/**
 * Get date N days ago
 */
export function daysAgo(n) {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return date;
}
