import { describe, it, expect } from 'vitest'
import {
  backupFilename,
  serializeBackup,
  readBackupFile,
} from '@/core/storage/backupFile'
import { buildExport, InvalidBackupError } from '@/core/storage/exportImport'

const env = buildExport(
  { progress: { memorized: [1, 2], perfectRevisions: {}, hasanah: 0 }, theme: 'dark' },
  '2026-07-18T09:30:00.000Z',
)

const asFile = (text: string) => new File([text], 'backup.json', { type: 'application/json' })

describe('backup file I/O', () => {
  it('dates the filename from the export time', () => {
    expect(backupFilename(env)).toBe('murajah-backup-2026-07-18.json')
  })

  it('pretty-prints the envelope', () => {
    const text = serializeBackup(env)
    expect(text).toContain('\n  ') // indented
    expect(JSON.parse(text)).toEqual(env)
  })

  it('reads a valid backup file into a snapshot', async () => {
    const snap = await readBackupFile(asFile(serializeBackup(env)))
    expect(snap.progress?.memorized).toEqual([1, 2])
    expect(snap.theme).toBe('dark')
  })

  it('rejects malformed JSON with a friendly error', async () => {
    await expect(readBackupFile(asFile('{not json'))).rejects.toThrow(InvalidBackupError)
    await expect(readBackupFile(asFile('{not json'))).rejects.toThrow(/valid JSON/)
  })

  it('rejects a file that is valid JSON but not a backup', async () => {
    await expect(readBackupFile(asFile('{"hello":"world"}'))).rejects.toThrow(/Unrecognized/)
  })
})
