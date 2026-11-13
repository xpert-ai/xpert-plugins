import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getMetadataArgsStorage } from 'typeorm'
import { plugin } from '../dist/index.js'
import { ENTITIES } from '../dist/plugin.module.js'

test('packaged metadata and persistent table namespace agree', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  )
  assert.equal(plugin.meta.name, manifest.name)
  assert.equal(plugin.meta.version, manifest.version)
  assert.equal(plugin.meta.level, manifest.xpert.plugin.level)
  assert.equal(
    plugin.meta.artifactNamespace,
    manifest.xpert.plugin.artifactNamespace
  )
  const tableNames = getMetadataArgsStorage()
    .tables.filter(({ target }) => ENTITIES.includes(target))
    .map(({ name }) => name)
    .sort()
  assert.deepEqual(tableNames, [
    'plugin_reqtrace_analysis_attempt',
    'plugin_reqtrace_review'
  ])
})
