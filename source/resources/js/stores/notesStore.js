/**
 * Notes Store for Murajah
 * Manages user notes with markdown support, linked to Quran pages/surahs/verses
 *
 * NOTE: The reactive store object is created in index.html (inline setup)
 * because this app uses Vue from CDN, not as an npm module.
 * This file exports pure utility functions for note CRUD, search, and export.
 */

import Logger from '../utils/logger.js';

/**
 * Generate a unique ID for a note
 * @returns {string}
 */
export function generateNoteId() {
  return `note-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a new blank note object
 * @param {Object} defaults - optional defaults (surahName, pageNumbers)
 * @returns {Object}
 */
export function createBlankNote(defaults = {}) {
  const now = new Date().toISOString();
  return {
    id: generateNoteId(),
    title: '',
    surahName: defaults.surahName || '',
    surahNumber: defaults.surahNumber || null,
    verses: '',
    pageNumbers: defaults.pageNumbers || '',
    reflection: '',
    tags: '',
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Validate a note before saving
 * @param {Object} note
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateNote(note) {
  const errors = [];

  if (!note.id) {
    errors.push('Note is missing an ID');
  }

  // Reflection can be empty but should exist
  if (note.reflection === undefined || note.reflection === null) {
    errors.push('Note reflection field is missing');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Prepare note for saving (set title default, generate slug, update timestamp)
 * @param {Object} note
 * @param {Array} existingNotes
 * @returns {Object} prepared note
 */
export function prepareNoteForSave(note, existingNotes = []) {
  const now = new Date();
  const prepared = { ...note };

  // Set default title if empty
  if (!prepared.title || prepared.title.trim() === '') {
    const dateStr = now.toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    prepared.title = `Untitled - ${dateStr}`;
  }

  // Update timestamp
  prepared.updatedAt = now.toISOString();

  return prepared;
}

/**
 * Extract all unique tags from notes array
 * @param {Array} notes
 * @returns {string[]}
 */
export function extractAllTags(notes) {
  const tagSet = new Set();
  for (const note of notes) {
    if (note.tags) {
      const tags = note.tags.split(',').map(t => t.trim()).filter(t => t);
      tags.forEach(t => tagSet.add(t));
    }
  }
  return Array.from(tagSet).sort();
}

/**
 * Search/filter notes
 * @param {Array} notes
 * @param {string} query
 * @returns {Array} filtered notes sorted by updatedAt desc
 */
export function filterNotes(notes, query) {
  if (!query || query.trim() === '') {
    return [...notes].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  const q = query.toLowerCase().trim();
  return notes
    .filter(note => {
      return (
        (note.title && note.title.toLowerCase().includes(q)) ||
        (note.reflection && note.reflection.toLowerCase().includes(q)) ||
        (note.tags && note.tags.toLowerCase().includes(q)) ||
        (note.surahName && note.surahName.toLowerCase().includes(q)) ||
        (note.verses && note.verses.toLowerCase().includes(q)) ||
        (note.pageNumbers && note.pageNumbers.toString().includes(q))
      );
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

/**
 * Paginate an array
 * @param {Array} items
 * @param {number} page - 1-based
 * @param {number} pageSize
 * @returns {{ items: Array, totalPages: number, totalItems: number }}
 */
export function paginateNotes(items, page = 1, pageSize = 10) {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * pageSize;
  const end = start + pageSize;

  return {
    items: items.slice(start, end),
    totalPages,
    totalItems,
    currentPage: safePage
  };
}

/**
 * Save a note to the store and persist to DB
 * @param {Object} note
 * @param {Object} murajahDB
 * @param {Object} notesStore - reactive notes store
 */
export async function saveNote(note, murajahDB, notesStore) {
  const existingIndex = notesStore.notes.findIndex(n => n.id === note.id);
  const prepared = prepareNoteForSave(note, notesStore.notes);

  const validation = validateNote(prepared);
  if (!validation.valid) {
    console.error('[Murajah] Note validation failed:', validation.errors);
    throw new Error(validation.errors.join(', '));
  }

  // Persist to DB first, then update in-memory store
  await murajahDB.saveNote(prepared);

  if (existingIndex >= 0) {
    notesStore.notes[existingIndex] = prepared;
  } else {
    notesStore.notes.push(prepared);
  }

  // Update tags
  notesStore.allTags = extractAllTags(notesStore.notes);
  notesStore.lastUpdated = new Date().toISOString();

  return prepared;
}

/**
 * Delete a note from the store and DB
 * @param {string} noteId
 * @param {Object} murajahDB
 * @param {Object} notesStore - reactive notes store
 */
export async function deleteNote(noteId, murajahDB, notesStore) {
  notesStore.notes = notesStore.notes.filter(n => n.id !== noteId);
  notesStore.allTags = extractAllTags(notesStore.notes);
  notesStore.lastUpdated = new Date().toISOString();

  await murajahDB.deleteNote(noteId);
}

/**
 * Load all notes from DB into store
 * @param {Object} murajahDB
 * @param {Object} notesStore - reactive notes store
 */
export async function loadNotes(murajahDB, notesStore) {
  try {
    const notes = await murajahDB.loadAllNotes();
    notesStore.notes = notes || [];
    notesStore.allTags = extractAllTags(notesStore.notes);
    Logger.log(`[Murajah] Loaded ${notesStore.notes.length} notes`);
  } catch (error) {
    console.error('[Murajah] Failed to load notes:', error);
  }
}

/**
 * Export a note as markdown text
 * @param {Object} note
 * @returns {string}
 */
export function exportNoteAsMarkdown(note) {
  let md = '';
  md += `# ${note.title || 'Untitled'}\n\n`;

  if (note.surahName) {
    md += `**Surah:** ${note.surahName}\n\n`;
  }
  if (note.verses) {
    md += `**Verses:** ${note.verses}\n\n`;
  }
  if (note.pageNumbers) {
    md += `**Page(s):** ${note.pageNumbers}\n\n`;
  }
  if (note.tags) {
    md += `**Tags:** ${note.tags}\n\n`;
  }

  md += `---\n\n`;
  md += note.reflection || '';
  md += `\n\n---\n\n`;
  md += `*Created: ${new Date(note.createdAt).toLocaleString()}*\n`;
  md += `*Updated: ${new Date(note.updatedAt).toLocaleString()}*\n`;

  return md;
}

/**
 * Export a note as plain text
 * @param {Object} note
 * @returns {string}
 */
export function exportNoteAsText(note) {
  let txt = '';
  txt += `${note.title || 'Untitled'}\n`;
  txt += `${'='.repeat(40)}\n\n`;

  if (note.surahName) {
    txt += `Surah: ${note.surahName}\n`;
  }
  if (note.verses) {
    txt += `Verses: ${note.verses}\n`;
  }
  if (note.pageNumbers) {
    txt += `Page(s): ${note.pageNumbers}\n`;
  }
  if (note.tags) {
    txt += `Tags: ${note.tags}\n`;
  }

  txt += `${'─'.repeat(40)}\n\n`;
  txt += note.reflection || '';
  txt += `\n\n${'─'.repeat(40)}\n`;
  txt += `Created: ${new Date(note.createdAt).toLocaleString()}\n`;
  txt += `Updated: ${new Date(note.updatedAt).toLocaleString()}\n`;

  return txt;
}

/**
 * Download a string as a file
 * @param {string} content
 * @param {string} filename
 * @param {string} mimeType
 */
export function downloadAsFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default {
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
  exportNoteAsText,
  downloadAsFile
};
