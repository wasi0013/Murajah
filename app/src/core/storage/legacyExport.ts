// Lossless bridge between the legacy v2.0.0 backup JSON and the new app's
// canonical runtime user-data shape. See plans/archive/legacy-schema.md.
//
// Guarantee: serializeUserData(parseLegacyExport(json)) deep-equals `json`
// (given the original `exported` timestamp) — no existing user loses data, and
// export/import stays compatible in both directions.

export const LEGACY_EXPORT_VERSION = '2.0.0'

export interface RecordingMeta {
  pageNumber: number
  recordedAt: string
  duration: number
  timestamp: number
}

export interface DailyGoalsData {
  todayGoal: unknown | null
  goalHistory: unknown[]
  streak: number
  longestStreak: number
  selectedTasks: string[]
}

/** Canonical runtime user data (Sets/Maps, as the app manipulates it). */
export interface UserData {
  memorized: Set<number>
  perfectRevisions: Map<number, number>
  mistakes: Map<number, Set<number>>
  settings: Record<string, unknown>
  recordings: RecordingMeta[]
  dailyGoals: DailyGoalsData
  notes: unknown[]
}

/** The on-disk v2.0.0 backup shape. */
export interface LegacyExport {
  version: string
  exported: string
  memorized: number[]
  perfectRevisions: Record<string, number>
  mistakes: Record<string, number[]>
  settings: Record<string, unknown>
  recordings: RecordingMeta[]
  dailyGoals: DailyGoalsData
  notes: unknown[]
}

export class UnsupportedBackupError extends Error {
  constructor(version: unknown) {
    super(`Unsupported backup version: ${version ?? 'unknown'}. Expected ${LEGACY_EXPORT_VERSION}`)
    this.name = 'UnsupportedBackupError'
  }
}

const emptyDailyGoals = (): DailyGoalsData => ({
  todayGoal: null,
  goalHistory: [],
  streak: 0,
  longestStreak: 0,
  selectedTasks: [],
})

/** Parse a legacy backup into canonical UserData. Throws on version mismatch. */
export function parseLegacyExport(json: Partial<LegacyExport>): UserData {
  if (json.version !== LEGACY_EXPORT_VERSION) throw new UnsupportedBackupError(json.version)

  return {
    memorized: new Set((json.memorized ?? []).map(Number)),
    perfectRevisions: new Map(
      Object.entries(json.perfectRevisions ?? {}).map(([k, v]) => [Number(k), Number(v)]),
    ),
    mistakes: new Map(
      Object.entries(json.mistakes ?? {}).map(([k, v]) => [
        Number(k),
        new Set((Array.isArray(v) ? v : []).map(Number)),
      ]),
    ),
    settings: json.settings ?? {},
    recordings: json.recordings ?? [],
    dailyGoals: json.dailyGoals ?? emptyDailyGoals(),
    notes: json.notes ?? [],
  }
}

/** Serialize canonical UserData back to the v2.0.0 backup shape. */
export function serializeUserData(
  data: UserData,
  exportedAt: string = new Date().toISOString(),
): LegacyExport {
  return {
    version: LEGACY_EXPORT_VERSION,
    exported: exportedAt,
    memorized: [...data.memorized],
    perfectRevisions: Object.fromEntries([...data.perfectRevisions].map(([k, v]) => [String(k), v])),
    mistakes: Object.fromEntries([...data.mistakes].map(([k, set]) => [String(k), [...set]])),
    settings: data.settings,
    recordings: data.recordings,
    dailyGoals: data.dailyGoals,
    notes: data.notes,
  }
}
