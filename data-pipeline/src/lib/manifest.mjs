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
 *
 * `runtime.version` is a build timestamp for display/debug only — it is NOT a
 * cache-invalidation signal. Every dataset/index also carries its own content
 * hash (below), which the client appends as a `?v=` query param per URL; that
 * per-URL hash is what actually guarantees a schema/content change is fetched
 * fresh. Do not wire `version` back into any cache-purge logic: since
 * `data-pipeline` runs on every `prebuild` regardless of whether source data
 * changed, a version that changes on every deploy would force a full-cache
 * wipe (nav index, every downloaded page, images, fonts — everything) on
 * every code-only deploy too, not just real data updates.
 */
export function createManifest() {
  const runtime = { version: new Date().toISOString(), datasets: {} }
  const buildInfo = { datasets: {} }

  return {
    addDataset(name, { pathTemplate, count, chunks }) {
      // One combined hash per dataset (not per chunk): keeps the runtime
      // manifest small, and means a content fix to one page/surah re-verifies
      // (re-fetches) that whole dataset together rather than silently mixing
      // old and new chunks under one layout.
      const datasetHash = hash(chunks.map((c) => c.hash).join(''))
      runtime.datasets[name] = { pathTemplate, count, hash: datasetHash }
      buildInfo.datasets[name] = { chunks }
    },
    /** A single non-chunked file (an index/mapping the app loads whole). */
    addIndex(name, { path, bytes, hash: fileHash }) {
      runtime.indexes ??= {}
      runtime.indexes[name] = { path, hash: fileHash }
      buildInfo.indexes ??= {}
      buildInfo.indexes[name] = { bytes, hash: fileHash }
    },
    write(outputData) {
      writeJson(`${outputData}/manifest.json`, runtime)
      writeJson(`${outputData}/build-info.json`, buildInfo)
      return { runtime, buildInfo }
    },
  }
}
