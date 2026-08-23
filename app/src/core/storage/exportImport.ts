// Native backup: a single versioned JSON envelope carrying the whole local
// profile, so a user can move between devices or keep a safety copy. The §6
// data-safety rule — no data is stranded, and a backup taken now must import
// cleanly later. Legacy v2.0.0 backups import too, via legacyExport's bridge.
//
// The pure functions here (buildExport / readImport) know nothing about
// IndexedDB; the async glue at the bottom reads and writes the real stores by
// reusing the tested (de)serializers, so import can never write a shape the app
// can't load. Recording audio blobs are device-local and never exported.

import {
  backfillReviewDates,
  deserializeDayLog,
  deserializeJournal,
  deserializeMistakes,
  deserializePlan,
  deserializeProgress,
  deserializeQuizAccuracy,
  loadAudioPrefs,
  loadDayLog,
  loadFullJournal,
  loadMistakes,
  loadPlan,
  loadProgress,
  loadQuizAccuracy,
  mergeJournal,
  saveAudioPrefs,
  saveDayLog,
  saveFullJournal,
  saveMistakes,
  savePlan,
  saveProgress,
  saveQuizAccuracy,
  serializeDayLog,
  serializeJournalLog,
  serializeMistakes,
  serializePlan,
  serializeProgress,
  serializeQuizAccuracy,
  type StoredAudioPrefs,
  type StoredDayLog,
  type StoredJournal,
  type StoredMistakes,
  type StoredPlan,
  type StoredProgress,
  type StoredQuizAccuracy,
} from './userData'
import { getPref, setPref } from './prefs'
import { parseLegacyExport, LEGACY_EXPORT_VERSION, type LegacyExport } from './legacyExport'
import type { ReaderPrefs } from '@/stores/reader'
import type { ThemeName } from '@/stores/settings'
import type { Layout } from '@/core/data/types'

export const EXPORT_APP = 'murajah'
/** Native envelope schema version — bumped only on a breaking shape change. */
export const EXPORT_VERSION = 1

const READER_PREF_KEY = 'reader'
const THEME_PREF_KEY = 'theme'

/**
 * Everything a backup carries. Every field is optional so a partial profile (or
 * a legacy backup that only had memorization data) still round-trips, and a
 * newer field missing from an older file is simply left untouched on import.
 * `reader` is a partial so a legacy backup can contribute just layout/tajweed.
 */
export interface ExportSnapshot {
  progress?: StoredProgress
  mistakes?: StoredMistakes
  plan?: StoredPlan | null
  dayLog?: StoredDayLog
  /** Phase 12.6 — unlike every other key here, import **merges** this one
   * instead of replacing it. See `importUserData`'s journal branch. */
  journal?: StoredJournal
  quiz?: StoredQuizAccuracy
  audio?: StoredAudioPrefs
  reader?: Partial<ReaderPrefs>
  theme?: ThemeName
}

export interface MurajahExport {
  app: typeof EXPORT_APP
  version: number
  exported: string
  data: ExportSnapshot
}

export class InvalidBackupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidBackupError'
  }
}

/** Wrap a snapshot in the versioned envelope, omitting keys that carry nothing. */
export function buildExport(
  snap: ExportSnapshot,
  exportedAt: string = new Date().toISOString(),
): MurajahExport {
  const data: ExportSnapshot = {}
  if (snap.progress) data.progress = snap.progress
  if (snap.mistakes) data.mistakes = snap.mistakes
  if (snap.plan !== undefined) data.plan = snap.plan
  if (snap.dayLog) data.dayLog = snap.dayLog
  if (snap.journal) data.journal = snap.journal
  if (snap.quiz) data.quiz = snap.quiz
  if (snap.audio) data.audio = snap.audio
  if (snap.reader) data.reader = snap.reader
  if (snap.theme) data.theme = snap.theme
  return { app: EXPORT_APP, version: EXPORT_VERSION, exported: exportedAt, data }
}

const THEMES: readonly ThemeName[] = ['light', 'dark', 'sepia']

/** Adapt a legacy v2.0.0 backup to the native snapshot's portable subset. */
function fromLegacy(json: Partial<LegacyExport>): ExportSnapshot {
  const u = parseLegacyExport(json) // throws UnsupportedBackupError on a bad version

  const perfectRevisions: Record<string, number> = {}
  for (const [page, n] of u.perfectRevisions) if (n > 0) perfectRevisions[String(page)] = n
  const mistakes: StoredMistakes = {}
  for (const [page, set] of u.mistakes) mistakes[String(page)] = [...set]

  const snap: ExportSnapshot = {
    // hasanah has no legacy equivalent; a fresh reward counter is the honest default.
    progress: { memorized: [...u.memorized].sort((a, b) => a - b), perfectRevisions, hasanah: 0 },
    mistakes,
  }

  // Only the cleanly-typed prefs carry over; the legacy goal/plan model doesn't
  // map onto the new plan + day-log shapes and is left to the new-format path.
  const s = u.settings as Record<string, unknown>
  const layout: Layout | undefined =
    s.layout === 'indopak' ? 'indopak' : s.layout === 'qpc' ? 'qpc' : undefined
  const reader: Partial<ReaderPrefs> = {}
  if (layout) reader.layout = layout
  if (typeof s.tajweedEnabled === 'boolean') reader.tajweed = s.tajweedEnabled
  if (Object.keys(reader).length) snap.reader = reader

  return snap
}

/**
 * Validate an untrusted parsed JSON value and return the snapshot it carries.
 * Routes a legacy v2.0.0 file through the legacy bridge; otherwise expects the
 * native envelope. Throws {@link InvalidBackupError} on anything unrecognizable.
 */
export function readImport(json: unknown): ExportSnapshot {
  if (!json || typeof json !== 'object') {
    throw new InvalidBackupError('This file is not a Murajah backup.')
  }
  const obj = json as Record<string, unknown>

  if (obj.version === LEGACY_EXPORT_VERSION) return fromLegacy(obj as Partial<LegacyExport>)

  if (obj.app === EXPORT_APP) {
    if (!obj.data || typeof obj.data !== 'object') {
      throw new InvalidBackupError('This backup is missing its data.')
    }
    return sanitizeSnapshot(obj.data as Record<string, unknown>)
  }

  throw new InvalidBackupError('Unrecognized backup format.')
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Keep only known keys of the right broad kind; the tested store (de)serializers
 * normalize the inner values on write, so this just rejects wrong-shaped keys
 * (e.g. an array where an object belongs) rather than silently corrupting a store.
 */
function sanitizeSnapshot(data: Record<string, unknown>): ExportSnapshot {
  const snap: ExportSnapshot = {}
  if (isObj(data.progress)) snap.progress = data.progress as unknown as StoredProgress
  if (isObj(data.mistakes)) snap.mistakes = data.mistakes as StoredMistakes
  if (data.plan === null || isObj(data.plan)) {
    snap.plan = (data.plan as unknown as StoredPlan | null) ?? null
  }
  if (isObj(data.dayLog)) snap.dayLog = data.dayLog as unknown as StoredDayLog
  if (isObj(data.journal)) snap.journal = data.journal as unknown as StoredJournal
  if (isObj(data.quiz)) snap.quiz = data.quiz as StoredQuizAccuracy
  if (isObj(data.audio)) snap.audio = data.audio as StoredAudioPrefs
  if (isObj(data.reader)) snap.reader = data.reader as Partial<ReaderPrefs>
  if (typeof data.theme === 'string' && THEMES.includes(data.theme as ThemeName)) {
    snap.theme = data.theme as ThemeName
  }
  return snap
}

// —— IndexedDB glue ——————————————————————————————————————————————————
// Read the live stores into a snapshot / write a snapshot into the live stores,
// reusing the same (de)serializers the app uses so nothing can drift.

/** Gather the whole local profile into a versioned export envelope. */
export async function exportUserData(): Promise<MurajahExport> {
  const [progress, mistakes, plan, dayLog, journal, quiz, audio, reader, theme] = await Promise.all([
    loadProgress(),
    loadMistakes(),
    loadPlan(),
    loadDayLog(),
    loadFullJournal(),
    loadQuizAccuracy(),
    loadAudioPrefs(),
    getPref<ReaderPrefs>(READER_PREF_KEY),
    getPref<ThemeName>(THEME_PREF_KEY),
  ])
  return buildExport({
    progress: serializeProgress(progress),
    mistakes: serializeMistakes(mistakes),
    plan: serializePlan(plan),
    dayLog: serializeDayLog(dayLog),
    journal: serializeJournalLog(journal),
    quiz: serializeQuizAccuracy(quiz),
    audio,
    reader,
    theme,
  })
}

/**
 * Write a snapshot into the live stores. Only keys the backup carries are
 * touched — an absent key leaves that store as-is (so a legacy import can't wipe
 * a plan it never had). Each key routes through its deserializer, so a hand-edited
 * or partial value is normalized rather than trusted verbatim.
 */
export async function importUserData(snap: ExportSnapshot): Promise<void> {
  const jobs: Promise<void>[] = []
  // Backfill missing review dates on import too, not just on app-boot load —
  // a legacy v2.0.0 backup (no `reviewData` field at all) or an old native
  // export can be imported long after this feature shipped, so the stamp
  // must use *today* (import time), not some earlier migration date.
  if (snap.progress) jobs.push(saveProgress(backfillReviewDates(deserializeProgress(snap.progress)).progress))
  if (snap.mistakes) jobs.push(saveMistakes(deserializeMistakes(snap.mistakes)))
  if (snap.plan !== undefined) jobs.push(savePlan(deserializePlan(snap.plan)))
  if (snap.dayLog) jobs.push(saveDayLog(deserializeDayLog(snap.dayLog)))
  // Deliberately NOT a replace like every key above/below (dayLog included) —
  // a reflection note is editable on any past day, indefinitely, so a plausible
  // sequence is "edit today's note on this device, then import an older backup
  // taken on another device"; a straight replace would silently discard the
  // newer edit. mergeJournal (Phase 12.6.2) unions by date, keeps the note with
  // the later `noteUpdatedAt`, and unions events by id. See
  // plans/phase-12-journal.md §12.6 for the full rationale.
  if (snap.journal) {
    jobs.push(
      (async () => {
        const merged = mergeJournal(await loadFullJournal(), deserializeJournal(snap.journal))
        await saveFullJournal(merged)
      })(),
    )
  }
  if (snap.quiz) jobs.push(saveQuizAccuracy(deserializeQuizAccuracy(snap.quiz)))
  if (snap.audio) jobs.push(saveAudioPrefs(snap.audio))
  // reader can arrive partial (a legacy backup carries only layout/tajweed), so
  // merge onto the existing prefs rather than dropping the untouched fields.
  if (snap.reader) {
    const reader = snap.reader
    jobs.push(
      (async () => {
        const existing = (await getPref<ReaderPrefs>(READER_PREF_KEY)) ?? {}
        await setPref(READER_PREF_KEY, { ...existing, ...reader })
      })(),
    )
  }
  if (snap.theme) jobs.push(setPref(THEME_PREF_KEY, snap.theme))
  await Promise.all(jobs)
}
