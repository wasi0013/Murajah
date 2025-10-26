# Murajah Copilot Instructions

## Project Overview

**Murajah** is a Vue 3-based SPA for Quranic memorization and revision tracking. The app runs entirely in the browser with no backend server, persisting data via IndexedDB. It features two main pages: `index.html` (memorization dashboard) and `quiz.html` (interactive quizzes).

Key domains:
- **Quran Data**: 604 pages, 30 Juz, word-by-word translations, Tajweed highlighting
- **User Progress**: memorized pages, mistakes, daily goals, streaks
- **Recording System**: audio playback for recitation review

## Architecture Patterns

### Single-Page Structure with Inline State Management
- **No external build step**: Vue 3 global build + Tailwind CDN loaded directly in HTML
- **State**: All stores (appStore, memorizedStore, quranStore, etc.) are Vue 3 reactive objects defined in `source/resources/js/stores/`
- **Database**: `MurajahDB` class (lines 817–950 in `index.html`) wraps IndexedDB; instantiated once as `murajahDB`
- **Initialization flow** (index.html ~line 1090):
  1. `murajahDB.init()` → opens IndexedDB connection
  2. `loadQuranData()` → fetches Quran JSON files (~qpc-v2-15-lines.json, qpc-v2-word-by-word.json, surah-names.json, english-wbw-translation.json)
  3. Store loaders (`loadMemorizedPages`, `loadSettings`, etc.) populate reactive objects from IndexedDB
  4. `createApp()` mounts root component with all stores injected via template

### Store Organization
Each store file (`source/resources/js/stores/*.js`) exports:
- **Reactive object**: Contains state (e.g., `memorizedStore.memorizedPages` is a Set)
- **Action functions**: Mutate state + call `murajahDB` methods (e.g., `toggleMemorized(pageNum, murajahDB)`)
- **Computed helpers**: Filter/calculate derived data

Example pattern from `memorizedStore.js`:
```javascript
export const memorizedStore = reactive({ memorizedPages: new Set() });
export const toggleMemorized = async (pageNum, murajahDB) => {
  if (memorizedStore.memorizedPages.has(pageNum)) {
    memorizedStore.memorizedPages.delete(pageNum);
    await murajahDB.removeMemorized(pageNum);
  }
  // ...
};
```

### Data Flow: Stores → Components → IndexedDB
1. Components import stores directly (`import { memorizedStore } from '../stores/memorizedStore.js'`)
2. Components call store actions, passing `murajahDB` (injected from global scope in HTML)
3. Store actions update reactive object + persist via `murajahDB` async methods
4. Vue reactivity automatically re-renders bound templates

## Component Conventions

- **Location**: `source/resources/js/components/` (e.g., DashboardComponent.js)
- **Format**: Object with `template` string (Vue 3 template syntax) + setup code in script tag
- **Registration**: Manually registered in HTML via `app.component('component-name', ImportedComponent)`
- **Props/State**: Use destructured imports + computed properties from stores

Common components:
- **DashboardComponent.js**: Juz grid, progress stats, daily goals widget
- **QuranPageComponent.js**: Renders single page with Tajweed highlighting
- **MistakeTrackerComponent.js**: Tracks pages with errors + statistics
- **SettingsComponent.js**: Text size, Tajweed toggle, data export/backup
- **AudioPlaylistComponent.js**: Record/manage/playback recitations

## Quran Data & Word-By-Word System

### Data Files (in `source/resources/json/`)
- **qpc-v2-15-lines.json**: Layout metadata (`pages` array); each page has 15 lines with word ID ranges
- **qpc-v2-word-by-word.json**: Word object map; key = word hash, value = `{id, text, surah, ayah, ...}`
- **surah-names.json**: Surah number → Arabic name mapping
- **english-wbw-translation.json**: Word ID → English translation map

### Loading Strategy
`dataLoader.js` provides `loadAllQuranData()` which:
- Fetches all 4 JSON files in parallel
- Caches results to avoid re-fetching
- Creates word ID lookup map for O(1) access when rendering lines

### Rendering a Page
1. Get page lines via `getPageLines(pageNum)` → filters layout data by `page_number`
2. For each line, iterate word IDs (`first_word_id` to `last_word_id`)
3. Look up word text + translation in cached data
4. Apply Tajweed CSS class based on word properties (if `tajweedEnabled`)

## IndexedDB Schema

```javascript
// Object stores created in MurajahDB.init():
- appData: Stores app settings + serialized memorized/mistakes sets
  key format: 'murajah-data', 'murajah-theme', 'setting-*'
- recordings: Audio blobs for recitations
  key format: 'recording-{index}'
- dailyGoals: Daily task snapshots
  key format: date string (YYYY-MM-DD)
```

### Common DB Methods
- `saveData(data)` / `loadData()`: Bulk state persistence
- `addMemorized(pageNum)` / `removeMemorized(pageNum)`: Manage memorized pages
- `setSetting(key, value)` / `getSetting(key, default)`: Settings persistence
- `saveDailyGoal(date, goalData)` / `getDailyGoal(date)`: Track daily tasks

## Cross-Component Communication

**No event emitter or prop drilling**: All communication flows through shared stores. Example:
- User clicks "Mark as Memorized" button in QuranPageComponent
- Component calls `toggleMemorized(pageNum, murajahDB)` from memorizedStore
- Store updates `memorizedStore.memorizedPages`
- DashboardComponent re-renders automatically (uses computed property on same store)

## Development Workflow

### Local Testing
- Open `source/index.html` directly in browser (no build tool needed)
- Browser console shows `[Murajah]` prefixed logs from all modules
- IndexedDB data persists across refreshes; clear via DevTools or `murajahDB.clearAll()`

### Data Import/Export
- Settings component (SettingsComponent.js) provides "Export Data" feature
- Exports JSON snapshot of all stores for backup/sharing
- No automated tests; manual QA via browser

### Adding a Feature

1. **New Store**: Create `source/resources/js/stores/featureStore.js` with reactive object + action functions
2. **New Component**: Create `source/resources/js/components/FeatureComponent.js` with template + computed properties
3. **HTML Integration**: Import + register component in index.html before `createApp()`
4. **Data Persistence**: Add DB methods to MurajahDB class if storing user data

## Project-Specific Conventions

- **Page Numbering**: 1–604 (Quran standard)
- **Juz Numbering**: 1–30
- **Console Logging**: Prefix with `[Murajah]` for easy filtering
- **Error Handling**: Caught errors logged to console + displayed via `appStore.errorMessage` (auto-clears after 5s)
- **Theme Toggle**: Only light no dark mode.
- **Tajweed Rules**: Text highlighting applied via CSS classes (font colored based on tajweed category)

## Files to Modify When...

- **Adding memorization feature**: Edit `memorizedStore.js` + `DashboardComponent.js`
- **Adding quiz question type**: Edit `quiz.html` (entire quiz app embedded there)
- **Adding Quran data parsing**: Edit `dataLoader.js` + `quranStore.js`
- **Adding persistent setting**: Add method to `MurajahDB` class + store action + UI in `SettingsComponent.js`
- **Styling**: Use Tailwind utility classes directly in templates; CSS resets in `index.html` no dark mode.
