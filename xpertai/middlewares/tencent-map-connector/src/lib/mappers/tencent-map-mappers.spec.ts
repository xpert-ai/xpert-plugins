import { TencentMapConnectorError } from '../errors.js'
import {
  assertTencentMapSuccess,
  mapDistanceMatrix,
  mapGeocode,
  mapPlaceSearch,
  mapRoute,
  mapWeather
} from './tencent-map-mappers.js'

describe('Tencent Maps response mappers', () => {
  it('maps geocoding data to a small GCJ02 DTO', () => {
    expect(mapGeocode({
      status: 0,
      request_id: 'request-1',
      result: {
        location: { lat: 39.908, lng: 116.397 },
        address_components: { province: '北京市', city: '北京市', district: '东城区' },
        ad_info: { adcode: '110101' },
        reliability: 10,
        unsupported: { large: true }
      }
    })).toEqual({
      location: { lat: 39.908, lng: 116.397 },
      addressComponents: { province: '北京市', city: '北京市', district: '东城区' },
      adInfo: { adcode: '110101' },
      reliability: 10,
      coordinateSystem: 'GCJ02',
      requestId: 'request-1'
    })
  })

  it('rejects empty geocoding results instead of returning only a coordinate system', () => {
    expect(() => mapGeocode({ status: 0, result: {} })).toThrow(TencentMapConnectorError)
  })

  it('caps places, exposes pagination, and never returns provider internals', () => {
    const places = mapPlaceSearch({
      status: 0,
      count: 30,
      data: Array.from({ length: 20 }, (_, index) => ({
        id: `poi-${index}`,
        title: `POI ${index}`,
        polyline: 'large'
      }))
    }, { page: 1, pageSize: 20 })

    expect(places).toMatchObject({ page: 1, pageSize: 20, count: 30, returned: 20, hasMore: true })
    expect(JSON.stringify(places)).not.toContain('polyline')
  })

  it('maps routes, transit prices, and route-level waypoint order without raw polylines', () => {
    const routes = mapRoute({
      status: 0,
      result: {
        routes: [{
          route_id: 'route-1',
          distance: 1000,
          price: 450,
          polyline: [1, 2, 3],
          waypoints: [
            { input_order_idx: 2, title: '第三站', location: { lat: 39.9, lng: 116.4 } },
            { input_order_idx: 0, title: '第一站', location: { lat: 39.8, lng: 116.3 } }
          ],
          steps: [{
            mode: 'TRANSIT',
            lines: [{
              id: 'line-1',
              title: '地铁1号线',
              vehicle: 'SUBWAY',
              station_count: 4,
              price: 300,
              geton: { title: '天安门东' },
              getoff: { title: '国贸' }
            }]
          }]
        }]
      }
    }, 'transit')

    expect(routes).toMatchObject({
      routes: [{
        routeId: 'route-1',
        distanceMeters: 1000,
        priceYuan: 4.5,
        steps: [{ lines: [{ vehicle: 'SUBWAY', stationCount: 4, priceYuan: 3 }] }]
      }],
      waypointOrder: [2, 0],
      coordinateSystem: 'GCJ02'
    })
    expect(JSON.stringify(routes)).not.toContain('polyline')
  })

  it('maps matrix elements without returning provider internals', () => {
    expect(mapDistanceMatrix({
      status: 0,
      result: { rows: [{ elements: [{ distance: 1200, duration: 300, raw: true }] }] }
    }, 'driving')).toEqual({
      mode: 'driving',
      rows: [{ elements: [{ distanceMeters: 1200, durationSeconds: 300 }] }]
    })
  })

  it('maps official nested realtime and forecast weather structures', () => {
    expect(mapWeather({
      status: 0,
      request_id: 'weather-1',
      result: {
        realtime: [{
          province: '北京市',
          city: '北京市',
          district: '东城区',
          adcode: 110101,
          update_time: '2026-08-28 10:00:00',
          infos: { weather: '晴', temperature: 30, humidity: 50, wind_direction: '南风', wind_power: 2 }
        }],
        forecast: [{
          province: '北京市',
          city: '北京市',
          district: '东城区',
          adcode: 110101,
          infos: [{
            date: '2026-08-29',
            week: '星期六',
            day: { weather: '晴', temperature: 31 },
            night: { weather: '多云', temperature: 22 }
          }]
        }]
      }
    })).toMatchObject({
      realtime: [{ adcode: '110101', weather: '晴', temperatureCelsius: 30, humidityPercent: 50 }],
      forecast: [{
        adcode: '110101',
        days: [{
          date: '2026-08-29',
          dayWeather: '晴',
          nightWeather: '多云',
          dayTemperatureCelsius: 31,
          nightTemperatureCelsius: 22
        }]
      }],
      requestId: 'weather-1'
    })
  })

  it.each([
    [190, 'AUTHENTICATION_FAILED'],
    [113, 'PERMISSION_DENIED'],
    [120, 'QUOTA_EXCEEDED'],
    [347, 'NO_RESULT'],
    [377, 'NO_RESULT'],
    [310, 'INVALID_ARGUMENT'],
    [510, 'UPSTREAM_UNAVAILABLE'],
    [600, 'UPSTREAM_UNAVAILABLE']
  ])('maps provider status %s to %s', (status, code) => {
    try {
      assertTencentMapSuccess({ status, message: 'provider message' })
      throw new Error('Expected status mapping to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(TencentMapConnectorError)
      expect((error as TencentMapConnectorError).code).toBe(code)
    }
  })

  it('rejects provider responses without a numeric status', () => {
    expect(() => assertTencentMapSuccess({ result: {} })).toThrow(
      expect.objectContaining({ code: 'UPSTREAM_RESPONSE_INVALID' })
    )
  })
})
