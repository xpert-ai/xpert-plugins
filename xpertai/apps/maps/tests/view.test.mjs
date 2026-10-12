import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import plugin, { MapsViewProvider, MapsMiddleware } from '../dist/index.js'
import { MAPS_VIEW_KEY, MAPS_VIEW_PROVIDER, MAPS_MIDDLEWARE, MAPS_REMOTE_ENTRY } from '../dist/lib/constants.js'
import { DefaultRuntimeCapabilityRegistry, ViewMiddlewareRuntimeCapability } from '@xpert-ai/plugin-sdk'

const context = { hostType: 'agent', hostId: 'assistant-a', tenantId: 'tenant-a', organizationId: 'org-a', userId: 'user-a', slots: [], locale: 'zh-Hans' }
function fixture(options = { mode: 'demo', provider: 'amap' }) {
  const calls = []
  let allowed = true
  const registry = new DefaultRuntimeCapabilityRegistry().register(ViewMiddlewareRuntimeCapability, {
    async resolve(request) {
      calls.push(request)
      if (!allowed) throw new Error('Access revoked')
      return { options, context: { ...context, workspaceId: 'workspace-a', node: { key: 'maps-node', provider: MAPS_MIDDLEWARE }, tools: new Map() } }
    }
  })
  return { view: new MapsViewProvider(registry), calls, revoke: () => { allowed = false } }
}

test('maps activates only on the authorized Feature and owns no duplicate host shell', () => {
  const { view } = fixture()
  const [manifest] = view.getViewManifests(context, 'agent.workbench')
  assert.equal(manifest.source.provider, MAPS_VIEW_PROVIDER)
  assert.deepEqual(manifest.activation.requiredFeatures, new MapsMiddleware().meta.features)
  assert.equal(manifest.workbench.contextScope, 'conversation')
  assert.deepEqual(manifest.clientCommands.map(command => command.key), ['assistant.composer.append_references'])
  assert.deepEqual(manifest.actions.map(action => action.key), ['maps.search', 'maps.detail', 'maps.route', 'maps.render'])
  assert.deepEqual(view.getViewManifests(context, 'agent.profile'), [])
  assert.deepEqual(view.getViewManifests({ ...context, hostType: 'project' }, 'agent.workbench'), [])
})

test('view operations re-resolve trusted Assistant options and never accept browser scope overrides', async () => {
  const { view, calls, revoke } = fixture({ mode: 'demo', provider: 'tencent', connectorId: 'server-only-binding' })
  const initial = await view.getViewData(context, MAPS_VIEW_KEY, {})
  assert.deepEqual(initial.item, { kind: 'maps-view', provider: 'tencent', mode: 'demo' })
  const result = await view.executeViewAction(context, MAPS_VIEW_KEY, 'maps.search', { input: { query: '咖啡', city: '杭州' } })
  assert.equal(result.success, true)
  assert.equal(result.data.provider, 'tencent')
  assert.equal(result.data.mode, 'demo')
  const rejected = await view.executeViewAction(context, MAPS_VIEW_KEY, 'maps.search', { input: { query: '咖啡', city: '杭州', mode: 'live', connectorId: 'attacker' } })
  assert.deepEqual(rejected, { success: false, data: { code: 'INVALID_ARGUMENT' } })
  assert.equal(calls.length, 3)
  for (const call of calls) assert.deepEqual(call, { context, provider: MAPS_MIDDLEWARE, requiredFeature: MAPS_MIDDLEWARE })
  assert.doesNotMatch(JSON.stringify({ initial, result, rejected }), /server-only-binding|workspace-a|user-a|apiKey/)
  revoke()
  await assert.rejects(view.executeViewAction(context, MAPS_VIEW_KEY, 'maps.detail', { input: { id: 'demo-1' } }), /Access revoked/)
  await assert.rejects(view.getRemoteComponentEntry(context, MAPS_VIEW_KEY, { entry: MAPS_REMOTE_ENTRY, isolation: 'iframe' }), /Access revoked/)
})

test('strict scalar navigation queries and every action use the same domain schemas', async () => {
  const { view } = fixture()
  const query = { parameters: { operation: 'search', inputJson: JSON.stringify({ query: '咖啡', city: '杭州' }) } }
  const result = await view.getViewData(context, MAPS_VIEW_KEY, query)
  assert.equal(result.item.result.kind, 'places')
  assert.equal(result.item.search.city, '杭州')
  const detail = await view.executeViewAction(context, MAPS_VIEW_KEY, 'maps.detail', { input: { id: result.item.result.places[0].id } })
  assert.equal(detail.data.kind, 'place')
  assert.deepEqual(await view.executeViewAction(context, MAPS_VIEW_KEY, 'maps.delete', {}), { success: false, data: { code: 'INVALID_ARGUMENT' } })
  await assert.rejects(view.getViewData(context, MAPS_VIEW_KEY, { parameters: { operation: 'search' } }))
  await assert.rejects(view.getViewData(context, MAPS_VIEW_KEY, { parameters: { operation: ['search'], inputJson: '{}' } }))
  await assert.rejects(view.getViewData(context, MAPS_VIEW_KEY, { parameters: { mode: 'demo' } }))
  await assert.rejects(view.getViewData(context, 'wrong-view', {}))
})

test('unconfigured live view returns a bounded error and never falls back to demo', async () => {
  const { view } = fixture({ mode: 'live' })
  assert.deepEqual(await view.executeViewAction(context, MAPS_VIEW_KEY, 'maps.search', { input: { query: '咖啡', city: '杭州' } }), { success: false, data: { code: 'CONNECTOR_REQUIRED' } })
  await assert.rejects(new MapsViewProvider().getViewData(context, MAPS_VIEW_KEY, {}), { code: 'HOST_RUNTIME_UNAVAILABLE' })
})

test('packaged remote entry is self-contained and validates its declared isolation', async () => {
  const { view } = fixture()
  const entry = await view.getRemoteComponentEntry(context, MAPS_VIEW_KEY, { entry: MAPS_REMOTE_ENTRY, isolation: 'iframe' })
  assert.equal(entry.contentType, 'text/html; charset=utf-8')
  assert.match(entry.html, /maps-plugin/)
  assert.match(entry.html, /xpertai.remote_component/)
  assert.doesNotMatch(entry.html, /<script[^>]+src=/)
  await assert.rejects(view.getRemoteComponentEntry(context, MAPS_VIEW_KEY, { entry: '../other', isolation: 'iframe' }))
})

test('separate live and explicit demo templates contain connected Maps middleware', () => {
  assert.equal(plugin.templates.length, 2)
  for (const template of plugin.templates) {
    const dsl = JSON.parse(template.dslContent)
    const middleware = dsl.nodes.find(node => node.entity.provider === MAPS_MIDDLEWARE)
    assert.ok(dsl.connections.some(edge => edge.from === dsl.team.agent.key && edge.to === middleware.key))
    assert.equal(middleware.entity.options.provider, 'amap')
    assert.equal(middleware.entity.options.mode, template.key.includes('demo') ? 'demo' : 'live')
    assert.deepEqual(template.dependencies.plugins, [plugin.meta.name])
    assert.doesNotMatch(template.dslContent, /apiKey|connectorId/)
  }
})
