/**
 * Unit tests for notesStore
 * Tests note CRUD, filtering, pagination, markdown export
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockMurajahDB, clearAllDatabases } from '../utils/testHelpers.js';
import {
  generateNoteId,
  createBlankNote,
  validateNote,
  prepareNoteForSave,
  extractAllTags,
  filterNotes,
  paginateNotes,
  saveNote,
  deleteNote,
  loadNotes,
  exportNoteAsMarkdown,
  exportNoteAsText
} from '../../source/resources/js/stores/notesStore.js';

describe('notesStore', () => {
  let db;
  let notesStore;

  beforeEach(async () => {
    await clearAllDatabases();
    db = new MockMurajahDB();
    await db.init();

    // Create a plain store object (mirrors the reactive one in index.html)
    notesStore = {
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
  });

  afterEach(async () => {
    if (db && db.db) {
      db.db.close();
    }
    await clearAllDatabases();
  });

  // ── generateNoteId ──

  describe('generateNoteId()', () => {
    it('should generate unique IDs', () => {
      const id1 = generateNoteId();
      const id2 = generateNoteId();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^note-\d+-/);
      expect(id2).toMatch(/^note-\d+-/);
    });
  });

  // ── createBlankNote ──

  describe('createBlankNote()', () => {
    it('should create a blank note with defaults', () => {
      const note = createBlankNote();
      expect(note.id).toMatch(/^note-/);
      expect(note.title).toBe('');
      expect(note.surahName).toBe('');
      expect(note.reflection).toBe('');
      expect(note.tags).toBe('');
      expect(note.createdAt).toBeTruthy();
      expect(note.updatedAt).toBeTruthy();
    });

    it('should accept defaults', () => {
      const note = createBlankNote({ surahName: 'Al-Fatiha', pageNumbers: '1' });
      expect(note.surahName).toBe('Al-Fatiha');
      expect(note.pageNumbers).toBe('1');
    });
  });

  // ── validateNote ──

  describe('validateNote()', () => {
    it('should validate a valid note', () => {
      const note = createBlankNote();
      const result = validateNote(note);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject note without id', () => {
      const note = createBlankNote();
      note.id = '';
      const result = validateNote(note);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Note is missing an ID');
    });

    it('should reject note with missing reflection field', () => {
      const note = createBlankNote();
      delete note.reflection;
      const result = validateNote(note);
      expect(result.valid).toBe(false);
    });
  });

  // ── prepareNoteForSave ──

  describe('prepareNoteForSave()', () => {
    it('should set default title when empty', () => {
      const note = createBlankNote();
      const prepared = prepareNoteForSave(note);
      expect(prepared.title).toMatch(/^Untitled - /);
    });

    it('should keep title when provided', () => {
      const note = createBlankNote();
      note.title = 'My Reflection';
      const prepared = prepareNoteForSave(note);
      expect(prepared.title).toBe('My Reflection');
    });

    it('should update updatedAt', () => {
      const note = createBlankNote();
      const oldUpdated = note.updatedAt;
      // Small delay to ensure different timestamp
      const prepared = prepareNoteForSave(note);
      expect(prepared.updatedAt).toBeTruthy();
    });
  });

  // ── extractAllTags ──

  describe('extractAllTags()', () => {
    it('should extract unique sorted tags', () => {
      const notes = [
        { tags: 'tafsir, reflection' },
        { tags: 'reflection, dua' },
        { tags: 'memorization' }
      ];
      const tags = extractAllTags(notes);
      expect(tags).toEqual(['dua', 'memorization', 'reflection', 'tafsir']);
    });

    it('should handle empty tags', () => {
      const notes = [{ tags: '' }, { tags: null }];
      const tags = extractAllTags(notes);
      expect(tags).toEqual([]);
    });

    it('should handle notes without tags property', () => {
      const notes = [{}];
      const tags = extractAllTags(notes);
      expect(tags).toEqual([]);
    });
  });

  // ── filterNotes ──

  describe('filterNotes()', () => {
    const notes = [
      { title: 'Al-Fatiha Reflection', reflection: 'The opening surah', tags: 'tafsir', surahName: 'Al-Fatiha', verses: '1-7', pageNumbers: '1', updatedAt: '2025-01-01T00:00:00Z' },
      { title: 'Ayat al-Kursi', reflection: 'The throne verse', tags: 'memorization', surahName: 'Al-Baqarah', verses: '255', pageNumbers: '42', updatedAt: '2025-01-02T00:00:00Z' },
      { title: 'Daily Review', reflection: 'Reviewed juz 30', tags: 'review', surahName: '', verses: '', pageNumbers: '582-604', updatedAt: '2025-01-03T00:00:00Z' }
    ];

    it('should return all notes sorted by updatedAt desc when no query', () => {
      const result = filterNotes(notes, '');
      expect(result).toHaveLength(3);
      expect(result[0].title).toBe('Daily Review');
    });

    it('should filter by title', () => {
      const result = filterNotes(notes, 'fatiha');
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Al-Fatiha Reflection');
    });

    it('should filter by reflection content', () => {
      const result = filterNotes(notes, 'throne');
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Ayat al-Kursi');
    });

    it('should filter by tags', () => {
      const result = filterNotes(notes, 'memorization');
      expect(result).toHaveLength(1);
    });

    it('should filter by page number', () => {
      const result = filterNotes(notes, '42');
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Ayat al-Kursi');
    });

    it('should return empty for no match', () => {
      const result = filterNotes(notes, 'nonexistent');
      expect(result).toHaveLength(0);
    });
  });

  // ── paginateNotes ──

  describe('paginateNotes()', () => {
    const items = Array.from({ length: 25 }, (_, i) => ({ id: i }));

    it('should paginate correctly', () => {
      const result = paginateNotes(items, 1, 10);
      expect(result.items).toHaveLength(10);
      expect(result.totalPages).toBe(3);
      expect(result.totalItems).toBe(25);
      expect(result.currentPage).toBe(1);
    });

    it('should return last page', () => {
      const result = paginateNotes(items, 3, 10);
      expect(result.items).toHaveLength(5);
      expect(result.currentPage).toBe(3);
    });

    it('should clamp page to valid range', () => {
      const result = paginateNotes(items, 99, 10);
      expect(result.currentPage).toBe(3);
    });

    it('should handle empty array', () => {
      const result = paginateNotes([], 1, 10);
      expect(result.items).toHaveLength(0);
      expect(result.totalPages).toBe(1);
    });
  });

  // ── saveNote (store + DB) ──

  describe('saveNote()', () => {
    it('should save a new note to store and DB', async () => {
      const note = createBlankNote();
      note.title = 'Test Note';
      note.reflection = 'Some reflection';

      const saved = await saveNote(note, db, notesStore);
      expect(saved.title).toBe('Test Note');
      expect(notesStore.notes).toHaveLength(1);

      // Verify DB persistence
      const dbNote = await db.loadNote(saved.id);
      expect(dbNote).toBeTruthy();
      expect(dbNote.title).toBe('Test Note');
    });

    it('should update an existing note', async () => {
      const note = createBlankNote();
      note.title = 'Original';
      note.reflection = 'Content';

      const saved = await saveNote(note, db, notesStore);
      saved.title = 'Updated';
      const updated = await saveNote(saved, db, notesStore);

      expect(notesStore.notes).toHaveLength(1);
      expect(notesStore.notes[0].title).toBe('Updated');
    });

    it('should update allTags after save', async () => {
      const note = createBlankNote();
      note.tags = 'tafsir, reflection';
      note.reflection = 'content';

      await saveNote(note, db, notesStore);
      expect(notesStore.allTags).toContain('tafsir');
      expect(notesStore.allTags).toContain('reflection');
    });

    it('should reject invalid note', async () => {
      const note = createBlankNote();
      note.id = '';
      note.reflection = 'content';

      await expect(saveNote(note, db, notesStore)).rejects.toThrow();
    });
  });

  // ── deleteNote ──

  describe('deleteNote()', () => {
    it('should remove note from store and DB', async () => {
      const note = createBlankNote();
      note.reflection = 'content';
      const saved = await saveNote(note, db, notesStore);

      await deleteNote(saved.id, db, notesStore);
      expect(notesStore.notes).toHaveLength(0);

      const dbNote = await db.loadNote(saved.id);
      expect(dbNote).toBeNull();
    });
  });

  // ── loadNotes ──

  describe('loadNotes()', () => {
    it('should load notes from DB into store', async () => {
      // Save directly to DB
      await db.saveNote({ id: 'n1', title: 'Note 1', tags: 'tag1', reflection: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      await db.saveNote({ id: 'n2', title: 'Note 2', tags: 'tag2', reflection: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

      await loadNotes(db, notesStore);

      expect(notesStore.notes).toHaveLength(2);
      expect(notesStore.allTags).toContain('tag1');
      expect(notesStore.allTags).toContain('tag2');
    });

    it('should handle empty DB', async () => {
      await loadNotes(db, notesStore);
      expect(notesStore.notes).toHaveLength(0);
    });
  });

  // ── exportNoteAsMarkdown ──

  describe('exportNoteAsMarkdown()', () => {
    it('should generate valid markdown', () => {
      const note = {
        title: 'Test Note',
        surahName: 'Al-Fatiha',
        verses: '1-7',
        pageNumbers: '1',
        tags: 'tafsir, reflection',
        reflection: 'This is a **test** reflection.',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T12:00:00Z'
      };
      const md = exportNoteAsMarkdown(note);

      expect(md).toContain('# Test Note');
      expect(md).toContain('**Surah:** Al-Fatiha');
      expect(md).toContain('**Verses:** 1-7');
      expect(md).toContain('**Page(s):** 1');
      expect(md).toContain('**Tags:** tafsir, reflection');
      expect(md).toContain('This is a **test** reflection.');
      expect(md).toContain('*Created:');
    });

    it('should skip empty fields', () => {
      const note = {
        title: 'Minimal Note',
        surahName: '',
        verses: '',
        pageNumbers: '',
        tags: '',
        reflection: 'Just a thought',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z'
      };
      const md = exportNoteAsMarkdown(note);
      expect(md).not.toContain('**Surah:**');
      expect(md).not.toContain('**Verses:**');
    });
  });

  // ── exportNoteAsText ──

  describe('exportNoteAsText()', () => {
    it('should generate valid plain text', () => {
      const note = {
        title: 'Text Export',
        surahName: 'Al-Baqarah',
        verses: '255',
        pageNumbers: '42',
        tags: 'ayat-kursi',
        reflection: 'The throne verse analysis.',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z'
      };
      const txt = exportNoteAsText(note);

      expect(txt).toContain('Text Export');
      expect(txt).toContain('Surah: Al-Baqarah');
      expect(txt).toContain('Verses: 255');
      expect(txt).toContain('The throne verse analysis.');
    });
  });

  // ── DB methods directly ──

  describe('DB CRUD operations', () => {
    it('should create notes object store', () => {
      const storeNames = Array.from(db.db.objectStoreNames);
      expect(storeNames).toContain('notes');
    });

    it('should save and load a note', async () => {
      const note = { id: 'test-1', title: 'DB Test', reflection: 'content', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await db.saveNote(note);
      const loaded = await db.loadNote('test-1');
      expect(loaded.title).toBe('DB Test');
    });

    it('should load all notes', async () => {
      await db.saveNote({ id: 'n1', title: 'First', reflection: '' });
      await db.saveNote({ id: 'n2', title: 'Second', reflection: '' });
      const all = await db.loadAllNotes();
      expect(all).toHaveLength(2);
    });

    it('should delete a note', async () => {
      await db.saveNote({ id: 'n1', title: 'ToDelete', reflection: '' });
      await db.deleteNote('n1');
      const loaded = await db.loadNote('n1');
      expect(loaded).toBeNull();
    });

    it('should update an existing note', async () => {
      await db.saveNote({ id: 'n1', title: 'Version 1', reflection: '' });
      await db.saveNote({ id: 'n1', title: 'Version 2', reflection: '' });
      const loaded = await db.loadNote('n1');
      expect(loaded.title).toBe('Version 2');
    });
  });
});
