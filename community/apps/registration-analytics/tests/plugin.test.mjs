import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const plugin = require('../index.cjs')

test('registration analytics plugin metadata is well-formed', () => {
  assert.equal(typeof plugin, 'object')
  assert.ok(plugin.meta.name.startsWith('@community/'))
  assert.ok(plugin.meta.version)
  assert.equal(plugin.meta.level, 'organization')
  const meta = plugin.meta.targetAppMeta['data-xpert']
  assert.ok(meta.types.includes('business-app'))
  assert.ok(meta.types.includes('workbench-view'))
  assert.ok(meta.types.includes('assistant-tool'))
  assert.ok(Array.isArray(meta.marketplace.contents))
  assert.ok(meta.runtime.middlewareProviders.length > 0)
  assert.ok(meta.runtime.viewProviders.length > 0)
  assert.ok(meta.runtime.templateProviders.length > 0)
  assert.equal(typeof plugin.register, 'function')
})

test('plugin templates include registration assistant DSL', () => {
  assert.ok(Array.isArray(plugin.templates))
  const template = plugin.templates.find((t) => t.key === 'registration-analytics-assistant')
  assert.ok(template)
  assert.ok(template.dslContent.length > 0)
  assert.ok(template.startPrompts.length >= 5)
})

test('plugin config exposes seedDemoData default', () => {
  assert.equal(plugin.config.defaults.seedDemoData, true)
  assert.equal(plugin.config.defaults.enabled, true)
})

test('assistant DSL declares query workflow guidance', () => {
  const template = plugin.templates.find((t) => t.key === 'registration-analytics-assistant')
  const dsl = template.dslContent
  assert.ok(dsl.includes('registration_query'))
  assert.ok(dsl.includes('registration_list_activities'))
  assert.ok(dsl.includes('registration_save_query'))
})
