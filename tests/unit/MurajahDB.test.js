/**
 * Unit tests for MurajahDB class
 * Tests all IndexedDB operations for data persistence
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockMurajahDB, clearAllDatabases, wait, formatDateString, daysAgo } from '../utils/testHelpers.js';
import { sampleSettings, sampleDailyGoal, sampleRecordings } from '../fixtures/quranData.js';

describe('MurajahDB', () => {
  let db;

  beforeEach(async () => {
    await clearAllDatabases();
    db = new MockMurajahDB();
    await db.init();
  });

  afterEach(async () => {
    if (db && db.db) {
      db.db.close();
    }
    await clearAllDatabases();
  });

  describe('init()', () => {
    it('should initialize IndexedDB with correct version', async () => {
      expect(db.db).toBeDefined();
      expect(db.db.version).toBe(5);
    });

    it('should create all required object stores', async () => {
      const storeNames = Array.from(db.db.objectStoreNames);
      expect(storeNames).toContain('appData');
      expect(storeNames).toContain('recordings');
      expect(storeNames).toContain('dailyGoals');
      expect(storeNames).toContain('quranCache');
      expect(storeNames).toContain('resourceCache');
    });
  });

  describe('saveData() / loadData()', () => {
    it('should save and load app data correctly', async () => {
      const testData = {
        memorized: [1, 2, 3, 604],
        perfectRevisions: { '1': 40, '604': 100 },
        mistakes: { '1': ['1:1:2'] },
        settings: sampleSettings,
        lastSaved: new Date().toISOString()
      };

      await db.saveData(testData);
      const loaded = await db.loadData();

      expect(loaded).toBeDefined();
      expect(loaded.memorized).toEqual([1, 2, 3, 604]);
      expect(loaded.perfectRevisions).toEqual({ '1': 40, '604': 100 });
      expect(loaded.settings.fontSize).toBe('medium');
    });

    it('should return null when no data exists', async () => {
      const loaded = await db.loadData();
      expect(loaded).toBeNull();
    });

    it('should overwrite existing data on save', async () => {
      await db.saveData({ memorized: [1, 2] });
      await db.saveData({ memorized: [3, 4, 5] });
      
      const loaded = await db.loadData();
      expect(loaded.memorized).toEqual([3, 4, 5]);
    });
  });

  describe('clearAll()', () => {
    it('should clear all data from all stores', async () => {
      // Save data to multiple stores
      await db.saveData({ memorized: [1, 2, 3] });
      await db.saveTheme('dark');
      await db.saveRecording(0, { pageNumber: 1, duration: 60 });
      await db.saveDailyGoal({ date: '2026-01-12', tasks: [] });

      // Clear all
      await db.clearAll();

      // Verify all cleared
      expect(await db.loadData()).toBeNull();
      expect(await db.loadTheme()).toBe('light'); // Default
      expect(await db.loadRecording(0)).toBeNull();
      expect(await db.loadDailyGoal('2026-01-12')).toBeNull();
    });
  });

  describe('saveRecording() / loadRecording() / deleteRecording()', () => {
    it('should save and load a recording', async () => {
      const recording = {
        pageNumber: 604,
        duration: 120,
        recordedAt: '2026-01-12T10:00:00Z',
        blob: new Blob(['test'], { type: 'audio/webm' })
      };

      await db.saveRecording(0, recording);
      const loaded = await db.loadRecording(0);

      expect(loaded).toBeDefined();
      expect(loaded.pageNumber).toBe(604);
      expect(loaded.duration).toBe(120);
    });

    it('should return null for non-existent recording', async () => {
      const loaded = await db.loadRecording(999);
      expect(loaded).toBeNull();
    });

    it('should delete a recording', async () => {
      await db.saveRecording(0, { pageNumber: 1, duration: 60 });
      await db.deleteRecording(0);
      
      const loaded = await db.loadRecording(0);
      expect(loaded).toBeNull();
    });

    it('should handle multiple recordings with different indices', async () => {
      await db.saveRecording(0, { pageNumber: 1 });
      await db.saveRecording(1, { pageNumber: 2 });
      await db.saveRecording(2, { pageNumber: 3 });

      expect((await db.loadRecording(0)).pageNumber).toBe(1);
      expect((await db.loadRecording(1)).pageNumber).toBe(2);
      expect((await db.loadRecording(2)).pageNumber).toBe(3);
    });
  });

  describe('saveTheme() / loadTheme()', () => {
    it('should save and load theme', async () => {
      await db.saveTheme('dark');
      const theme = await db.loadTheme();
      expect(theme).toBe('dark');
    });

    it('should return "light" as default theme', async () => {
      const theme = await db.loadTheme();
      expect(theme).toBe('light');
    });
  });

  describe('saveLanguage() / loadLanguage()', () => {
    it('should save and load language', async () => {
      await db.saveLanguage('ar');
      const lang = await db.loadLanguage();
      expect(lang).toBe('ar');
    });

    it('should return default language when not set', async () => {
      expect(await db.loadLanguage()).toBe('en');
      expect(await db.loadLanguage('bn')).toBe('bn'); // Custom default
    });
  });

  describe('saveReciter() / loadReciter()', () => {
    it('should save and load reciter preference', async () => {
      await db.saveReciter('ali_jaber');
      const reciter = await db.loadReciter();
      expect(reciter).toBe('ali_jaber');
    });

    it('should return "shuraim" as default reciter', async () => {
      const reciter = await db.loadReciter();
      expect(reciter).toBe('shuraim');
    });
  });

  describe('Daily Goals: saveDailyGoal() / loadDailyGoal() / loadDailyGoalHistory() / deleteDailyGoal()', () => {
    it('should save and load a daily goal', async () => {
      await db.saveDailyGoal(sampleDailyGoal);
      const loaded = await db.loadDailyGoal('2026-01-12');

      expect(loaded).toBeDefined();
      expect(loaded.date).toBe('2026-01-12');
      expect(loaded.tasks).toHaveLength(3);
      expect(loaded.savedAt).toBeDefined();
    });

    it('should return null for non-existent date', async () => {
      const loaded = await db.loadDailyGoal('1999-01-01');
      expect(loaded).toBeNull();
    });

    it('should load goal history within date range', async () => {
      // Save goals for last 5 days
      for (let i = 0; i < 5; i++) {
        const date = formatDateString(daysAgo(i));
        await db.saveDailyGoal({ date, tasks: [], rotationIndex: i });
      }

      const history = await db.loadDailyGoalHistory(10);
      expect(history.length).toBe(5);
      
      // Should be sorted by date ascending
      for (let i = 1; i < history.length; i++) {
        expect(new Date(history[i].date) >= new Date(history[i-1].date)).toBe(true);
      }
    });

    it('should filter out goals older than daysBack', async () => {
      // Save a goal from 100 days ago
      const oldDate = formatDateString(daysAgo(100));
      await db.saveDailyGoal({ date: oldDate, tasks: [] });
      
      // Save today's goal
      const today = formatDateString(new Date());
      await db.saveDailyGoal({ date: today, tasks: [] });

      const history = await db.loadDailyGoalHistory(30);
      expect(history.length).toBe(1);
      expect(history[0].date).toBe(today);
    });

    it('should delete a daily goal', async () => {
      await db.saveDailyGoal({ date: '2026-01-12', tasks: [] });
      await db.deleteDailyGoal('2026-01-12');
      
      const loaded = await db.loadDailyGoal('2026-01-12');
      expect(loaded).toBeNull();
    });
  });

  describe('setSetting() / getSetting()', () => {
    it('should save and retrieve individual settings', async () => {
      await db.setSetting('showTafsir', true);
      await db.setSetting('fontSize', 'large');
      await db.setSetting('customValue', { nested: 'object' });

      expect(await db.getSetting('showTafsir')).toBe(true);
      expect(await db.getSetting('fontSize')).toBe('large');
      expect(await db.getSetting('customValue')).toEqual({ nested: 'object' });
    });

    it('should return default value for non-existent setting', async () => {
      expect(await db.getSetting('nonExistent')).toBeNull();
      expect(await db.getSetting('nonExistent', 'default')).toBe('default');
      expect(await db.getSetting('nonExistent', false)).toBe(false);
    });

    it('should overwrite existing setting', async () => {
      await db.setSetting('fontSize', 'small');
      await db.setSetting('fontSize', 'large');
      
      expect(await db.getSetting('fontSize')).toBe('large');
    });

    it('should persist audioPlayMode as individual setting', async () => {
      await db.setSetting('audioPlayMode', 'page');
      expect(await db.getSetting('audioPlayMode')).toBe('page');

      await db.setSetting('audioPlayMode', 'verse');
      expect(await db.getSetting('audioPlayMode')).toBe('verse');
    });

    it('should persist audioPlayMode independently from bulk data', async () => {
      // Save audioPlayMode individually
      await db.setSetting('audioPlayMode', 'page');

      // Save bulk data with a different audioPlayMode
      await db.saveData({
        memorized: [1],
        settings: { ...sampleSettings, audioPlayMode: 'verse' },
        lastSaved: new Date().toISOString()
      });

      // Individual setting should remain unchanged
      expect(await db.getSetting('audioPlayMode')).toBe('page');

      // Bulk data should have the other value
      const loaded = await db.loadData();
      expect(loaded.settings.audioPlayMode).toBe('verse');
    });

    it('should handle audioPlayMode with invalid values gracefully', async () => {
      // getSetting returns default when key doesn't exist
      expect(await db.getSetting('audioPlayMode')).toBeNull();
      expect(await db.getSetting('audioPlayMode', 'verse')).toBe('verse');
    });
  });

  describe('saveUrlState() / loadUrlState()', () => {
    it('should save and load URL state', async () => {
      const state = { page: 100, tafsir: true, wordbyword: false };
      await db.saveUrlState(state);
      
      const loaded = await db.loadUrlState();
      expect(loaded.page).toBe(100);
      expect(loaded.tafsir).toBe(true);
      expect(loaded.wordbyword).toBe(false);
    });

    it('should return null when no URL state saved', async () => {
      const loaded = await db.loadUrlState();
      expect(loaded).toBeNull();
    });

    it('should not include id and savedAt in loaded state', async () => {
      await db.saveUrlState({ page: 50 });
      const loaded = await db.loadUrlState();
      
      expect(loaded.id).toBeUndefined();
      expect(loaded.savedAt).toBeUndefined();
      expect(loaded.page).toBe(50);
    });
  });

  describe('saveCachedResource() / loadCachedResource()', () => {
    it('should save and load cached resource', async () => {
      const resource = {
        id: 'english-wbw-translation',
        data: { '1:1:1': 'In the name' },
        cachedAt: Date.now()
      };
      
      await db.saveCachedResource(resource);
      const loaded = await db.loadCachedResource('english-wbw-translation');
      
      expect(loaded).toBeDefined();
      expect(loaded.data['1:1:1']).toBe('In the name');
    });

    it('should throw error when saving without id', async () => {
      await expect(db.saveCachedResource({ data: {} })).rejects.toThrow();
      await expect(db.saveCachedResource(null)).rejects.toThrow();
    });

    it('should return null for non-existent cache', async () => {
      const loaded = await db.loadCachedResource('non-existent');
      expect(loaded).toBeNull();
    });
  });

  describe('setLanguageSelectionFlag() / hasLanguageBeenSelected()', () => {
    it('should set and check language selection flag', async () => {
      expect(await db.hasLanguageBeenSelected()).toBe(false);
      
      await db.setLanguageSelectionFlag();
      
      expect(await db.hasLanguageBeenSelected()).toBe(true);
    });
  });
});
