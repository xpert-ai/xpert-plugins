import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CodeReviewPlugin } from '../src/index.js'
import type { Automation } from '../src/automation.js'

const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
test('bootstrap returns before host readiness, retries recovery and cancels retry on unload', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let calls = 0, ready = false
  const automation = { recover: async () => { calls++; if (!ready) throw new Error('Host identity handlers not ready') } } as Automation
  const plugin = new CodeReviewPlugin(automation)
  plugin.onPluginBootstrap(); plugin.onApplicationBootstrap()
  assert.equal(calls, 0)
  t.mock.timers.tick(1); await flush()
  assert.equal(calls, 1)
  ready = true
  t.mock.timers.tick(5000); await flush()
  assert.equal(calls, 2)
  t.mock.timers.tick(10000); await flush()
  assert.equal(calls, 2, 'successful recovery returns supervision to the managed queue')
  ready = false; plugin.onApplicationBootstrap()
  t.mock.timers.tick(1); await flush()
  plugin.onPluginDestroy()
  t.mock.timers.tick(10000); await flush()
  assert.equal(calls, 3, 'unloaded plugins do not restart recovery')
})

test('an identity denied during early bootstrap is checked again after the host becomes ready', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let calls = 0
  const plugin = new CodeReviewPlugin({ recover: async () => ++calls > 1 } as Automation)
  plugin.onApplicationBootstrap()
  t.mock.timers.tick(1); await flush()
  assert.equal(calls, 1)
  t.mock.timers.tick(5000); await flush()
  assert.equal(calls, 2)
  plugin.onPluginDestroy()
})
