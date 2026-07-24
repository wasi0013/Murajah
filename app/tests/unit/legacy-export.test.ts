import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parseLegacyExport,
  serializeUserData,
  UnsupportedBackupError,
  LEGACY_EXPORT_VERSION,
  type LegacyExport,
} from '@/core/storage/legacyExport'

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/legacy-export.json'), 'utf8'),
) as LegacyExport

describe('legacy export migration', () => {
  it('parses a real v2.0.0 backup into Sets/Maps', () => {
    const data = parseLegacyExport(fixture)
    expect(data.memorized).toBeInstanceOf(Set)
    expect(data.memorized.has(604)).toBe(true)
    expect(data.perfectRevisions.get(1)).toBe(5)
    expect(data.mistakes.get(3)).toEqual(new Set([1, 4, 7]))
    expect(data.dailyGoals.streak).toBe(4)
    expect(data.notes).toHaveLength(1)
  })

  it('round-trips losslessly: json → parse → serialize deep-equals json', () => {
    const data = parseLegacyExport(fixture)
    const out = serializeUserData(data, fixture.exported)
    expect(out).toEqual(fixture)
  })

  it('is idempotent across a double round-trip', () => {
    const once = serializeUserData(parseLegacyExport(fixture), fixture.exported)
    const twice = serializeUserData(parseLegacyExport(once), fixture.exported)
    expect(twice).toEqual(once)
  })

  it('rejects unsupported versions', () => {
    expect(() => parseLegacyExport({ ...fixture, version: '1.0.0' })).toThrow(UnsupportedBackupError)
    expect(() => parseLegacyExport({})).toThrow(/Expected 2\.0\.0/)
  })

  it('tolerates a minimal backup (only version)', () => {
    const data = parseLegacyExport({ version: LEGACY_EXPORT_VERSION })
    expect(data.memorized.size).toBe(0)
    expect(data.dailyGoals.streak).toBe(0)
  })
})
