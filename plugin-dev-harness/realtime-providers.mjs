// Dist-first model discovery and credential-boundary smoke test. No network calls.
import 'reflect-metadata'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
async function load(root, file, exported) {
  return (await import(pathToFileURL(resolve(root, 'dist', file))))[exported]
}
for (const fixture of [
  { root: 'xpertai/models/tongyi', plugin: '@xpert-ai/plugin-tongyi', providerFile: 'provider.strategy.js', providerExport: 'TongyiProviderStrategy',
    modelFile: 'realtime/model.js', modelExport: 'TongyiRealtimeModel', model: 'qwen3.8-omni-flash-realtime',
    credentials: { dashscope_api_key: 'test-only', api_host: 'test-workspace.cn-beijing.maas.aliyuncs.com' },
    host: 'test-workspace.cn-beijing.maas.aliyuncs.com', voice: 'Tina' },
  { root: 'xpertai/models/volcengine', plugin: '@xpert-ai/plugin-volcengine', providerFile: 'speech/provider.strategy.js', providerExport: 'VolcengineSpeechProvider',
    modelFile: 'speech/realtime/model.js', modelExport: 'DoubaoRealtimeModel', model: '1.2.6.1',
    credentials: { speech_api_key: 'test-only' }, host: 'openspeech.bytedance.com', voice: 'zh_female_vv_uranus_bigtts' }
]) {
  assert.equal(JSON.parse(await readFile(resolve(fixture.root, 'package.json'), 'utf8')).name, fixture.plugin)
  const Provider = await load(fixture.root, fixture.providerFile, fixture.providerExport)
  const Model = await load(fixture.root, fixture.modelFile, fixture.modelExport)
  const provider = new Provider()
  const model = new Model(provider)
  await model.validateCredentials(fixture.model, fixture.credentials)
  await assert.rejects(() => model.validateCredentials(fixture.model, {}))
  assert.ok(provider.getProviderSchema().supported_model_types.includes('realtime'))
  const metadata = provider.getProviderModels('realtime').find(({ model }) => model === fixture.model)
  assert.ok(metadata.realtime.voices.some(({ id }) => id === fixture.voice))
  const connection = model.getRealtimeModel({ model: fixture.model, copilot: { modelProvider: { credentials: fixture.credentials } } })
  assert.equal(new URL(connection.url).hostname, fixture.host)
  assert.equal(new URL(connection.url).protocol, 'wss:')
  if (fixture.plugin === '@xpert-ai/plugin-tongyi') {
    for (const api_host of [undefined, 'dashscope.aliyuncs.com', 'http://test-workspace.cn-beijing.maas.aliyuncs.com']) {
      const credentials = { ...fixture.credentials, api_host }
      await assert.rejects(() => model.validateCredentials(fixture.model, credentials))
      assert.throws(() => model.getRealtimeModel({ model: fixture.model, copilot: { modelProvider: { credentials } } }))
    }
    const credentials = { ...fixture.credentials, api_host: 'https://test-workspace.ap-southeast-1.maas.aliyuncs.com/' }
    await model.validateCredentials(fixture.model, credentials)
    assert.equal(model.getRealtimeModel({ model: fixture.model, copilot: { modelProvider: { credentials } } }).url,
      `wss://test-workspace.ap-southeast-1.maas.aliyuncs.com/api-ws/v1/realtime?model=${fixture.model}`)
    assert.equal(connection.headers.Authorization, 'Bearer test-only')
  }
  assert.throws(() => model.getRealtimeModel({ model: 'unlisted-model', copilot: { modelProvider: { credentials: fixture.credentials } } }))
  assert.throws(() => model.getRealtimeModel({ model: fixture.model, copilot: { modelProvider: { credentials: {} } } }))
  console.log(`${fixture.plugin}: packaged realtime metadata and credential boundary passed`)
}
