// Browser file I/O for backups: turn an export envelope into a downloaded file,
// and turn a picked file back into a validated snapshot. The validation lives in
// exportImport (readImport); this module only bridges the File/Blob edges, so the
// pure export/import core stays DOM-free and unit-testable.

import { readImport, InvalidBackupError, type ExportSnapshot, type MurajahExport } from './exportImport'

/** `murajah-backup-2026-07-18.json` — dated from the envelope's export time. */
export function backupFilename(env: MurajahExport): string {
  const day = env.exported.slice(0, 10) // ISO date portion; falsy-safe on odd input
  return `murajah-backup-${day || 'export'}.json`
}

/** Pretty-print the envelope for a human-readable, diff-friendly backup file. */
export function serializeBackup(env: MurajahExport): string {
  return JSON.stringify(env, null, 2)
}

/** Trigger a download of the backup envelope as a JSON file (best-effort DOM). */
export function downloadBackup(env: MurajahExport): void {
  const blob = new Blob([serializeBackup(env)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = backupFilename(env)
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Read a picked file into a validated snapshot. Malformed JSON and unrecognized
 * backups both surface as {@link InvalidBackupError} with a user-facing message,
 * so the caller can show one toast for any bad file.
 */
export async function readBackupFile(file: File): Promise<ExportSnapshot> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    throw new InvalidBackupError('This file is not valid JSON.')
  }
  return readImport(parsed)
}
