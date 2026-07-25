import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createManifest, hash } from '../src/lib/manifest.mjs'

function withTmpDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'murajah-manifest-test-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('addDataset combines per-chunk hashes into one dataset hash', () => {
  withTmpDir((dir) => {
    const manifest = createManifest()
    const chunks = [
      { page: 1, bytes: 10, hash: 'aaa' },
      { page: 2, bytes: 20, hash: 'bbb' },
    ]
    manifest.addDataset('qpc', { pathTemplate: 'data/qpc/pages/{page}.json', count: 2, chunks })
    const { runtime } = manifest.write(dir)
    assert.equal(runtime.datasets.qpc.hash, hash('aaa' + 'bbb'))
    assert.equal(runtime.datasets.qpc.pathTemplate, 'data/qpc/pages/{page}.json')
    assert.equal(runtime.datasets.qpc.count, 2)
  })
})

test('a changed chunk hash changes the dataset hash (content, not build time, drives it)', () => {
  const before = ['aaa', 'bbb']
  const after = ['aaa', 'ccc']
  assert.notEqual(hash(before.join('')), hash(after.join('')))
})

test('identical chunk hashes always produce the same dataset hash', () => {
  withTmpDir((dir) => {
    const chunks = [
      { page: 1, bytes: 10, hash: 'aaa' },
      { page: 2, bytes: 20, hash: 'bbb' },
    ]
    const m1 = createManifest()
    m1.addDataset('qpc', { pathTemplate: 't', count: 2, chunks })
    const { runtime: r1 } = m1.write(dir)

    const m2 = createManifest()
    m2.addDataset('qpc', { pathTemplate: 't', count: 2, chunks })
    const { runtime: r2 } = m2.write(dir)

    assert.equal(r1.datasets.qpc.hash, r2.datasets.qpc.hash)
  })
})

test('addIndex propagates hash into the runtime manifest, not just build-info', () => {
  withTmpDir((dir) => {
    const manifest = createManifest()
    manifest.addIndex('navQpc', { path: 'data/nav/qpc.json', bytes: 123, hash: 'deadbeef' })
    const { runtime, buildInfo } = manifest.write(dir)

    assert.equal(runtime.indexes.navQpc.path, 'data/nav/qpc.json')
    assert.equal(runtime.indexes.navQpc.hash, 'deadbeef')
    assert.equal(buildInfo.indexes.navQpc.hash, 'deadbeef')

    const onDisk = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
    assert.equal(onDisk.indexes.navQpc.hash, 'deadbeef')
  })
})

test('runtime.version is a timestamp, independent of dataset/index content', () => {
  withTmpDir((dir) => {
    const manifest = createManifest()
    manifest.addIndex('surahNames', { path: 'data/surah-names.json', bytes: 1, hash: 'x' })
    const { runtime } = manifest.write(dir)
    assert.equal(typeof runtime.version, 'string')
    assert.doesNotThrow(() => new Date(runtime.version).toISOString())
  })
})
