import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

function fixture(t, manifestName = '@xpert-ai/plugin-excalidraw') {
  const root = mkdtempSync(join(tmpdir(), 'excalidraw-manifest-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'scripts'))
  mkdirSync(join(root, '.xpertai-plugin'))
  const script = join(root, 'scripts/sync-plugin-manifest-version.mjs')
  copyFileSync(new URL('./sync-plugin-manifest-version.mjs', import.meta.url), script)
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@xpert-ai/plugin-excalidraw', version: '1.2.3' }))
  const path = join(root, '.xpertai-plugin/plugin.json')
  const metadata = { name: manifestName, version: '0.9.0', level: 'system', artifactNamespace: 'excalidraw' }
  writeFileSync(path, JSON.stringify(metadata))
  return { path, metadata, run: () => spawnSync(process.execPath, [script], { encoding: 'utf8' }) }
}

test('packing synchronizes a release version without changing other metadata', (t) => {
  const { path, metadata, run } = fixture(t)
  assert.equal(run().status, 0)
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), { ...metadata, version: '1.2.3' })
  const synchronized = readFileSync(path, 'utf8')
  assert.equal(run().status, 0)
  assert.equal(readFileSync(path, 'utf8'), synchronized)
})

test('a manifest for a different plugin is rejected without modification', (t) => {
  const { path, run } = fixture(t, '@xpert-ai/plugin-other')
  const original = readFileSync(path, 'utf8')
  const result = run()
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /names must match/)
  assert.equal(readFileSync(path, 'utf8'), original)
})
