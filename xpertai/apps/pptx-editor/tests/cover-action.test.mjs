import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir, lstat } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const root = new URL('../', import.meta.url)
const sha = value => createHash('sha256').update(value).digest('hex')

test('the shipped cover Action has the exact declared immutable bundle and Runtime contract', async () => {
  const plugin = JSON.parse(await readFile(new URL('.xpertai-plugin/plugin.json', root), 'utf8'))
  assert.equal(plugin.name, '@xpert-ai/plugin-pptx-editor')
  const actionUrl = new URL(plugin.sandboxActions, root)
  const action = JSON.parse(await readFile(actionUrl, 'utf8'))
  assert.equal(action.name, 'pptx.cover')
  assert.equal(action.version, '1.0.0')
  assert.equal(action.runtimeProfile, 'browser/playwright-1.61/v1')
  assert.equal(action.runtimeContractVersion, '1')
  assert.equal(action.playwrightVersion, '1.61.0')
  assert.equal(action.entrypoint, 'runner.mjs')
  const bundle = new URL(action.bundle + '/', actionUrl)
  assert.deepEqual(await readdir(bundle), ['runner.mjs'])
  const entry = new URL(action.entrypoint, bundle), info = await lstat(entry)
  assert.equal(info.isSymbolicLink(), false)
  assert.equal(info.isFile(), true)
  const bytes = await readFile(entry)
  assert.equal(action.bundleSha256, sha(`runner.mjs\0${bytes.length}\0${sha(bytes)}\n`))
})
