# Legacy Data Schema & Migration (Phase 1.9)

**Parent:** [phase-1-data-assets.md](./phase-1-data-assets.md) · task 1.9.1.
Documents the legacy IndexedDB stores and the v2.0.0 export format that existing users' data lives in, and how the new app migrates it losslessly.

## 1. Legacy IndexedDB stores

DB created in `source/index.html` (`_createSchema`). Eight object stores:

| Store | keyPath | Contents | Migrate? |
|---|---|---|---|
| `appData` | `id` | Main blob under id `murajah-data` (memorized pages, perfect revisions, mistakes, settings) | **Yes (user data)** |
| `dailyGoals` | `date` | Daily goal record per date | **Yes** |
| `notes` | `id` | User notes / reflections | **Yes** |
| `plans` | `id` | Guided memorization/revision plans (indexes: status, type) | **Yes** |
| `planHistory` | `id` | Daily plan task records (indexes: planId, date, planId_date) | **Yes** |
| `recordings` | `id` (autoInc) | Audio recordings — **blob audio**, plus metadata | **Yes (metadata; blobs are device-local)** |
| `quranCache` | `id` | Cached Quran page data | No — asset cache, regenerated |
| `resourceCache` | `id` | Cached static resources (JS/CSS/fonts) | No — asset cache, regenerated |

## 2. Export/import JSON format (v2.0.0)

The user-facing backup (`exportData` in legacy) is the practical migration source. Shape:

```jsonc
{
  "version": "2.0.0",
  "exported": "<ISO timestamp>",
  "memorized": [1, 2, 3],                    // Set<pageNumber> → array
  "perfectRevisions": { "1": 5, "2": 3 },    // Map<page, count>
  "mistakes": { "3": [1, 4, 7] },            // Map<page, Set<wordId>>
  "settings": { /* settingsStore snapshot */ },
  "recordings": [                             // metadata only — NO audio blob
    { "pageNumber": 1, "recordedAt": "…", "duration": 1234, "timestamp": 1699… }
  ],
  "dailyGoals": {
    "todayGoal": { /* … */ },
    "goalHistory": [ /* … */ ],
    "streak": 4,
    "longestStreak": 12,
    "selectedTasks": ["recite", "review"]
  },
  "notes": [ /* note objects */ ]
}
```

**Not in the export:** `plans` / `planHistory` (IndexedDB-only in legacy) and recording **audio blobs** (device-local, non-portable). Migration preserves everything the export carries; plan migration is handled directly from IndexedDB when the plans feature lands (Phase 5).

## 3. Migration model

The new app's canonical runtime user-data shape (`UserData`) uses `Set`/`Map` (matching how the app manipulates it). Two pure functions guarantee compatibility:

- `parseLegacyExport(json) → UserData` — validates `version`, converts arrays/objects → `Set`/`Map`.
- `serializeUserData(UserData) → LegacyExport` — converts back to the exact v2.0.0 JSON.

**Lossless round-trip test:** `json → parse → serialize` deep-equals the original `json`. This is the safety guarantee that no existing user loses data across the migration, and keeps **export/import compatible in both directions** (task 1.9.3).

Persisting `UserData` to the new user-data IndexedDB store is mechanical and lands with the first consuming feature (memorized pages → Phase 4), reusing `parseLegacyExport`.
