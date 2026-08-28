import { AmapWebServiceClient, signAmapParameters } from './amap-webservice.client.js'

describe('AmapWebServiceClient', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('calls the fixed geocoding endpoint and verifies a mapped result', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      status: '1',
      infocode: '10000',
      count: '1',
      geocodes: [{ formatted_address: '北京市东城区天安门广场', location: '116.397,39.908' }]
    }))
    const client = new AmapWebServiceClient()

    await client.verifyCredential({ apiKey: 'amap-key-12345678' })

    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.origin).toBe('https://restapi.amap.com')
    expect(url.pathname).toBe('/v3/geocode/geo')
    expect(url.searchParams.get('address')).toBe('北京市东城区天安门广场')
    expect(url.searchParams.get('key')).toBe('amap-key-12345678')
    expect(url.searchParams.get('output')).toBe('json')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET', redirect: 'error' })
  })

  it('generates the deterministic AMap digital signature without exposing the private key', async () => {
    expect(signAmapParameters({
      address: '北京市东城区天安门广场',
      key: 'test-key-12345678',
      output: 'json'
    }, 'private-key-87654321')).toBe('741dfb29e3449300a0264ca1f379516f')

    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      status: '1', infocode: '10000', count: '1', geocodes: [{ location: '116.397,39.908' }]
    }))
    const client = new AmapWebServiceClient()
    await client.call({
      apiKey: 'test-key-12345678',
      privateKey: 'private-key-87654321',
      name: 'geocode',
      arguments: { address: '北京市东城区天安门广场' },
      maxAttempts: 1
    })

    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.searchParams.get('sig')).toMatch(/^[a-f0-9]{32}$/)
    expect(url.toString()).not.toContain('private-key-87654321')
  })

  it('uses the official transit parameter casing and endpoint', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ status: '1', infocode: '10000' }))
    const client = new AmapWebServiceClient()
    await client.call({
      apiKey: 'amap-key-12345678',
      name: 'directionTransit',
      arguments: {
        origin: '116.397,39.908', destination: '121.473,31.230', city1: '010', city2: '021',
        strategy: 0, AlternativeRoute: 5, nightflag: 0
      },
      maxAttempts: 1
    })

    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.pathname).toBe('/v5/direction/transit/integrated')
    expect(url.searchParams.get('AlternativeRoute')).toBe('5')
    expect(url.searchParams.has('alternative_route')).toBe(false)
  })

  it('falls back to form POST only for oversized driving requests', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ status: '1', infocode: '10000' }))
    const client = new AmapWebServiceClient()
    await client.call({
      apiKey: 'amap-key-12345678',
      name: 'directionDriving',
      arguments: {
        origin: '116.397,39.908', destination: '121.473,31.230', strategy: 32,
        waypoints: '116.397,39.908;'.repeat(700), alternative_route: 1
      },
      maxAttempts: 1
    })

    const [request, init] = fetchMock.mock.calls[0]
    expect(String(request)).toBe('https://restapi.amap.com/v5/direction/driving')
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' })
    expect(String(init?.body)).toContain('key=amap-key-12345678')
  })

  it('rejects malformed or unsuccessful provider envelopes with stable codes', async () => {
    const client = new AmapWebServiceClient()
    jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ geocodes: [] }))
      .mockResolvedValueOnce(jsonResponse({ status: '0', infocode: '10001', info: 'INVALID_USER_KEY' }))

    await expect(client.call({
      apiKey: 'amap-key-12345678', name: 'geocode', arguments: { address: '北京' }, maxAttempts: 1
    })).rejects.toMatchObject({ code: 'UPSTREAM_RESPONSE_INVALID' })
    await expect(client.call({
      apiKey: 'amap-key-12345678', name: 'geocode', arguments: { address: '北京' }, maxAttempts: 1
    })).rejects.toMatchObject({ code: 'CREDENTIAL_INVALID', upstreamCode: '10001' })
  })
})

function jsonResponse(value: Record<string, unknown>): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
