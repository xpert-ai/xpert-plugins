import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { AmapMapProvider, TencentMapProvider, decodeTencentPolyline, MapHttpClient, signParameters } from '../dist/lib/providers/index.js'
import { DemoMapProvider } from '../dist/lib/mock-provider.js'
import { mapSearchInputSchema, mapResultSchema, mapViewportInputSchema } from '../dist/lib/contracts.js'

const credential = { apiKey: 'test-key-never-expose', privateKey: 'test-signing-secret' }
const searchInput = mapSearchInputSchema.parse({ query: '咖啡 & 茶', city: '北京' })
const routeInput = { origin: { lng: 116.4, lat: 39.9 }, destination: { lng: 116.402, lat: 39.902 }, travelMode: 'walking' }
const viewport = { center: routeInput.origin, zoom: 14, width: 640, height: 420 }
const json = (data) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
const amapPoi = { id: 'B123', name: '咖啡馆', location: '116.400000,39.900000', address: '示例路', pname: '北京市', cityname: [], adname: '东城区', type: '餐饮服务', distance: '15', business: { tel: '010-00000000' }, secret: 'do-not-forward' }
const tencentPoi = { id: '123', title: '咖啡馆', location: routeInput.origin, address: '示例路', category: '咖啡馆', tel: '010-00000000', _distance: 15, secret: 'do-not-forward' }
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=', 'base64')

test('AMap query uses fixed HTTPS endpoint, URL encoding, signature, limits and sanitized DTOs', async () => {
  let requested
  const adapter = new AmapMapProvider({ fetch: async (url, options) => {
    requested = new URL(url)
    assert.equal(options.redirect, 'error')
    assert.equal(options.method, 'GET')
    return json({ status: '1', count: '11', pois: [amapPoi], request_id: 'private' })
  } })
  const result = await adapter.search(searchInput, credential)
  assert.equal(requested.origin, 'https://restapi.amap.com')
  assert.equal(requested.pathname, '/v5/place/text')
  assert.equal(requested.searchParams.get('keywords'), '咖啡 & 茶')
  assert.equal(requested.searchParams.get('page_size'), '10')
  assert.equal(requested.searchParams.get('sig'), signParameters('amap', requested.pathname, Object.fromEntries(requested.searchParams), credential.privateKey))
  assert.equal(result.hasMore, true)
  assert.equal(result.places[0].distanceMeters, 15)
  assert.equal(result.places[0].location.lng, 116.4)
  assert.equal(result.places[0].secret, undefined)
  assert.equal(JSON.stringify(result).includes(credential.apiKey), false)
  assert.equal(JSON.stringify(result).includes('private'), false)
  assert.equal(mapResultSchema.safeParse(result).success, true)
})

test('AMap nearby and detail select documented endpoints', async () => {
  const urls = []
  const adapter = new AmapMapProvider({ fetch: async (url) => { urls.push(new URL(url)); return json({ status: '1', count: '1', pois: [amapPoi] }) } })
  await adapter.search(mapSearchInputSchema.parse({ query: '咖啡', center: routeInput.origin }), credential)
  assert.equal(urls[0].pathname, '/v5/place/around')
  assert.equal(urls[0].searchParams.get('location'), '116.400000,39.900000')
  const result = await adapter.detail({ id: 'B123' }, credential)
  assert.equal(urls[1].pathname, '/v5/place/detail')
  assert.equal(result.place.phone, '010-00000000')
})

test('AMap routes retain supplier step geometry and durations, never fabricate missing geometry', async () => {
  let requested
  const adapter = new AmapMapProvider({ fetch: async (url) => {
    requested = new URL(url)
    return json({ status: '1', route: { paths: [{ distance: '350', cost: { duration: '280' }, steps: [
      { instruction: '向东', polyline: '116.4,39.9;116.401,39.9' },
      { instruction: '向北', polyline: '116.401,39.9;116.402,39.902' }
    ] }] } })
  } })
  const result = await adapter.route(routeInput, credential)
  assert.equal(requested.searchParams.get('show_fields'), 'cost,polyline')
  assert.deepEqual(result.path, [routeInput.origin, { lng: 116.401, lat: 39.9 }, routeInput.destination])
  assert.equal(result.durationSeconds, 280)
  const broken = new AmapMapProvider({ fetch: async () => json({ status: '1', route: { paths: [{ distance: '350', cost: { duration: '280' }, steps: [{ instruction: '向东' }] }] } }) })
  await assert.rejects(() => broken.route(routeInput, credential), { code: 'RESPONSE_INVALID' })
})

test('Tencent search/detail use documented data array and lat,lng parameter order', async () => {
  const urls = []
  const adapter = new TencentMapProvider({ fetch: async (url) => { urls.push(new URL(url)); return json({ status: 0, count: 1, data: [tencentPoi] }) } })
  const result = await adapter.search(searchInput, credential)
  assert.equal(urls[0].origin, 'https://apis.map.qq.com')
  assert.equal(urls[0].searchParams.get('boundary'), 'region(北京,0)')
  assert.equal(result.places[0].name, '咖啡馆')
  assert.equal(result.places[0].secret, undefined)
  await adapter.search(mapSearchInputSchema.parse({ query: '咖啡', center: routeInput.origin }), credential)
  assert.equal(urls[1].searchParams.get('boundary'), 'nearby(39.900000,116.400000,1000,0)')
  const detail = await adapter.detail({ id: '123' }, credential)
  assert.equal(detail.kind, 'place')
  assert.equal(detail.place.id, '123')
})

test('Tencent compressed geometry decodes deltas and minutes convert to seconds', async () => {
  const encoded = [39.9, 116.4, 0, 1000, 2000, 1000]
  const adapter = new TencentMapProvider({ fetch: async () => json({ status: 0, result: { routes: [{ distance: 350, duration: 4.5, polyline: encoded, steps: [{ instruction: '向东' }] }] } }) })
  const result = await adapter.route(routeInput, credential)
  assert.equal(result.durationSeconds, 270)
  assert.equal(result.path.length, 3)
  assert.ok(Math.abs(result.path[2].lng - 116.402) < 1e-8)
  assert.ok(Math.abs(result.path[2].lat - 39.902) < 1e-8)
  assert.deepEqual(encoded, [39.9, 116.4, 0, 1000, 2000, 1000])
  assert.throws(() => decodeTencentPolyline([39.9, 116.4, 20]), { code: 'RESPONSE_INVALID' })
  assert.throws(() => decodeTencentPolyline([39.9, 116.4, Infinity, 0]), { code: 'RESPONSE_INVALID' })
})

test('Provider signing matches canonical strings for both documented algorithms', () => {
  const params = { key: 'test', keyword: '咖啡', boundary: 'region(北京,0)' }
  const canonical = 'boundary=region(北京,0)&key=test&keyword=咖啡'
  assert.equal(signParameters('amap', '/unused', params, 'secret'), createHash('md5').update(canonical + 'secret').digest('hex'))
  assert.equal(signParameters('tencent', '/ws/place/v1/search', params, 'secret'), createHash('md5').update('/ws/place/v1/search?' + canonical + 'secret').digest('hex'))
})

test('Static images are bounded data URLs, preserve viewport, and never expose key URLs', async () => {
  for (const Adapter of [AmapMapProvider, TencentMapProvider]) {
    let requested
    const adapter = new Adapter({ fetch: async (url) => { requested = new URL(url); return new Response(png, { headers: { 'content-type': 'image/png' } }) } })
    const result = await adapter.render(viewport, credential)
    assert.equal(result.width, viewport.width)
    assert.equal(result.height, viewport.height)
    assert.equal(result.imageDataUrl, `data:image/png;base64,${png.toString('base64')}`)
    assert.equal(requested.searchParams.get('scale'), '1')
    assert.equal(JSON.stringify(result).includes(credential.apiKey), false)
    assert.equal(mapResultSchema.safeParse(result).success, true)
  }
})

test('Reject fake image MIME/signatures, oversize streams, unknown paths and out-of-region rendering', async () => {
  const fake = new AmapMapProvider({ fetch: async () => new Response('<svg>unsafe</svg>', { headers: { 'content-type': 'image/png' } }) })
  await assert.rejects(() => fake.render(viewport, credential), { code: 'RESPONSE_INVALID' })
  const wrongMime = new AmapMapProvider({ fetch: async () => new Response(png, { headers: { 'content-type': 'text/html' } }) })
  await assert.rejects(() => wrongMime.render(viewport, credential), { code: 'RESPONSE_INVALID' })
  const big = new AmapMapProvider({ fetch: async () => new Response(new Uint8Array(1500001), { headers: { 'content-type': 'image/png' } }) })
  await assert.rejects(() => big.render(viewport, credential), { code: 'RESPONSE_TOO_LARGE' })
  await assert.rejects(() => new MapHttpClient().json('amap', 'https://evil.example/key', {}, credential), { code: 'REQUEST_FAILED' })
  await assert.rejects(() => new TencentMapProvider().render({ ...viewport, center: { lng: -73, lat: 40 } }, credential), { code: 'REGION_UNSUPPORTED' })
})

test('Network errors and provider error bodies never disclose keys or raw upstream text', async () => {
  const failing = new AmapMapProvider({ fetch: async () => { throw new Error('fetch https://secret/?key=' + credential.apiKey) } })
  await assert.rejects(() => failing.search(searchInput, credential), (error) => error.code === 'REQUEST_FAILED' && !error.message.includes(credential.apiKey) && !error.message.includes('https:'))
  const rejected = new AmapMapProvider({ fetch: async () => json({ status: '0', infocode: '10001', info: credential.apiKey }) })
  await assert.rejects(() => rejected.search(searchInput, credential), (error) => error.code === 'CREDENTIAL_INVALID' && !error.message.includes(credential.apiKey))
  const rateLimit = new TencentMapProvider({ fetch: async () => new Response('secret', { status: 429 }) })
  await assert.rejects(() => rateLimit.search(searchInput, credential), { code: 'QUOTA_EXCEEDED' })
})

test('Cancellation and timeout abort the request without exposing fetch errors', async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(() => new AmapMapProvider().search(searchInput, credential, controller.signal), { code: 'CANCELLED' })
  const adapter = new AmapMapProvider({ timeoutMs: 5, fetch: async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('private abort details')), { once: true })) })
  await assert.rejects(() => adapter.search(searchInput, credential), { code: 'TIMEOUT' })
})

test('Schemas reject extra fields, unreasonable viewports and injected Tencent boundaries', () => {
  assert.equal(mapSearchInputSchema.safeParse({ query: '咖啡' }).success, false)
  assert.equal(mapSearchInputSchema.safeParse({ query: '咖啡', city: '北京,0)|nearby(0,0)' }).success, false)
  assert.equal(mapSearchInputSchema.safeParse({ query: '咖啡', city: '北京', provider: 'tencent' }).success, false)
  assert.equal(mapViewportInputSchema.safeParse({ ...viewport, zoom: 18 }).success, false)
  assert.equal(mapViewportInputSchema.safeParse({ ...viewport, width: 100000 }).success, false)
})

test('Demo fixtures are explicit synthetic results and do not make network requests', async () => {
  const demo = new DemoMapProvider('tencent')
  const result = await demo.search(searchInput)
  assert.equal(result.mode, 'demo')
  assert.equal(result.provider, 'tencent')
  assert.match(result.attribution, /虚构/)
  assert.equal(result.places.length, 6)
  assert.equal((await demo.search({ ...searchInput, query: '不存在的地点' })).places.length, 0)
  const detail = await demo.detail({ id: 'demo-1' })
  assert.match(detail.place.address, /虚构地点/)
  const route = await demo.route(routeInput)
  assert.match(route.title, /非导航/)
  const image = await demo.render(viewport)
  assert.match(image.imageDataUrl, /^data:image\/svg\+xml;base64,/)
  assert.equal(mapResultSchema.safeParse(image).success, true)
  assert.equal(mapResultSchema.safeParse({ ...image, mode: 'live' }).success, false)
  await assert.rejects(() => demo.detail({ id: 'missing' }), { code: 'NO_RESULT' })
})


test('Tencent enforces documented radius, keyword byte and pagination limits before calling upstream', async () => {
  const adapter = new TencentMapProvider({ fetch: async () => { throw new Error('Must not call fetch') } })
  for (const input of [
    { query: '咖啡', center: routeInput.origin, radiusMeters: 1001 },
    { query: '咖'.repeat(33), city: '北京' },
    { query: '咖啡', city: '北京', page: 11, pageSize: 20 }
  ]) await assert.rejects(() => adapter.search(mapSearchInputSchema.parse(input), credential), { code: 'INVALID_ARGUMENT' })
  const paged = new TencentMapProvider({ fetch: async () => json({ status: 0, count: 2000, data: [tencentPoi] }) })
  const result = await paged.search(mapSearchInputSchema.parse({ query: '咖啡', city: '北京', page: 10, pageSize: 20 }), credential)
  assert.equal(result.hasMore, false)
})
