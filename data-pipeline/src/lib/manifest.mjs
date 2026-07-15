import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** Short content hash used for cache-busting + integrity. */
export function hash(str) {
  return createHash('sha256').update(str).digest('hex').slice(0, 12)
}

/** Write a JSON file (compact), creating parent dirs. Returns {bytes, hash}. */
export function writeJson(filePath, value) {
  const json = JSON.stringify(value)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, json)
  return { bytes: Buffer.byteLength(json), hash: hash(json) }
}

/**
 * Accumulates build output into two artifacts:
 *  - manifest.json   — lean, loaded by the app at runtime (counts + path templates)
 *  - build-info.json — per-chunk sizes/hashes for integrity/debug (NOT loaded at runtime)
 */
export function createManifest() {
  const runtime = { version: new Date().toISOString(), datasets: {} }
  const buildInfo = { datasets: {} }

  return {
    addDataset(name, { pathTemplate, count, chunks }) {
      runtime.datasets[name] = { pathTemplate, count }
      buildInfo.datasets[name] = { chunks }
    },
    write(outputData) {
      writeJson(`${outputData}/manifest.json`, runtime)
      writeJson(`${outputData}/build-info.json`, buildInfo)
      return { runtime, buildInfo }
    },
  }
}
