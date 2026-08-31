import {
  distanceSchema,
  drivingRouteSchema,
  ipLocationSchema,
  nearbySearchSchema,
  placeSearchSchema,
  transitRouteSchema,
  weatherSchema
} from './schemas.js'

describe('AMap tool schemas', () => {
  const point = { lng: 116.397, lat: 39.908 }

  it('requires a place selector and caps provider pagination at 200 results', () => {
    expect(placeSearchSchema.safeParse({}).success).toBe(false)
    expect(placeSearchSchema.parse({ keywords: '咖啡' })).toMatchObject({ page: 1, pageSize: 10, cityLimit: false })
    expect(placeSearchSchema.safeParse({ keywords: '咖啡', page: 10, pageSize: 20 }).success).toBe(true)
    expect(placeSearchSchema.safeParse({ keywords: '咖啡', page: 10, pageSize: 21 }).success).toBe(false)
    expect(nearbySearchSchema.safeParse({ types: ['050100'], location: point, radiusMeters: 50_001 }).success).toBe(false)
  })

  it('caps route waypoints and requires paired transit POI IDs', () => {
    const uniqueWaypoints = Array.from({ length: 17 }, (_, index) => ({ lng: 116 + index / 100, lat: 39.9 }))
    expect(drivingRouteSchema.safeParse({ origin: point, destination: point, waypoints: uniqueWaypoints }).success).toBe(false)
    expect(transitRouteSchema.safeParse({
      origin: point,
      destination: point,
      originCityCode: '010',
      destinationCityCode: '021',
      originPoiId: 'poi-1'
    }).success).toBe(false)
    expect(transitRouteSchema.safeParse({
      origin: point,
      destination: point,
      originCityCode: '010',
      destinationCityCode: '021',
      strategy: 'subway_map'
    }).success).toBe(false)
  })

  it('caps distance origins and accepts only public IPv4 input', () => {
    expect(distanceSchema.safeParse({ origins: Array(101).fill(point), destination: point }).success).toBe(false)
    expect(ipLocationSchema.safeParse({ ip: '8.8.8.8' }).success).toBe(true)
    expect(ipLocationSchema.safeParse({ ip: '192.168.1.1' }).success).toBe(false)
    expect(ipLocationSchema.safeParse({ ip: '2001:4860:4860::8888' }).success).toBe(false)
  })

  it('requires a six-digit adcode for weather', () => {
    expect(weatherSchema.parse({ adcode: '110101' })).toEqual({ adcode: '110101', mode: 'live' })
    expect(weatherSchema.safeParse({ adcode: '010' }).success).toBe(false)
  })
})
