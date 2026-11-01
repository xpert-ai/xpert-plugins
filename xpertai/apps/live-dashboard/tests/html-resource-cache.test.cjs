const { test } = require('node:test')
const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const modulePromise = import(pathToFileURL(path.join(__dirname, '../sandbox-actions/resource-cache.mjs')).href)

function exchange(options = {}) {
  const request = { method: () => options.method ?? 'GET', resourceType: () => options.type ?? 'script',
    url: () => 'https://cdn.jsdelivr.net/npm/echarts@5.6.0/dist/echarts.min.js' }
  const calls = []
  return {
    calls, page: { evaluate: async () => options.allowed !== false },
    route: { request: () => request, continue: async () => calls.push('network'),
      fulfill: async response => calls.push(response), abort: async reason => calls.push(reason) },
    response: { request: () => request, status: () => options.status ?? 200,
      headers: () => options.headers ?? {},
      body: async () => { if (options.bodyFailure) throw Error('connection closed'); return Buffer.from('verified bytes') } }
  }
}

test('resource replay preserves bytes and CORS but removes wire compression headers, scoped to one validation', async () => {
  const { createResourceCache } = await modulePromise
  const cache = createResourceCache()
  const first = exchange({ headers: { 'access-control-allow-origin': '*', 'content-type': 'text/javascript',
    'content-encoding': 'gzip', 'content-length': '10', 'transfer-encoding': 'chunked' } })
  await cache.route(first.page, first.route)
  cache.capture(first.response)
  await cache.settle()
  const second = exchange()
  await cache.route(second.page, second.route)
  assert.deepEqual(first.calls, ['network'])
  assert.deepEqual(second.calls, [{ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'text/javascript' },
    body: Buffer.from('verified bytes') }])
  const otherRun = exchange()
  await createResourceCache().route(otherRun.page, otherRun.route)
  assert.deepEqual(otherRun.calls, ['network'])
})

test('a cached URL never bypasses the current resource policy or method check', async () => {
  const { createResourceCache } = await modulePromise
  const cache = createResourceCache(), first = exchange()
  await cache.route(first.page, first.route); cache.capture(first.response); await cache.settle()
  for (const options of [{ allowed: false }, { method: 'POST' }, { type: 'fetch', allowed: false }]) {
    const denied = exchange(options)
    await cache.route(denied.page, denied.route)
    assert.deepEqual(denied.calls, ['blockedbyclient'])
  }
})

test('unapproved, failed, redirected and non-cacheable responses are not replayed', async () => {
  const { createResourceCache } = await modulePromise
  for (const options of [{ allowed: false }, { status: 302 }, { status: 500 }, { bodyFailure: true },
    { headers: { 'cache-control': 'private, no-store' } }, { headers: { 'set-cookie': 'session=fixture' } },
    { headers: { vary: '*' } }, { headers: { 'content-length': String(9 * 1024 * 1024) } }]) {
    const cache = createResourceCache(), first = exchange(options)
    await cache.route(first.page, first.route); cache.capture(first.response); await cache.settle()
    const next = exchange()
    await cache.route(next.page, next.route)
    assert.deepEqual(next.calls, ['network'], JSON.stringify(options))
  }
})
