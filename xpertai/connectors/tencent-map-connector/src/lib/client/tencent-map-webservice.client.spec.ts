import { TencentMapWebServiceClient, decodeTencentPolyline } from './tencent-map-webservice.client.js'

describe('TencentMapWebServiceClient', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('calls the fixed geocoder endpoint and validates the returned location', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      status: 0,
      request_id: 'request-1',
      result: { location: { lat: 39.9087, lng: 116.3975 } }
    }))
    const client = new TencentMapWebServiceClient()

    await client.verifyCredential('ABCDE-FGHIJ-KLMNO-PQRST-UVWXY-12345')

    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.origin).toBe('https://apis.map.qq.com')
    expect(url.pathname).toBe('/ws/geocoder/v1/')
    expect(url.searchParams.get('address')).toBe('北京市东城区天安门广场')
    expect(url.searchParams.get('key')).toBe('ABCDE-FGHIJ-KLMNO-PQRST-UVWXY-12345')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET', redirect: 'error' })
  })

  it('rejects a successful-looking response without a status or geocoding location', async () => {
    const client = new TencentMapWebServiceClient()
    jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ result: { location: { lat: 39.9, lng: 116.4 } } }))
      .mockResolvedValueOnce(jsonResponse({ status: 0, result: {} }))

    await expect(client.call({
      apiKey: 'ABCDE-FGHIJ-KLMNO-PQRST-UVWXY-12345',
      name: 'geocoder',
      arguments: { address: '北京市东城区天安门广场' }
    })).rejects.toMatchObject({ code: 'UPSTREAM_RESPONSE_INVALID' })

    await expect(client.verifyCredential('ABCDE-FGHIJ-KLMNO-PQRST-UVWXY-12345'))
      .rejects.toMatchObject({ code: 'UPSTREAM_RESPONSE_INVALID' })
  })

  it('plans a route and converts its compressed polyline before along-route search', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({
        status: 0,
        result: { routes: [{ polyline: [39.9, 116.4, 100000, 100000] }] }
      }))
      .mockResolvedValueOnce(jsonResponse({
        status: 0,
        count: 1,
        data: [{ id: 'poi-1', title: '充电站' }]
      }))
    const client = new TencentMapWebServiceClient()

    const result = await client.call({
      apiKey: 'ABCDE-FGHIJ-KLMNO-PQRST-UVWXY-12345',
      name: 'placeAlongby',
      arguments: {
        from: '39.9,116.4',
        to: '40,116.5',
        keyword: '充电站'
      }
    })

    expect(result).toMatchObject({ status: 0, count: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const routeUrl = new URL(String(fetchMock.mock.calls[0][0]))
    const alongbyUrl = new URL(String(fetchMock.mock.calls[1][0]))
    expect(routeUrl.pathname).toBe('/ws/direction/v1/driving/')
    expect(routeUrl.searchParams.get('no_step')).toBe('1')
    expect(alongbyUrl.pathname).toBe('/ws/place/v1/alongby')
    expect(alongbyUrl.searchParams.get('polyline')).toBe('39.9,116.4,40,116.5')
  })

  it('decodes Tencent compressed route coordinates', () => {
    expect(decodeTencentPolyline([39.9, 116.4, 100000, -200000])).toEqual([
      { lat: 39.9, lng: 116.4 },
      { lat: 40, lng: 116.2 }
    ])
  })
})

function jsonResponse(value: Record<string, unknown>): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
