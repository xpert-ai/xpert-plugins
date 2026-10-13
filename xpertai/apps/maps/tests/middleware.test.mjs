import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import plugin, { MapsMiddleware, mapsOptionsSchema, mapsApp } from '../dist/index.js'

const scope = (user = 'user-a', runtime) => ({
  tenantId: 'tenant-a', organizationId: 'org-a', userId: user, workspaceId: 'workspace-a',
  node: { key: 'maps-node', provider: 'maps:explorer' }, tools: new Map(), runtime
})
function tool(middleware, name) {
  const found = middleware.tools.find(item => item.name === name)
  assert.ok(found, name)
  return found
}

test('package metadata and App exposure match organization-scoped middleware', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(plugin.meta.name, pkg.name)
  assert.equal(plugin.meta.version, pkg.version)
  assert.equal(plugin.meta.level, pkg.xpert.plugin.level)
  assert.equal(plugin.meta.artifactNamespace, pkg.xpert.plugin.artifactNamespace)
  assert.throws(() => plugin.config.schema.parse({ apiKey: 'must-not-store-keys-here' }))
  const middleware = new MapsMiddleware().createMiddleware({ mode: 'demo' }, scope())
  assert.equal(middleware.apps.definitions[0].key, mapsApp.key)
  assert.deepEqual(middleware.apps.tools.maps_render.visibility, ['app'])
  for (const name of ['maps_search_view', 'maps_detail_view', 'maps_route_view']) assert.deepEqual(middleware.apps.tools[name].visibility, ['app'])
  for (const name of ['maps_search', 'maps_detail', 'maps_route']) {
    assert.deepEqual(middleware.apps.tools[name].visibility, ['model', 'app'])
    assert.equal(middleware.apps.tools[name].resourceKey, mapsApp.key)
  }
  assert.deepEqual(mapsApp.csp, { connectDomains: [], resourceDomains: [] })
  assert.equal(mapsOptionsSchema.parse({}).provider, 'amap')
  assert.equal(mapsOptionsSchema.parse({}).mode, 'live')
  assert.throws(() => mapsOptionsSchema.parse({ provider: 'unknown' }))
})

test('real LangChain App callback retains structuredContent; Agent gets a text fallback', async () => {
  const middleware = new MapsMiddleware().createMiddleware({ mode: 'demo' }, scope())
  const search = tool(middleware, 'maps_search')
  const args = { query: '咖啡', city: '北京' }
  const callback = await tool(middleware, 'maps_search_view').invoke(args)
  assert.equal(callback.structuredContent.kind, 'places')
  assert.equal(callback.structuredContent.mode, 'demo')
  assert.match(callback.content[0].text, /DEMO/)
  const message = await search.invoke({ type: 'tool_call', id: 'call-demo', name: 'maps_search', args })
  assert.equal(message.tool_call_id, 'call-demo')
  assert.match(JSON.stringify(message.content), /模拟|DEMO/)
  assert.equal(message.artifact.structuredContent.kind, 'places')
  for (const place of message.artifact.structuredContent.places) assert.ok(message.content.includes(`[${place.id}]`), 'Agent must receive exact IDs for follow-up detail tools')
  assert.ok(message.content.length < 2000)
  assert.doesNotMatch(message.content, /structuredContent/)
  const routeArgs = { origin: { lng: 116.39, lat: 39.90 }, destination: { lng: 116.40, lat: 39.91 } }
  const routeMessage = await tool(middleware, 'maps_route').invoke({ type: 'tool_call', id: 'call-route', name: 'maps_route', args: routeArgs })
  assert.equal(routeMessage.artifact.structuredContent.kind, 'route')
  assert.ok(routeMessage.artifact.structuredContent.path.length >= 2)
  assert.ok(routeMessage.content.length < 1000)
  assert.doesNotMatch(routeMessage.content, /"path"|"lng"|"lat"/)
  const routeCallback = await tool(middleware, 'maps_route_view').invoke(routeArgs)
  assert.deepEqual(routeCallback.structuredContent.path, routeMessage.artifact.structuredContent.path)
  assert.doesNotMatch(JSON.stringify(callback), /demo-not-a-credential/)
  await assert.rejects(search.invoke({ query: 'coffee' }))
  await assert.rejects(search.invoke({ query: 'coffee', city: '北京', provider: 'tencent' }))
})

test('live mode fails closed without workspace/Connector; never falls back to demo', async () => {
  const strategy = new MapsMiddleware()
  const args = { query: 'coffee', city: '北京' }
  await assert.rejects(tool(strategy.createMiddleware({}, scope()), 'maps_search').invoke(args), /MAPS_CONNECTOR_REQUIRED/)
  await assert.rejects(tool(strategy.createMiddleware({}, { ...scope(), workspaceId: undefined }), 'maps_search').invoke(args), /MAPS_SCOPE_REQUIRED/)
})

test('credentials are resolved per invocation and never cross user or provider scope', async () => {
  const previous = globalThis.fetch
  const fetchedKeys = [], resolutions = []
  globalThis.fetch = async url => {
    fetchedKeys.push(new URL(url).searchParams.get('key'))
    return new Response(JSON.stringify({ status: '1', count: '0', pois: [] }), { headers: { 'content-type': 'application/json' } })
  }
  try {
    const runtime = user => ({ capabilities: { get: () => ({ getConnectorCredential: async request => {
      resolutions.push({ user, ...request })
      return { credentials: { apiKey: `private-${user}` } }
    } }) } })
    const strategy = new MapsMiddleware()
    const a = strategy.createMiddleware({ connectorId: 'binding-a' }, scope('a', runtime('a')))
    const b = strategy.createMiddleware({ connectorId: 'binding-b' }, scope('b', runtime('b')))
    const args = { query: 'coffee', city: '北京' }
    const replies = [await tool(a, 'maps_search').invoke(args), await tool(b, 'maps_search').invoke(args), await tool(a, 'maps_search').invoke(args)]
    assert.deepEqual(fetchedKeys, ['private-a', 'private-b', 'private-a'])
    assert.deepEqual(resolutions.map(item => item.connectorId), ['binding-a', 'binding-b', 'binding-a'])
    assert.ok(resolutions.every(item => item.workspaceId === 'workspace-a' && item.provider === 'amap'))
    assert.doesNotMatch(JSON.stringify(replies), /private-a|private-b|binding-a|binding-b/)
    const tencent = strategy.createMiddleware({ provider: 'tencent', connectorId: 't-binding' }, scope('t', { capabilities: { get: () => ({ getConnectorCredential: async request => {
      assert.equal(request.provider, 'tencent-map'); assert.equal(request.connectorId, 't-binding')
      throw new Error('Connector access denied')
    } }) } }))
    await assert.rejects(tool(tencent, 'maps_search').invoke(args), /Connector access denied/)
    assert.equal(fetchedKeys.length, 3)
  } finally { globalThis.fetch = previous }
})
