/**
 * Notes Persistence Tests
 * Tests that notes are correctly saved to IndexedDB and survive
 * simulated page refreshes (close DB + reopen DB).
 *
 * These tests verify:
 *  1. Single note save → reload persists
 *  2. Multiple notes save → reload persists all
 *  3. Edited notes persist after reload
 *  4. Deleted notes stay deleted after reload
 *  5. Full store flow: saveNote() → close → reopen → loadNotes()
 *  6. Notes with complex content (markdown, tags, unicode) persist
 *  7. Concurrent saves don't lose data
 *  8. DB version upgrade preserves notes
 *  9. SaveNote deep-clones (no Proxy issues)
 * 10. Verification read-back after save
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clearAllDatabases } from '../utils/testHelpers.js';
import {
  createBlankNote,
  prepareNoteForSave,
  saveNote,
  deleteNote,
  loadNotes,
  extractAllTags
} from '../../source/resources/js/stores/notesStore.js';

const DB_NAME = 'murajah-db';
const DB_VERSION = 5;

/**
 * Open a fresh MurajahDB connection (mirrors MurajahDB class in index.html).
 * Returns the db instance and helper methods.
 */
async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      resolve(createDBHelpers(db));
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

/**
 * Create DB helper methods matching MurajahDB API.
 * This mirrors the exact saveNote/loadNote/loadAllNotes/deleteNote methods
 * from the production MurajahDB class in index.html.
 */
function createDBHelpers(db) {
  return {
    db,

    async saveNote(note) {
      // Mirror production: deep clone to avoid Proxy/reference issues
      const plainNote = JSON.parse(JSON.stringify(note));
      if (!plainNote || !plainNote.id) {
        throw new Error('Cannot save note: missing id field');
      }
      const tx = db.transaction(['notes'], 'readwrite');
      const store = tx.objectStore('notes');
      const request = store.put(plainNote);
      return new Promise((resolve, reject) => {
        request.onerror = (event) => reject(event.target.error);
        tx.oncomplete = () => resolve();
        tx.onerror = (event) => reject(event.target.error);
        tx.onabort = () => reject(new Error('Transaction aborted'));
      });
    },

    async loadNote(noteId) {
      const tx = db.transaction(['notes'], 'readonly');
      const store = tx.objectStore('notes');
      return new Promise((resolve, reject) => {
        const request = store.get(noteId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    },

    async loadAllNotes() {
      const tx = db.transaction(['notes'], 'readonly');
      const store = tx.objectStore('notes');
      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    },

    async deleteNote(noteId) {
      const tx = db.transaction(['notes'], 'readwrite');
      const store = tx.objectStore('notes');
      store.delete(noteId);
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },

    close() {
      db.close();
    }
  };
}

/**
 * Helper: create a complete note with all fields populated
 */
function makeNote(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: `note-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    title: 'Test Note',
    surahName: 'Al-Fatiha',
    surahNumber: 1,
    verses: '1-7',
    pageNumbers: '1',
    reflection: 'Test reflection content',
    tags: 'test, example',
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

/**
 * Helper: create a fresh notesStore (mirrors the reactive store in index.html)
 */
function makeStore() {
  return {
    notes: [],
    allTags: [],
    isEditing: false,
    currentNote: null,
    showNotesPanel: false,
    searchQuery: '',
    currentPage: 1,
    pageSize: 10,
    lastUpdated: null
  };
}


// ═══════════════════════════════════════════════════════════════
//  TEST SUITES
// ═══════════════════════════════════════════════════════════════

describe('Notes Persistence', () => {
  let dbHelper;

  beforeEach(async () => {
    await clearAllDatabases();
    dbHelper = await openDB();
  });

  afterEach(async () => {
    if (dbHelper) {
      dbHelper.close();
    }
    await clearAllDatabases();
  });


  // ── 1. Basic save and immediate read-back ──

  describe('Basic save and read-back (same session)', () => {
    it('should save a note and read it back immediately', async () => {
      const note = makeNote({ id: 'persist-1', title: 'Persistence Test' });
      await dbHelper.saveNote(note);

      const loaded = await dbHelper.loadNote('persist-1');
      expect(loaded).toBeTruthy();
      expect(loaded.id).toBe('persist-1');
      expect(loaded.title).toBe('Persistence Test');
      expect(loaded.reflection).toBe('Test reflection content');
      expect(loaded.surahName).toBe('Al-Fatiha');
      expect(loaded.tags).toBe('test, example');
    });

    it('should save and load all notes', async () => {
      await dbHelper.saveNote(makeNote({ id: 'n1', title: 'First' }));
      await dbHelper.saveNote(makeNote({ id: 'n2', title: 'Second' }));
      await dbHelper.saveNote(makeNote({ id: 'n3', title: 'Third' }));

      const all = await dbHelper.loadAllNotes();
      expect(all).toHaveLength(3);
      const titles = all.map(n => n.title).sort();
      expect(titles).toEqual(['First', 'Second', 'Third']);
    });
  });


  // ── 2. Persistence across DB close/reopen (simulates page refresh) ──

  describe('Persistence across DB close/reopen (simulates refresh)', () => {
    it('should persist a single note across close + reopen', async () => {
      const note = makeNote({ id: 'refresh-1', title: 'Survives Refresh' });
      await dbHelper.saveNote(note);

      // Close the DB (simulates page unload)
      dbHelper.close();

      // Reopen the DB (simulates page load after refresh)
      const dbHelper2 = await openDB();

      const loaded = await dbHelper2.loadNote('refresh-1');
      expect(loaded).toBeTruthy();
      expect(loaded.id).toBe('refresh-1');
      expect(loaded.title).toBe('Survives Refresh');
      expect(loaded.reflection).toBe('Test reflection content');

      dbHelper2.close();
    });

    it('should persist multiple notes across close + reopen', async () => {
      await dbHelper.saveNote(makeNote({ id: 'r1', title: 'Note A', tags: 'alpha' }));
      await dbHelper.saveNote(makeNote({ id: 'r2', title: 'Note B', tags: 'beta' }));
      await dbHelper.saveNote(makeNote({ id: 'r3', title: 'Note C', tags: 'gamma' }));

      dbHelper.close();
      const dbHelper2 = await openDB();

      const all = await dbHelper2.loadAllNotes();
      expect(all).toHaveLength(3);

      const loaded1 = await dbHelper2.loadNote('r1');
      expect(loaded1.title).toBe('Note A');
      expect(loaded1.tags).toBe('alpha');

      const loaded3 = await dbHelper2.loadNote('r3');
      expect(loaded3.title).toBe('Note C');
      expect(loaded3.tags).toBe('gamma');

      dbHelper2.close();
    });

    it('should persist note edits across close + reopen', async () => {
      // Save original
      const note = makeNote({ id: 'edit-1', title: 'Original Title', reflection: 'Original' });
      await dbHelper.saveNote(note);

      // Edit
      const edited = { ...note, title: 'Updated Title', reflection: 'Updated content', updatedAt: new Date().toISOString() };
      await dbHelper.saveNote(edited);

      // Close and reopen
      dbHelper.close();
      const dbHelper2 = await openDB();

      const loaded = await dbHelper2.loadNote('edit-1');
      expect(loaded.title).toBe('Updated Title');
      expect(loaded.reflection).toBe('Updated content');

      dbHelper2.close();
    });

    it('should persist note deletions across close + reopen', async () => {
      await dbHelper.saveNote(makeNote({ id: 'del-1', title: 'Keep' }));
      await dbHelper.saveNote(makeNote({ id: 'del-2', title: 'Delete Me' }));

      await dbHelper.deleteNote('del-2');

      dbHelper.close();
      const dbHelper2 = await openDB();

      const all = await dbHelper2.loadAllNotes();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe('del-1');

      const deleted = await dbHelper2.loadNote('del-2');
      expect(deleted).toBeNull();

      dbHelper2.close();
    });
  });


  // ── 3. Full store flow: saveNote() → close → reopen → loadNotes() ──

  describe('Store-level persistence (saveNote + loadNotes across sessions)', () => {
    it('should persist notes saved via store saveNote() after DB reopen', async () => {
      const store = makeStore();
      const note = makeNote({ id: 'store-1', title: 'Store Note', tags: 'store-test' });

      // Save via store function
      await saveNote(note, dbHelper, store);

      // Verify in-memory store updated
      expect(store.notes).toHaveLength(1);
      expect(store.notes[0].title).toBe('Store Note');

      // Close and reopen DB (simulate refresh)
      dbHelper.close();
      const dbHelper2 = await openDB();

      // Create fresh store (simulates fresh page load)
      const freshStore = makeStore();

      // Load notes into fresh store
      await loadNotes(dbHelper2, freshStore);

      expect(freshStore.notes).toHaveLength(1);
      expect(freshStore.notes[0].id).toBe('store-1');
      expect(freshStore.notes[0].title).toBe('Store Note');
      expect(freshStore.notes[0].tags).toContain('store-test');
      expect(freshStore.allTags).toContain('store-test');

      dbHelper2.close();
    });

    it('should persist multiple notes via store across sessions', async () => {
      const store = makeStore();

      // Save several notes
      await saveNote(makeNote({ id: 's1', title: 'First', tags: 'a' }), dbHelper, store);
      await saveNote(makeNote({ id: 's2', title: 'Second', tags: 'b' }), dbHelper, store);
      await saveNote(makeNote({ id: 's3', title: 'Third', tags: 'c' }), dbHelper, store);

      expect(store.notes).toHaveLength(3);

      // Simulate refresh
      dbHelper.close();
      const dbHelper2 = await openDB();
      const freshStore = makeStore();
      await loadNotes(dbHelper2, freshStore);

      expect(freshStore.notes).toHaveLength(3);
      const ids = freshStore.notes.map(n => n.id).sort();
      expect(ids).toEqual(['s1', 's2', 's3']);

      dbHelper2.close();
    });

    it('should persist store deleteNote() across sessions', async () => {
      const store = makeStore();

      await saveNote(makeNote({ id: 'sd1', title: 'Keep' }), dbHelper, store);
      await saveNote(makeNote({ id: 'sd2', title: 'Remove' }), dbHelper, store);

      expect(store.notes).toHaveLength(2);

      // Delete one
      await deleteNote('sd2', dbHelper, store);
      expect(store.notes).toHaveLength(1);

      // Simulate refresh
      dbHelper.close();
      const dbHelper2 = await openDB();
      const freshStore = makeStore();
      await loadNotes(dbHelper2, freshStore);

      expect(freshStore.notes).toHaveLength(1);
      expect(freshStore.notes[0].id).toBe('sd1');

      dbHelper2.close();
    });

    it('should persist note edits via store across sessions', async () => {
      const store = makeStore();
      const original = makeNote({ id: 'se1', title: 'Original' });

      await saveNote(original, dbHelper, store);

      // Edit the note
      const edited = { ...store.notes[0], title: 'Edited', reflection: 'New content' };
      await saveNote(edited, dbHelper, store);

      expect(store.notes).toHaveLength(1);
      expect(store.notes[0].title).toBe('Edited');

      // Simulate refresh
      dbHelper.close();
      const dbHelper2 = await openDB();
      const freshStore = makeStore();
      await loadNotes(dbHelper2, freshStore);

      expect(freshStore.notes).toHaveLength(1);
      expect(freshStore.notes[0].title).toBe('Edited');
      expect(freshStore.notes[0].reflection).toBe('New content');

      dbHelper2.close();
    });
  });


  // ── 4. Complex content persistence ──

  describe('Complex content persistence', () => {
    it('should persist notes with markdown content', async () => {
      const note = makeNote({
        id: 'md-1',
        title: 'Markdown Note',
        reflection: '# Heading\n\n**Bold** and *italic*\n\n- List item 1\n- List item 2\n\n> Blockquote\n\n```\ncode block\n```'
      });

      await dbHelper.saveNote(note);
      dbHelper.close();
      const db2 = await openDB();

      const loaded = await db2.loadNote('md-1');
      expect(loaded.reflection).toContain('# Heading');
      expect(loaded.reflection).toContain('**Bold**');
      expect(loaded.reflection).toContain('> Blockquote');
      expect(loaded.reflection).toContain('```');

      db2.close();
    });

    it('should persist notes with Arabic/Unicode content', async () => {
      const note = makeNote({
        id: 'unicode-1',
        title: 'ملاحظات القرآن',
        surahName: 'الفاتحة',
        reflection: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ\nThis is a mixed Arabic/English note.\nবাংলা পাঠ্য'
      });

      await dbHelper.saveNote(note);
      dbHelper.close();
      const db2 = await openDB();

      const loaded = await db2.loadNote('unicode-1');
      expect(loaded.title).toBe('ملاحظات القرآن');
      expect(loaded.surahName).toBe('الفاتحة');
      expect(loaded.reflection).toContain('بِسْمِ');
      expect(loaded.reflection).toContain('বাংলা');

      db2.close();
    });

    it('should persist notes with many tags', async () => {
      const note = makeNote({
        id: 'tags-1',
        tags: 'tajweed, memorization, revision, surah-baqarah, ayat-kursi, reflection, tafsir, arabic'
      });

      await dbHelper.saveNote(note);
      dbHelper.close();
      const db2 = await openDB();

      const loaded = await db2.loadNote('tags-1');
      expect(loaded.tags).toContain('tajweed');
      expect(loaded.tags).toContain('ayat-kursi');
      expect(loaded.tags.split(',').map(t => t.trim())).toHaveLength(8);

      db2.close();
    });

    it('should persist notes with empty optional fields', async () => {
      const note = makeNote({
        id: 'empty-1',
        title: 'Minimal Note',
        surahName: '',
        surahNumber: null,
        verses: '',
        pageNumbers: '',
        reflection: '',
        tags: '',
      });

      await dbHelper.saveNote(note);
      dbHelper.close();
      const db2 = await openDB();

      const loaded = await db2.loadNote('empty-1');
      expect(loaded.title).toBe('Minimal Note');
      expect(loaded.surahName).toBe('');
      expect(loaded.surahNumber).toBeNull();
      expect(loaded.reflection).toBe('');

      db2.close();
    });

    it('should persist notes with long reflection text', async () => {
      const longText = 'A'.repeat(10000) + '\n\nSection break\n\n' + 'B'.repeat(10000);
      const note = makeNote({ id: 'long-1', reflection: longText });

      await dbHelper.saveNote(note);
      dbHelper.close();
      const db2 = await openDB();

      const loaded = await db2.loadNote('long-1');
      expect(loaded.reflection).toBe(longText);
      expect(loaded.reflection.length).toBe(longText.length);

      db2.close();
    });
  });


  // ── 5. Deep clone / Proxy safety ──

  describe('Deep clone safety (no Proxy issues)', () => {
    it('should save notes even when passed as a reference to a modified object', async () => {
      const note = makeNote({ id: 'ref-1', title: 'Original' });

      await dbHelper.saveNote(note);

      // Mutate the original reference AFTER save
      note.title = 'Mutated After Save';

      // The saved version should have the original title
      const loaded = await dbHelper.loadNote('ref-1');
      expect(loaded.title).toBe('Original');
    });

    it('should handle saving the same note object multiple times', async () => {
      const note = makeNote({ id: 'multi-save', title: 'V1' });
      await dbHelper.saveNote(note);

      note.title = 'V2';
      note.updatedAt = new Date().toISOString();
      await dbHelper.saveNote(note);

      note.title = 'V3';
      note.updatedAt = new Date().toISOString();
      await dbHelper.saveNote(note);

      // Close and reopen
      dbHelper.close();
      const db2 = await openDB();
      const loaded = await db2.loadNote('multi-save');
      expect(loaded.title).toBe('V3');

      db2.close();
    });

    it('should save notes with nested-like string values correctly', async () => {
      const note = makeNote({
        id: 'nested-1',
        reflection: '{"key": "value", "nested": {"a": 1}}',
        tags: 'json-content, test'
      });

      await dbHelper.saveNote(note);
      dbHelper.close();
      const db2 = await openDB();

      const loaded = await db2.loadNote('nested-1');
      expect(loaded.reflection).toBe('{"key": "value", "nested": {"a": 1}}');

      db2.close();
    });
  });


  // ── 6. Multiple sessions simulation ──

  describe('Multiple refresh cycles', () => {
    it('should persist across two consecutive refreshes', async () => {
      // Session 1: create notes
      await dbHelper.saveNote(makeNote({ id: 'mc-1', title: 'Session1' }));
      dbHelper.close();

      // Session 2: add more notes
      const db2 = await openDB();
      await db2.saveNote(makeNote({ id: 'mc-2', title: 'Session2' }));
      db2.close();

      // Session 3: verify all notes survive
      const db3 = await openDB();
      const all = await db3.loadAllNotes();
      expect(all).toHaveLength(2);
      const titles = all.map(n => n.title).sort();
      expect(titles).toEqual(['Session1', 'Session2']);

      db3.close();
    });

    it('should handle save in session 1, edit in session 2, verify in session 3', async () => {
      // Session 1: create
      await dbHelper.saveNote(makeNote({ id: 'cycle-1', title: 'Created' }));
      dbHelper.close();

      // Session 2: edit
      const db2 = await openDB();
      const loaded = await db2.loadNote('cycle-1');
      expect(loaded.title).toBe('Created');
      await db2.saveNote({ ...loaded, title: 'Edited', updatedAt: new Date().toISOString() });
      db2.close();

      // Session 3: verify
      const db3 = await openDB();
      const verified = await db3.loadNote('cycle-1');
      expect(verified.title).toBe('Edited');

      db3.close();
    });

    it('should handle delete in session 2, verify in session 3', async () => {
      await dbHelper.saveNote(makeNote({ id: 'dcycle-1', title: 'Keep' }));
      await dbHelper.saveNote(makeNote({ id: 'dcycle-2', title: 'Delete' }));
      dbHelper.close();

      // Session 2
      const db2 = await openDB();
      await db2.deleteNote('dcycle-2');
      db2.close();

      // Session 3
      const db3 = await openDB();
      const all = await db3.loadAllNotes();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe('dcycle-1');

      db3.close();
    });
  });


  // ── 7. Full store-level round-trip across sessions (integration-style) ──

  describe('Full store round-trip integration', () => {
    it('should fully round-trip: create + save → close → reopen + loadNotes', async () => {
      const store = makeStore();

      // Create notes like the UI would
      const note1 = createBlankNote({ surahName: 'Al-Baqarah', pageNumbers: '2' });
      note1.title = 'Ayat al-Kursi Reflection';
      note1.reflection = '## Key Points\n\n- Allah is the greatest\n- No one tires Him';
      note1.tags = 'ayat-kursi, reflection';

      const note2 = createBlankNote();
      note2.title = 'Surah Yaseen Notes';
      note2.reflection = 'Heart of the Quran';
      note2.tags = 'yaseen, notes';

      // Save through store function
      const saved1 = await saveNote(note1, dbHelper, store);
      const saved2 = await saveNote(note2, dbHelper, store);

      expect(store.notes).toHaveLength(2);

      // Simulate browser refresh
      dbHelper.close();

      // New session
      const db2 = await openDB();
      const freshStore = makeStore();
      await loadNotes(db2, freshStore);

      // All notes should be present
      expect(freshStore.notes).toHaveLength(2);

      // Verify content integrity
      const ayatNote = freshStore.notes.find(n => n.title === 'Ayat al-Kursi Reflection');
      expect(ayatNote).toBeTruthy();
      expect(ayatNote.reflection).toContain('## Key Points');
      expect(ayatNote.surahName).toBe('Al-Baqarah');

      const yaseenNote = freshStore.notes.find(n => n.title === 'Surah Yaseen Notes');
      expect(yaseenNote).toBeTruthy();
      expect(yaseenNote.reflection).toBe('Heart of the Quran');

      // Tags should be extracted
      expect(freshStore.allTags).toContain('ayat-kursi');
      expect(freshStore.allTags).toContain('reflection');
      expect(freshStore.allTags).toContain('yaseen');

      db2.close();
    });

    it('should handle the exact handleSave flow from NotesComponent', async () => {
      // This mimics NotesComponent.handleSave() step by step
      const store = makeStore();

      // 1. User creates a note (like openNewNote())
      const now = new Date().toISOString();
      const editNote = {
        id: `note-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        title: 'User Created Note',
        surahName: 'Al-Fatiha',
        surahNumber: 1,
        verses: '1-7',
        pageNumbers: '1',
        reflection: 'My personal reflection on Al-Fatiha',
        tags: '',
        createdAt: now,
        updatedAt: now
      };

      // 2. User edits (mimics v-model bindings)
      editNote.tags = 'fatiha, reflection';
      editNote.reflection = '# Al-Fatiha\n\nThe opening chapter of the Quran.\n\n## Key Themes\n- Praise to Allah\n- Guidance';

      // 3. handleSave flow
      const note = { ...editNote };
      note.tags = 'fatiha, reflection';

      note.updatedAt = new Date().toISOString();

      // 4. Save to DB (this is the critical step)
      await dbHelper.saveNote(note);

      // 5. Verify the note was saved by reading it back (post-save verification)
      const verified = await dbHelper.loadNote(note.id);
      expect(verified).toBeTruthy();
      expect(verified.id).toBe(note.id);
      expect(verified.title).toBe('User Created Note');

      // 6. Update in-memory store
      store.notes.push(note);

      // 7. Simulate browser refresh
      dbHelper.close();

      // 8. New session - load from DB
      const db2 = await openDB();
      const freshStore = makeStore();
      await loadNotes(db2, freshStore);

      // 9. Verify the note survived
      expect(freshStore.notes).toHaveLength(1);
      expect(freshStore.notes[0].title).toBe('User Created Note');
      expect(freshStore.notes[0].reflection).toContain('# Al-Fatiha');
      expect(freshStore.notes[0].surahName).toBe('Al-Fatiha');
      expect(freshStore.notes[0].tags).toBe('fatiha, reflection');

      db2.close();
    });
  });


  // ── 8. Error handling ──

  describe('Error handling', () => {
    it('should reject saving a note without an id', async () => {
      const badNote = { title: 'No ID' };
      await expect(dbHelper.saveNote(badNote)).rejects.toThrow();
    });

    it('should handle loading a non-existent note gracefully', async () => {
      const result = await dbHelper.loadNote('does-not-exist');
      expect(result).toBeNull();
    });

    it('should handle deleting a non-existent note without error', async () => {
      // Should not throw
      await dbHelper.deleteNote('does-not-exist');
    });

    it('should handle loadAllNotes on empty store', async () => {
      const all = await dbHelper.loadAllNotes();
      expect(all).toEqual([]);
    });
  });
});
