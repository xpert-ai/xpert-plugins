import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import plugin from '../dist/index.js'

test('declares a system Action provider consistently at install and load time', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const manifest = JSON.parse(await readFile(new URL('../.xpertai-plugin/plugin.json', import.meta.url), 'utf8'))
  assert.equal(pkg.xpert?.plugin?.level, 'system')
  assert.equal(plugin.meta.level, pkg.xpert.plugin.level)
  assert.equal(pkg.xpert.plugin.artifactNamespace, 'markitdown')
  assert.equal(plugin.meta.artifactNamespace, pkg.xpert.plugin.artifactNamespace)
  assert.equal(plugin.meta.name, pkg.name)
  assert.equal(manifest.name, pkg.name)
  assert.equal(manifest.version, pkg.version)
  const action = JSON.parse(await readFile(new URL(`../${manifest.sandboxActions}`, import.meta.url), 'utf8'))
  assert.equal(action.name, 'markitdown.convert')
  assert.equal(action.runtimeProfile, 'document/python-3.12/v1')
})
