import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { parse } from 'yaml'
import * as strategies from './dist/provider.strategy.js'

const anthropic = Boolean(strategies.AnthropicProviderStrategy)
const Strategy = anthropic ? strategies.AnthropicProviderStrategy : strategies.OpenAIProviderStrategy
const protocol = anthropic ? 'anthropic_messages' : 'openai_responses'
const catalog = readdirSync('./dist/llm').filter((name) => name.endsWith('.yaml'))
  .map((name) => parse(readFileSync(`./dist/llm/${name}`, 'utf8'))).filter((entry) => entry?.model_type === 'llm')
const model = catalog.find((entry) => entry.native_protocols?.includes(protocol))
assert.ok(model, 'built catalog must explicitly declare the native protocol')

function setup() {
  const provider = new Strategy()
  const priced = []
  provider.registerAIModelInstance('llm', {
    predefinedModels: () => catalog,
    priceActualTokenUsage: (...args) => { priced.push(args); return { pricingStatus: 'unpriced' } }
  })
  const credentials = anthropic ? { anthropic_api_key: 'server-fixture', anthropic_api_url: 'https://provider.test/v1/' } :
    { api_key: 'server-fixture', endpoint_url: 'https://provider.test/v1' }
  const selection = { model: model.model, modelType: 'llm', copilot: { modelProvider: { credentials } } }
  return { provider, selection, priced }
}

test('pins the server transport and passes canonical usage to catalog pricing', async () => {
  const { provider, selection, priced } = setup()
  const client = await provider.getNativeModelClient(protocol, selection)
  const prior = globalThis.fetch
  let attempts = 0
  globalThis.fetch = async (url, init) => {
    attempts++
    assert.equal(url, `https://provider.test/v1/${anthropic ? 'messages' : 'responses'}`)
    assert.equal(init.headers.get(anthropic ? 'x-api-key' : 'authorization'), anthropic ? 'server-fixture' : 'Bearer server-fixture')
    assert.equal(init.redirect, 'error')
    if (anthropic) assert.equal(init.headers.get('anthropic-beta'), 'test-feature')
    return new Response('{}')
  }
  try {
    await client.generate({ model: model.model }, { authorization: 'untrusted', 'x-api-key': 'untrusted', 'anthropic-beta': 'test-feature' }, new AbortController().signal)
    assert.equal(attempts, 1)
    const usage = { promptTokens: 10, completionTokens: 2, totalTokens: 12 }
    const context = { cacheWriteInputTokensByTtl: { '5m': 1 } }
    client.priceUsage(usage, context)
    assert.deepEqual(priced, [[model.model, usage, context]])
  } finally { globalThis.fetch = prior }
})

test('rejects undeclared protocol, unknown model and missing server credentials before network access', async () => {
  const { provider, selection } = setup()
  await assert.rejects(provider.getNativeModelClient(anthropic ? 'openai_responses' : 'anthropic_messages', selection))
  await assert.rejects(provider.getNativeModelClient(protocol, { ...selection, model: 'unregistered-model' }))
  await assert.rejects(provider.getNativeModelClient(protocol, { ...selection, copilot: { modelProvider: { credentials: {} } } }))
})
