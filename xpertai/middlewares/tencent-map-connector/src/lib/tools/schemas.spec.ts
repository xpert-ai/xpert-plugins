import {
  alongRouteSchema,
  matrixSchema,
  nearbySearchSchema,
  placeSearchSchema,
  weatherSchema,
  waypointOrderSchema
} from './schemas.js'

describe('Tencent Maps tool schemas', () => {
  const point = { lat: 39.9, lng: 116.4 }

  it('caps matrix work at 100 pairs', () => {
    expect(matrixSchema.safeParse({ origins: Array(11).fill(point), destinations: Array(10).fill(point), mode: 'driving' }).success).toBe(false)
    expect(matrixSchema.safeParse({ origins: Array(10).fill(point), destinations: Array(10).fill(point), mode: 'driving' }).success).toBe(true)
  })

  it('requires exactly one weather locator', () => {
    expect(weatherSchema.safeParse({ type: 'now' }).success).toBe(false)
    expect(weatherSchema.safeParse({ adcode: '110101', location: point, type: 'now' }).success).toBe(false)
    expect(weatherSchema.safeParse({ adcode: '110101', type: 'future' }).success).toBe(true)
  })

  it('caps optimized waypoints at 16', () => {
    expect(waypointOrderSchema.safeParse({ from: point, to: point, waypoints: Array(17).fill(point) }).success).toBe(false)
  })

  it('bounds place pagination and nearby radius', () => {
    expect(placeSearchSchema.parse({ keyword: '咖啡' })).toMatchObject({ page: 1, pageSize: 20 })
    expect(placeSearchSchema.safeParse({ keyword: '咖啡', page: 11 }).success).toBe(false)
    expect(nearbySearchSchema.safeParse({ keyword: '咖啡', location: point, radiusMeters: 9 }).success).toBe(false)
    expect(nearbySearchSchema.safeParse({ keyword: '咖啡', location: point, radiusMeters: 1000 }).success).toBe(true)
  })

  it('requires route endpoints instead of a provider-specific route id for along-route search', () => {
    expect(alongRouteSchema.safeParse({ from: point, to: point, keyword: '充电站' }).success).toBe(true)
    expect(alongRouteSchema.safeParse({ route_id: 'route-1', keyword: '充电站' }).success).toBe(false)
  })
})
