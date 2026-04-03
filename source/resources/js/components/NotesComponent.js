import Logger from '../utils/logger.js';

/**
 * NotesComponent - Full notes management UI for Murajah
 * Provides note creation, editing, viewing, searching, and downloading.
 *
 * Props:
 *   - notesStore: reactive notes store
 *   - currentPage: current Quran page number
 *   - surahNames: object mapping surah number to Arabic name
 *   - localeSurahs: object mapping surah number to translated name
 *   - currentLocale: current locale string
 *   - currentSurahNumber: current surah number on the page
 *   - currentSurahName: current surah name on the page
 *   - db: MurajahDB instance
 *
 * Emits:
 *   - note-saved
 *   - note-deleted
 */

export default {
  name: 'NotesComponent',
  props: {
    notesStore: { type: Object, required: true },
    currentPage: { type: Number, default: 1 },
    surahNames: { type: Object, default: () => ({}) },
    localeSurahs: { type: Object, default: () => ({}) },
    currentLocale: { type: String, default: 'en' },
    currentSurahNumber: { type: Number, default: null },
    currentSurahName: { type: String, default: '' },
    db: { type: Object, required: true }
  },
  emits: ['note-saved', 'note-deleted'],
  data() {
    return {
      // View modes: 'list', 'view', 'edit'
      viewMode: 'list',
      editNote: null,
      viewingNote: null,
      searchQuery: '',
      debouncedSearchQuery: '',
      _searchDebounceTimer: null,
      currentListPage: 1,
      pageSize: 10,
      showSurahDropdown: false,
      surahSearchText: '',
      tagInput: '',
      showTagSuggestions: false,
      deleteConfirmId: null,
      showExportMenu: null
    };
  },
  watch: {
    searchQuery(val) {
      clearTimeout(this._searchDebounceTimer);
      this._searchDebounceTimer = setTimeout(() => {
        this.debouncedSearchQuery = val;
      }, 200);
      this.currentListPage = 1;
    }
  },
  computed: {
    filteredNotes() {
      const notes = this.notesStore.notes || [];
      if (!this.debouncedSearchQuery || this.debouncedSearchQuery.trim() === '') {
        return [...notes].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      }
      const q = this.debouncedSearchQuery.toLowerCase().trim();
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
    },
    totalPages() {
      return Math.max(1, Math.ceil(this.filteredNotes.length / this.pageSize));
    },
    paginatedNotes() {
      const start = (this.currentListPage - 1) * this.pageSize;
      return this.filteredNotes.slice(start, start + this.pageSize);
    },
    allSurahs() {
      const surahs = [];
      for (let i = 1; i <= 114; i++) {
        const arabicName = this.surahNames[i] || `Surah ${i}`;
        const translatedName = this.localeSurahs[i] || arabicName;
        surahs.push({ number: i, arabic: arabicName, translated: translatedName });
      }
      return surahs;
    },
    filteredSurahs() {
      if (!this.surahSearchText) return this.allSurahs;
      const q = this.surahSearchText.toLowerCase();
      return this.allSurahs.filter(s =>
        s.arabic.toLowerCase().includes(q) ||
        s.translated.toLowerCase().includes(q) ||
        s.number.toString().includes(q)
      );
    },
    tagSuggestions() {
      if (!this.tagInput) return [];
      const allTags = this.notesStore.allTags || [];
      // Get the last tag being typed
      const parts = this.tagInput.split(',');
      const current = (parts[parts.length - 1] || '').trim().toLowerCase();
      if (!current) return [];
      return allTags
        .filter(t => t.toLowerCase().includes(current))
        .slice(0, 8);
    },
    isRtl() {
      return this.currentLocale === 'ar';
    }
  },
  beforeUnmount() {
    clearTimeout(this._searchDebounceTimer);
  },
  methods: {
    // ── Navigation ──
    openNewNote() {
      const now = new Date().toISOString();
      this.editNote = {
        id: `note-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        title: '',
        surahName: this.currentSurahName || '',
        surahNumber: this.currentSurahNumber || null,
        verses: '',
        pageNumbers: this.currentPage ? String(this.currentPage) : '',
        reflection: '',
        tags: '',
        createdAt: now,
        updatedAt: now
      };
      this.tagInput = '';
      this.viewMode = 'edit';
    },

    openEditNote(note) {
      this.editNote = { ...note };
      this.tagInput = note.tags || '';
      this.viewMode = 'edit';
    },

    openViewNote(note) {
      this.viewingNote = { ...note };
      this.viewMode = 'view';
      this.showExportMenu = null;
    },

    backToList() {
      this.viewMode = 'list';
      this.editNote = null;
      this.viewingNote = null;
      this.deleteConfirmId = null;
      this.showExportMenu = null;
    },

    // ── Surah dropdown ──
    selectSurah(surah) {
      this.editNote.surahName = surah.translated;
      this.editNote.surahNumber = surah.number;
      this.showSurahDropdown = false;
      this.surahSearchText = '';
    },

    clearSurah() {
      this.editNote.surahName = '';
      this.editNote.surahNumber = null;
    },

    // ── Tag autocomplete ──
    onTagInput() {
      this.editNote.tags = this.tagInput;
      this.showTagSuggestions = this.tagSuggestions.length > 0;
    },

    delayHideTagSuggestions() {
      window.setTimeout(() => { this.showTagSuggestions = false; }, 200);
    },

    selectTag(tag) {
      const parts = this.tagInput.split(',');
      parts[parts.length - 1] = ` ${tag}`;
      this.tagInput = parts.join(',') + ', ';
      this.editNote.tags = this.tagInput;
      this.showTagSuggestions = false;
    },

    // ── Save ──
    async handleSave() {
      if (!this.editNote) return;

      const note = { ...this.editNote };
      note.tags = this.tagInput;

      // Set default title if empty
      if (!note.title || note.title.trim() === '') {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', {
          year: 'numeric', month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit'
        });
        note.title = `Untitled - ${dateStr}`;
      }

      note.updatedAt = new Date().toISOString();

      // Persist to IndexedDB FIRST, then update in-memory store only on success
      try {
        await this.db.saveNote(note);

        // Verify the note was actually written by reading it back
        const verified = await this.db.loadNote(note.id);
        if (!verified) {
          console.error('[Murajah] Note save verification failed — note not found in DB after save:', note.id);
          throw new Error('Note save verification failed');
        }

        // Only update in-memory store after confirmed DB write
        const existingIndex = this.notesStore.notes.findIndex(n => n.id === note.id);
        if (existingIndex >= 0) {
          this.notesStore.notes[existingIndex] = note;
        } else {
          this.notesStore.notes.push(note);
        }

        // Update allTags
        this.updateAllTags();

        this.$emit('note-saved', note);
        Logger.log('[Murajah] Note saved and verified:', note.id, note.title);
      } catch (error) {
        console.error('[Murajah] Failed to save note:', error);
      }

      this.backToList();
    },

    // ── Delete ──
    confirmDelete(noteId) {
      this.deleteConfirmId = noteId;
    },

    cancelDelete() {
      this.deleteConfirmId = null;
    },

    async handleDelete(noteId) {
      this.notesStore.notes = this.notesStore.notes.filter(n => n.id !== noteId);
      this.updateAllTags();

      try {
        await this.db.deleteNote(noteId);
        this.$emit('note-deleted', noteId);
      } catch (error) {
        console.error('[Murajah] Failed to delete note:', error);
      }

      this.deleteConfirmId = null;
      if (this.viewMode === 'view') {
        this.backToList();
      }
    },

    // ── Export / Download ──
    toggleExportMenu(noteId) {
      this.showExportMenu = this.showExportMenu === noteId ? null : noteId;
    },

    downloadNote(note, format) {
      const filename = (note.title || 'note').replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').substring(0, 40) + (format === 'md' ? '.md' : '.txt');
      let content;

      if (format === 'md') {
        content = this.exportAsMarkdown(note);
      } else {
        content = this.exportAsText(note);
      }

      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.showExportMenu = null;
    },

    exportAsMarkdown(note) {
      let md = `# ${note.title || 'Untitled'}\n\n`;
      if (note.surahName) md += `**Surah:** ${note.surahName}\n\n`;
      if (note.verses) md += `**Verses:** ${note.verses}\n\n`;
      if (note.pageNumbers) md += `**Page(s):** ${note.pageNumbers}\n\n`;
      if (note.tags) md += `**Tags:** ${note.tags}\n\n`;
      md += `---\n\n`;
      md += note.reflection || '';
      md += `\n\n---\n\n`;
      md += `*Created: ${new Date(note.createdAt).toLocaleString()}*\n`;
      md += `*Updated: ${new Date(note.updatedAt).toLocaleString()}*\n`;
      return md;
    },

    exportAsText(note) {
      let txt = `${note.title || 'Untitled'}\n`;
      txt += `${'='.repeat(40)}\n\n`;
      if (note.surahName) txt += `Surah: ${note.surahName}\n`;
      if (note.verses) txt += `Verses: ${note.verses}\n`;
      if (note.pageNumbers) txt += `Page(s): ${note.pageNumbers}\n`;
      if (note.tags) txt += `Tags: ${note.tags}\n`;
      txt += `\n${note.reflection || ''}\n\n`;
      txt += `Created: ${new Date(note.createdAt).toLocaleString()}\n`;
      txt += `Updated: ${new Date(note.updatedAt).toLocaleString()}\n`;
      return txt;
    },

    // ── Utilities ──
    updateAllTags() {
      const tagSet = new Set();
      for (const note of this.notesStore.notes) {
        if (note.tags) {
          note.tags.split(',').map(t => t.trim()).filter(t => t).forEach(t => tagSet.add(t));
        }
      }
      this.notesStore.allTags = Array.from(tagSet).sort();
    },

    formatDate(isoString) {
      if (!isoString) return '';
      return new Date(isoString).toLocaleDateString(this.currentLocale === 'bn' ? 'bn-BD' : this.currentLocale === 'ar' ? 'ar-SA' : 'en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    },

    truncate(text, len = 120) {
      if (!text) return '';
      return text.length > len ? text.substring(0, len) + '...' : text;
    },

    // Professional markdown rendering using marked.js
    renderMarkdown(text) {
      if (!text) return '';
      try {
        // marked.js is loaded as UMD global — must access via window in ES modules
        if (typeof window.marked !== 'undefined' && window.marked.parse) {
          return window.marked.parse(text, { breaks: true, gfm: true });
        }
      } catch (e) {
        console.warn('[Murajah] Markdown parse error:', e);
      }
      // Fallback: escape HTML and convert newlines
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
    },

    // Pagination
    goToPage(page) {
      if (page >= 1 && page <= this.totalPages) {
        this.currentListPage = page;
      }
    }
  },
  template: `
    <div class="bg-white rounded-lg shadow-lg p-3 sm:p-4 md:p-6" :dir="isRtl ? 'rtl' : 'ltr'">

      <!-- ══════ LIST VIEW ══════ -->
      <div v-if="viewMode === 'list'">
        <!-- Header -->
        <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 class="text-lg sm:text-xl font-bold text-gray-800 flex items-center gap-2">
            <i class="fas fa-sticky-note text-emerald-600"></i>
            {{ $t('notes.title') }}
            <span class="text-sm font-normal text-gray-500">({{ filteredNotes.length }})</span>
          </h2>
          <button @click="openNewNote" class="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors text-sm font-medium">
            <i class="fas fa-plus"></i>
            {{ $t('notes.new') }}
          </button>
        </div>

        <!-- Search -->
        <div class="relative mb-4">
          <i class="fas fa-search absolute top-1/2 -translate-y-1/2 text-gray-400" :class="isRtl ? 'right-3' : 'left-3'"></i>
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="$t('notes.searchPlaceholder')"
            class="w-full py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
            :class="isRtl ? 'pr-10 pl-3' : 'pl-10 pr-3'"
          >
        </div>

        <!-- Empty state -->
        <div v-if="filteredNotes.length === 0" class="text-center py-12 text-gray-500">
          <i class="fas fa-sticky-note text-4xl mb-3 text-gray-300"></i>
          <p class="text-lg">{{ searchQuery ? $t('notes.noResults') : $t('notes.empty') }}</p>
          <p v-if="!searchQuery" class="text-sm mt-1">{{ $t('notes.emptyHint') }}</p>
        </div>

        <!-- Notes list -->
        <div v-else class="space-y-3">
          <div
            v-for="note in paginatedNotes"
            :key="note.id"
            class="border border-gray-200 rounded-lg p-3 sm:p-4 hover:border-emerald-300 hover:shadow-sm transition-all cursor-pointer group"
            @click="openViewNote(note)"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="flex-1 min-w-0">
                <h3 class="font-semibold text-gray-800 truncate">{{ note.title || $t('notes.untitled') }}</h3>
                <div class="flex flex-wrap gap-2 mt-1 text-xs text-gray-500">
                  <span v-if="note.surahName" class="flex items-center gap-1">
                    <i class="fas fa-book-quran"></i> {{ note.surahName }}
                  </span>
                  <span v-if="note.pageNumbers" class="flex items-center gap-1">
                    <i class="fas fa-file-alt"></i> {{ $t('notes.page') }} {{ note.pageNumbers }}
                  </span>
                  <span v-if="note.verses" class="flex items-center gap-1">
                    <i class="fas fa-list-ol"></i> {{ note.verses }}
                  </span>
                </div>
                <!-- Tags -->
                <div v-if="note.tags" class="flex flex-wrap gap-1 mt-2">
                  <span v-for="tag in note.tags.split(',').map(t => t.trim()).filter(t => t).slice(0, 5)" :key="tag"
                    class="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-xs">
                    {{ tag }}
                  </span>
                </div>
              </div>
              <div class="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                {{ formatDate(note.updatedAt) }}
              </div>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="flex items-center justify-center gap-2 mt-4">
          <button @click="goToPage(currentListPage - 1)" :disabled="currentListPage <= 1"
            class="px-3 py-1.5 rounded-lg text-sm border transition-colors"
            :class="currentListPage <= 1 ? 'text-gray-300 border-gray-200 cursor-not-allowed' : 'text-gray-600 border-gray-300 hover:bg-gray-50'">
            <i :class="isRtl ? 'fas fa-chevron-right' : 'fas fa-chevron-left'"></i>
          </button>
          <span class="text-sm text-gray-600">
            {{ currentListPage }} / {{ totalPages }}
          </span>
          <button @click="goToPage(currentListPage + 1)" :disabled="currentListPage >= totalPages"
            class="px-3 py-1.5 rounded-lg text-sm border transition-colors"
            :class="currentListPage >= totalPages ? 'text-gray-300 border-gray-200 cursor-not-allowed' : 'text-gray-600 border-gray-300 hover:bg-gray-50'">
            <i :class="isRtl ? 'fas fa-chevron-left' : 'fas fa-chevron-right'"></i>
          </button>
        </div>
      </div>

      <!-- ══════ VIEW NOTE ══════ -->
      <div v-if="viewMode === 'view' && viewingNote">
        <!-- Top bar -->
        <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
          <button @click="backToList" class="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800 transition-colors">
            <i :class="isRtl ? 'fas fa-chevron-right' : 'fas fa-chevron-left'"></i>
            {{ $t('notes.backToList') }}
          </button>
          <div class="flex items-center gap-2">
            <button @click="openEditNote(viewingNote)" class="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors text-sm">
              <i class="fas fa-edit"></i> {{ $t('notes.edit') }}
            </button>
            <div class="relative">
              <button @click="toggleExportMenu(viewingNote.id)" class="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm">
                <i class="fas fa-download"></i> {{ $t('notes.download') }}
              </button>
              <div v-if="showExportMenu === viewingNote.id" class="absolute top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[120px]" :class="isRtl ? 'left-0' : 'right-0'">
                <button @click="downloadNote(viewingNote, 'md')" class="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors">
                  <i class="fas fa-file-code mr-1"></i> .md
                </button>
                <button @click="downloadNote(viewingNote, 'txt')" class="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors">
                  <i class="fas fa-file-alt mr-1"></i> .txt
                </button>
              </div>
            </div>
            <button @click="confirmDelete(viewingNote.id)" class="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm">
              <i class="fas fa-trash"></i> {{ $t('notes.delete') }}
            </button>
          </div>
        </div>

        <!-- Delete confirmation -->
        <div v-if="deleteConfirmId === viewingNote.id" class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <span class="text-sm text-red-700">{{ $t('notes.deleteConfirm') }}</span>
          <div class="flex gap-2">
            <button @click="handleDelete(viewingNote.id)" class="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700">{{ $t('notes.confirmYes') }}</button>
            <button @click="cancelDelete" class="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300">{{ $t('notes.confirmNo') }}</button>
          </div>
        </div>

        <!-- Note content -->
        <div class="border border-gray-200 rounded-lg p-4 sm:p-6">
          <h1 class="text-xl sm:text-2xl font-bold text-gray-800 mb-3">{{ viewingNote.title || $t('notes.untitled') }}</h1>

          <!-- Meta -->
          <div class="flex flex-wrap gap-3 text-sm text-gray-500 mb-4">
            <span v-if="viewingNote.surahName" class="flex items-center gap-1">
              <i class="fas fa-book-quran text-emerald-500"></i> {{ viewingNote.surahName }}
            </span>
            <span v-if="viewingNote.verses" class="flex items-center gap-1">
              <i class="fas fa-list-ol text-blue-500"></i> {{ $t('notes.versesLabel') }}: {{ viewingNote.verses }}
            </span>
            <span v-if="viewingNote.pageNumbers" class="flex items-center gap-1">
              <i class="fas fa-file-alt text-purple-500"></i> {{ $t('notes.pageLabel') }}: {{ viewingNote.pageNumbers }}
            </span>
          </div>

          <!-- Tags -->
          <div v-if="viewingNote.tags" class="flex flex-wrap gap-1.5 mb-4">
            <span v-for="tag in viewingNote.tags.split(',').map(t => t.trim()).filter(t => t)" :key="tag"
              class="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium">
              #{{ tag }}
            </span>
          </div>

          <hr class="border-gray-200 mb-4">

          <!-- Rendered markdown reflection -->
          <div class="prose prose-sm max-w-none text-gray-700 leading-relaxed note-content" v-html="renderMarkdown(viewingNote.reflection)"></div>

          <hr class="border-gray-200 mt-6 mb-3">

          <!-- Timestamps -->
          <div class="text-xs text-gray-400 space-y-0.5">
            <p>{{ $t('notes.createdAt') }}: {{ formatDate(viewingNote.createdAt) }}</p>
            <p>{{ $t('notes.updatedAt') }}: {{ formatDate(viewingNote.updatedAt) }}</p>
          </div>
        </div>
      </div>

      <!-- ══════ EDIT / NEW NOTE ══════ -->
      <div v-if="viewMode === 'edit' && editNote">
        <!-- Top bar -->
        <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
          <button @click="backToList" class="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800 transition-colors">
            <i :class="isRtl ? 'fas fa-chevron-right' : 'fas fa-chevron-left'"></i>
            {{ $t('notes.cancel') }}
          </button>
          <button @click="handleSave" class="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors text-sm font-medium">
            <i class="fas fa-save"></i>
            {{ $t('notes.save') }}
          </button>
        </div>

        <div class="space-y-4">
          <!-- Title -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ $t('notes.titleLabel') }}</label>
            <input v-model="editNote.title" type="text" :placeholder="$t('notes.titlePlaceholder')"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm">
          </div>

          <!-- Surah -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ $t('notes.surahLabel') }}</label>
            <div class="relative">
              <div class="flex items-center gap-2">
                <button @click="showSurahDropdown = !showSurahDropdown" type="button"
                  class="flex-1 flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg text-sm hover:border-gray-400 transition-colors text-left">
                  <span :class="editNote.surahName ? 'text-gray-800' : 'text-gray-400'">
                    {{ editNote.surahName || $t('notes.selectSurah') }}
                  </span>
                  <i class="fas fa-chevron-down text-gray-400 text-xs"></i>
                </button>
                <button v-if="editNote.surahName" @click="clearSurah" class="px-2 py-2 text-gray-400 hover:text-red-500 transition-colors">
                  <i class="fas fa-times"></i>
                </button>
              </div>
              <!-- Surah dropdown -->
              <div v-if="showSurahDropdown" class="absolute top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-60 overflow-hidden flex flex-col">
                <div class="p-2 border-b border-gray-100">
                  <input v-model="surahSearchText" type="text" :placeholder="$t('notes.searchSurah')"
                    class="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:ring-1 focus:ring-emerald-500">
                </div>
                <div class="overflow-y-auto flex-1">
                  <button v-for="surah in filteredSurahs" :key="surah.number"
                    @click="selectSurah(surah)"
                    class="block w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 transition-colors"
                    :class="editNote.surahNumber === surah.number ? 'bg-emerald-50 text-emerald-700' : ''">
                    <span class="font-medium">{{ surah.number }}.</span> {{ surah.translated }}
                    <span v-if="currentLocale !== 'ar'" class="text-gray-400 text-xs">({{ surah.arabic }})</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Verses & Page side by side -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">{{ $t('notes.versesLabel') }}</label>
              <input v-model="editNote.verses" type="text" :placeholder="$t('notes.versesPlaceholder')"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">{{ $t('notes.pageLabel') }}</label>
              <input v-model="editNote.pageNumbers" type="text" :placeholder="$t('notes.pagePlaceholder')"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm">
            </div>
          </div>

          <!-- Reflection (markdown) -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              {{ $t('notes.reflectionLabel') }}
              <span class="text-gray-400 font-normal text-xs ml-1">{{ $t('notes.markdownSupported') }}</span>
            </label>
            <textarea v-model="editNote.reflection" rows="10" :placeholder="$t('notes.reflectionPlaceholder')"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm font-mono leading-relaxed resize-y"></textarea>
          </div>

          <!-- Tags -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ $t('notes.tagsLabel') }}</label>
            <div class="relative">
              <input v-model="tagInput" @input="onTagInput" @focus="showTagSuggestions = tagSuggestions.length > 0" @blur="delayHideTagSuggestions"
                type="text" :placeholder="$t('notes.tagsPlaceholder')"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm">
              <!-- Tag suggestions -->
              <div v-if="showTagSuggestions && tagSuggestions.length > 0"
                class="absolute top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
                <button v-for="tag in tagSuggestions" :key="tag"
                  @mousedown.prevent="selectTag(tag)"
                  class="block w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 transition-colors">
                  <i class="fas fa-tag text-emerald-400 mr-1 text-xs"></i> {{ tag }}
                </button>
              </div>
            </div>
          </div>

          <!-- Save button (bottom) -->
          <div class="flex justify-end pt-2">
            <button @click="handleSave" class="flex items-center gap-1.5 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors text-sm font-medium">
              <i class="fas fa-save"></i>
              {{ $t('notes.save') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `
};
