import { AmapConnectorError } from '../errors.js'
import {
  assertAmapSuccess,
  mapDistance,
  mapGeocode,
  mapIpLocation,
  mapPlaceSearch,
  mapRoute,
  mapTransitRoute,
  mapWeather
} from './amap-mappers.js'

describe('AMap response mappers', () => {
  it('maps geocoding data to a bounded GCJ02 DTO', () => {
    const result = mapGeocode({
      status: '1',
      infocode: '10000',
      count: '1',
      geocodes: [{
        formatted_address: '北京市东城区天安门广场', province: '北京市', city: '北京市',
        district: '东城区', adcode: '110101', location: '116.397,39.908', raw: 'hidden'
      }]
    })
    expect(result).toMatchObject({
      count: 1,
      returned: 1,
      coordinateSystem: 'GCJ02',
      items: [{ formattedAddress: '北京市东城区天安门广场', location: { lng: 116.397, lat: 39.908 } }]
    })
    expect(JSON.stringify(result)).not.toContain('hidden')
  })

  it('caps place results and strips raw provider fields', () => {
    const result = mapPlaceSearch({
      status: '1',
      infocode: '10000',
      count: '30',
      pois: Array.from({ length: 25 }, (_, index) => ({
        id: `poi-${index}`, name: `POI ${index}`, location: '116.397,39.908', photos: [{ url: 'raw' }]
      }))
    }, { page: 1, pageSize: 20 })
    expect(result).toMatchObject({ page: 1, pageSize: 20, count: 30, returned: 20, hasMore: true })
    expect(JSON.stringify(result)).not.toContain('photos')
  })

  it('maps route, transit, distance, weather, and IP envelopes without raw polylines', () => {
    const driving = mapRoute({
      status: '1', infocode: '10000', route: {
        origin: '116.397,39.908', destination: '116.407,39.918',
        paths: [{ distance: '1200', cost: { duration: '300', tolls: '0' }, steps: [{ instruction: '向东行驶', polyline: 'raw' }] }]
      }
    }, 'driving')
    expect(driving).toMatchObject({ mode: 'driving', paths: [{ distanceMeters: 1200, durationSeconds: 300 }] })
    expect(JSON.stringify(driving)).not.toContain('polyline')

    expect(mapTransitRoute({
      status: '1', infocode: '10000', route: {
        origin: '116.397,39.908', destination: '116.407,39.918',
        transits: [{ cost: { duration: '900', transit_fee: '4' }, segments: [] }]
      }
    })).toMatchObject({ plans: [{ durationSeconds: 900, priceYuan: 4 }] })

    expect(mapDistance({
      status: '1', infocode: '10000', results: [{ origin_id: '1', dest_id: '1', distance: '1200', duration: '300' }]
    }, 'driving')).toMatchObject({ mode: 'driving', items: [{ distanceMeters: 1200, durationSeconds: 300 }] })

    expect(mapWeather({
      status: '1', infocode: '10000', lives: [{ province: '北京市', city: '北京市', adcode: '110101', weather: '晴', temperature: '30' }]
    }, 'live')).toMatchObject({ mode: 'live', lives: [{ adcode: '110101', temperatureCelsius: 30 }] })

    expect(mapIpLocation({
      status: '1', infocode: '10000', province: '北京市', city: '北京市', adcode: '110000',
      rectangle: '116.0,39.0;117.0,40.0'
    })).toMatchObject({ rectangle: { southwest: { lng: 116, lat: 39 }, northeast: { lng: 117, lat: 40 } } })
  })

  it.each([
    ['10001', 'CREDENTIAL_INVALID'],
    ['10005', 'CREDENTIAL_RESTRICTED'],
    ['10002', 'PERMISSION_DENIED'],
    ['10003', 'QUOTA_EXCEEDED'],
    ['20000', 'INVALID_ARGUMENT'],
    ['20801', 'NO_RESULT'],
    ['30001', 'UPSTREAM_UNAVAILABLE']
  ])('maps infocode %s to %s', (infocode, code) => {
    try {
      assertAmapSuccess({ status: '0', infocode })
      throw new Error('Expected infocode mapping to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(AmapConnectorError)
      expect((error as AmapConnectorError).code).toBe(code)
    }
  })

  it('rejects provider responses without status and infocode', () => {
    expect(() => assertAmapSuccess({ geocodes: [] })).toThrow(
      expect.objectContaining({ code: 'UPSTREAM_RESPONSE_INVALID' })
    )
  })
})
