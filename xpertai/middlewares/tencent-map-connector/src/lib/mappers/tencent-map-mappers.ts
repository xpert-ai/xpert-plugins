import type { TencentMapCoordinate, TencentMapWebServicePayload } from '../client/types.js'
import { TencentMapConnectorError } from '../errors.js'

const MAX_PLACES = 20
const MAX_ROUTES = 5
const MAX_STEPS = 80
const MAX_TRANSIT_LINES = 10
const MAX_WEATHER_REGIONS = 10
const MAX_FORECAST_DAYS = 10

const AUTHENTICATION_STATUSES = new Set([190, 301, 311])
const PERMISSION_STATUSES = new Set([110, 111, 112, 113, 160, 161, 199])
const NO_RESULT_STATUSES = new Set([327, 328, 329, 344, 347, 375, 377, 378, 379, 382, 384, 387, 393])
const UPSTREAM_STATUSES = new Set([500, 510, 520, 530, 531, 600])

export type TencentMapPageContext = {
  page: number
  pageSize: number
}

export function assertTencentMapSuccess(payload: TencentMapWebServicePayload): TencentMapWebServicePayload {
  const status = readNumber(payload.status)
  if (status === undefined || !Number.isSafeInteger(status)) {
    throw new TencentMapConnectorError('UPSTREAM_RESPONSE_INVALID', 'Tencent Maps response is missing a valid status code.')
  }
  if (status === 0) return payload

  const message = readString(payload.message) ?? readString(payload.msg) ?? 'Tencent Maps rejected the request.'
  if (AUTHENTICATION_STATUSES.has(status)) {
    throw new TencentMapConnectorError(
      'AUTHENTICATION_FAILED',
      `Tencent Maps credential was rejected (status ${status}): ${message}`
    )
  }
  if (PERMISSION_STATUSES.has(status)) {
    throw new TencentMapConnectorError(
      'PERMISSION_DENIED',
      `Tencent Maps WebService permission was denied (status ${status}): ${message}`
    )
  }
  if (status === 120) {
    throw new TencentMapConnectorError(
      'QUOTA_EXCEEDED',
      `Tencent Maps per-second quota was exceeded (status ${status}): ${message}`,
      true
    )
  }
  if (status === 121) {
    throw new TencentMapConnectorError(
      'QUOTA_EXCEEDED',
      `Tencent Maps daily quota was exceeded (status ${status}): ${message}`
    )
  }
  if (NO_RESULT_STATUSES.has(status)) {
    throw new TencentMapConnectorError('NO_RESULT', `Tencent Maps returned no result (status ${status}): ${message}`)
  }
  if (UPSTREAM_STATUSES.has(status)) {
    throw new TencentMapConnectorError(
      'UPSTREAM_UNAVAILABLE',
      `Tencent Maps is temporarily unavailable (status ${status}): ${message}`,
      true
    )
  }
  if (status >= 300 && status < 500) {
    throw new TencentMapConnectorError('INVALID_ARGUMENT', `Tencent Maps rejected the request (status ${status}): ${message}`)
  }
  throw new TencentMapConnectorError('UPSTREAM_REQUEST_FAILED', `Tencent Maps request failed (status ${status}): ${message}`)
}

export function mapGeocode(payload: TencentMapWebServicePayload) {
  const result = resultRecord(payload)
  const location = requiredCoordinate(result.location, 'geocoding location')
  return compact({
    location,
    title: readString(result.title),
    address: readString(result.address),
    addressComponents: mapAddressComponents(record(result.address_components)),
    adInfo: mapAdInfo(record(result.ad_info)),
    reliability: readNumber(result.reliability),
    level: readNumber(result.level),
    coordinateSystem: 'GCJ02',
    requestId: requestId(payload)
  })
}

export function mapReverseGeocode(payload: TencentMapWebServicePayload) {
  const result = resultRecord(payload)
  const formatted = record(result.formatted_addresses)
  const address = readString(result.address)
  if (!address) throw invalidResponse('Tencent Maps reverse geocoding response is missing an address.')
  return compact({
    location: requiredCoordinate(result.location ?? record(result.ad_info).location, 'reverse geocoding location'),
    address,
    recommendedAddress: readString(formatted.recommend),
    roughAddress: readString(formatted.rough),
    addressComponents: mapAddressComponents(record(result.address_component ?? result.address_components)),
    adInfo: mapAdInfo(record(result.ad_info)),
    pois: mapPlaces(result.pois),
    coordinateSystem: 'GCJ02',
    requestId: requestId(payload)
  })
}

export function mapPlaceSearch(
  payload: TencentMapWebServicePayload,
  pageContext: TencentMapPageContext = { page: 1, pageSize: 20 }
) {
  const result = resultRecord(payload)
  const places = mapPlaces(payload.data ?? result.data ?? result.pois)
  const count = readNumber(payload.count ?? result.count) ?? places.length
  return compact({
    page: pageContext.page,
    pageSize: pageContext.pageSize,
    count,
    returned: places.length,
    hasMore: pageContext.page * pageContext.pageSize < count,
    places,
    coordinateSystem: 'GCJ02',
    requestId: requestId(payload)
  })
}

export function mapPlaceDetail(payload: TencentMapWebServicePayload) {
  const result = resultRecord(payload)
  const candidates = array(payload.data ?? result.data)
  const place = candidates.length > 0 ? mapPlace(candidates[0]) : mapPlace(result)
  if (!place) throw new TencentMapConnectorError('NO_RESULT', 'Tencent Maps returned no place for the requested POI ID.')
  return { place, coordinateSystem: 'GCJ02' as const, requestId: requestId(payload) }
}

export function mapRoute(payload: TencentMapWebServicePayload, mode: string) {
  const result = resultRecord(payload)
  const sourceRoutes = array(result.routes)
  const routes = sourceRoutes.slice(0, MAX_ROUTES).map((value) => mapRouteItem(value, mode)).filter(isDefined)
  if (routes.length === 0) throw new TencentMapConnectorError('NO_RESULT', `Tencent Maps returned no ${mode} route.`)
  const firstRoute = record(sourceRoutes[0])
  const orderedWaypoints = mapWaypoints(firstRoute.waypoints)
  const waypointOrder = orderedWaypoints
    .map((waypoint) => waypoint.inputOrderIndex)
    .filter((value): value is number => value !== undefined)
  return compact({
    mode,
    routes,
    returned: routes.length,
    truncated: sourceRoutes.length > routes.length,
    orderedWaypoints,
    waypointOrder,
    coordinateSystem: 'GCJ02',
    requestId: requestId(payload)
  })
}

export function mapDistanceMatrix(payload: TencentMapWebServicePayload, mode: string) {
  const result = resultRecord(payload)
  const sourceRows = array(result.rows)
  if (sourceRows.length === 0) throw invalidResponse('Tencent Maps distance matrix response contains no rows.')
  const rows = sourceRows.map((row) => {
    const value = record(row)
    return {
      elements: array(value.elements).map((element) => {
        const item = record(element)
        return compact({
          status: readNumber(item.status),
          distanceMeters: readNumber(item.distance),
          durationSeconds: readNumber(item.duration)
        })
      })
    }
  })
  return compact({ mode, rows, requestId: requestId(payload) })
}

export function mapWeather(payload: TencentMapWebServicePayload) {
  const result = resultRecord(payload)
  const realtime = array(result.realtime)
    .slice(0, MAX_WEATHER_REGIONS)
    .map(mapRealtimeRegion)
    .filter(hasKeys)
  const forecast = array(result.forecast)
    .slice(0, MAX_WEATHER_REGIONS)
    .map(mapForecastRegion)
    .filter(hasKeys)
  if (realtime.length === 0 && forecast.length === 0) {
    throw invalidResponse('Tencent Maps weather response contains neither realtime nor forecast data.')
  }
  return compact({ realtime, forecast, requestId: requestId(payload) })
}

export function mapIpLocation(payload: TencentMapWebServicePayload) {
  const result = resultRecord(payload)
  return compact({
    ip: readString(result.ip),
    location: requiredCoordinate(result.location, 'IP location'),
    adInfo: mapAdInfo(record(result.ad_info)),
    coordinateSystem: 'GCJ02',
    requestId: requestId(payload)
  })
}

function mapRouteItem(value: unknown, mode: string) {
  const route = record(value)
  if (!Object.keys(route).length) return undefined
  const taxiFare = record(route.taxi_fare)
  const steps = array(route.steps).slice(0, MAX_STEPS).map(mapRouteStep).filter(isDefined)
  const price = readNumber(route.price)
  return compact({
    routeId: readString(route.route_id ?? route.id),
    mode,
    distanceMeters: readNumber(route.distance),
    durationMinutes: readNumber(route.duration),
    trafficLightCount: readNumber(route.traffic_light_count),
    tollYuan: readNumber(route.toll ?? route.toll_fee),
    taxiFareYuan: readNumber(taxiFare.fare),
    walkingDistanceMeters: readNumber(route.walking_distance),
    priceYuan: mode === 'transit' && price !== undefined ? price / 100 : price,
    tags: stringArray(route.tags, 20),
    steps,
    stepsTruncated: array(route.steps).length > steps.length
  })
}

function mapRouteStep(value: unknown) {
  const step = record(value)
  if (!Object.keys(step).length) return undefined
  return compact({
    instruction: readString(step.instruction),
    roadName: readString(step.road_name),
    direction: readString(step.dir_desc ?? step.direction),
    mode: readString(step.mode),
    distanceMeters: readNumber(step.distance),
    durationMinutes: readNumber(step.duration),
    lines: array(step.lines).slice(0, MAX_TRANSIT_LINES).map(mapTransitLine).filter(hasKeys)
  })
}

function mapTransitLine(value: unknown) {
  const line = record(value)
  if (!Object.keys(line).length) return undefined
  const price = readNumber(line.price)
  return compact({
    id: readString(line.id),
    title: readString(line.title ?? line.name),
    vehicle: readString(line.vehicle),
    from: mapTransitStop(line.geton ?? line.from),
    to: mapTransitStop(line.getoff ?? line.to),
    destination: readString(line.destination),
    startTime: readString(line.start_time),
    endTime: readString(line.end_time),
    stationCount: readNumber(line.station_count),
    priceYuan: price !== undefined && price >= 0 ? price / 100 : undefined
  })
}

function mapTransitStop(value: unknown) {
  if (typeof value === 'string') return value.trim() || undefined
  const stop = record(value)
  if (!Object.keys(stop).length) return undefined
  return compact({
    id: readString(stop.id),
    title: readString(stop.title ?? stop.name),
    location: mapCoordinate(stop.location)
  })
}

function mapWaypoints(value: unknown) {
  return array(value).slice(0, 16).map((item) => {
    const waypoint = record(item)
    return compact({
      inputOrderIndex: readNumber(waypoint.input_order_idx),
      title: readString(waypoint.title),
      location: mapCoordinate(waypoint.location),
      distanceMeters: readNumber(waypoint.distance),
      durationMinutes: readNumber(waypoint.duration)
    })
  }).filter(hasKeys)
}

function mapPlaces(value: unknown) {
  return array(value).slice(0, MAX_PLACES).map(mapPlace).filter(isDefined)
}

function mapPlace(value: unknown) {
  const place = record(value)
  if (!Object.keys(place).length) return undefined
  return compact({
    id: readString(place.id),
    title: readString(place.title ?? place.name),
    address: readString(place.address),
    category: readString(place.category ?? place.type),
    tel: readString(place.tel),
    location: mapCoordinate(place.location),
    adInfo: mapAdInfo(record(place.ad_info)),
    distanceMeters: readNumber(place._distance ?? place.distance)
  })
}

function mapRealtimeRegion(value: unknown) {
  const region = record(value)
  const infos = record(region.infos)
  return compact({
    ...mapWeatherRegion(region),
    temperatureCelsius: readNumber(infos.temperature),
    humidityPercent: readNumber(infos.humidity),
    weather: readString(infos.weather),
    windDirection: readString(infos.wind_direction),
    windPower: readString(infos.wind_power) ?? numberString(infos.wind_power),
    airPressureHpa: readNumber(infos.air_pressure),
    visibilityKilometers: readNumber(infos.visibility),
    precipitationMillimeters: readNumber(infos.precipitation)
  })
}

function mapForecastRegion(value: unknown) {
  const region = record(value)
  const days = array(region.infos).slice(0, MAX_FORECAST_DAYS).map(mapForecastDay).filter(hasKeys)
  return compact({
    ...mapWeatherRegion(region),
    days
  })
}

function mapWeatherRegion(region: Record<string, unknown>) {
  return compact({
    province: readString(region.province),
    city: readString(region.city),
    district: readString(region.district),
    adcode: readString(region.adcode) ?? numberString(region.adcode),
    updateTime: readString(region.update_time)
  })
}

function mapForecastDay(value: unknown) {
  const item = record(value)
  const day = record(item.day)
  const night = record(item.night)
  return compact({
    date: readString(item.date),
    week: readString(item.week),
    dayWeather: readString(day.weather ?? item.day_weather),
    nightWeather: readString(night.weather ?? item.night_weather),
    dayTemperatureCelsius: readNumber(day.temperature ?? item.day_air_temperature),
    nightTemperatureCelsius: readNumber(night.temperature ?? item.night_air_temperature),
    dayWindDirection: readString(day.wind_direction),
    nightWindDirection: readString(night.wind_direction),
    dayWindPower: readString(day.wind_power) ?? numberString(day.wind_power),
    nightWindPower: readString(night.wind_power) ?? numberString(night.wind_power)
  })
}

function requiredCoordinate(value: unknown, label: string): TencentMapCoordinate {
  const location = mapCoordinate(value)
  if (!location) throw invalidResponse(`Tencent Maps response is missing a valid ${label}.`)
  return location
}

function mapCoordinate(value: unknown): TencentMapCoordinate | undefined {
  const location = record(value)
  const lat = readNumber(location.lat ?? location.latitude)
  const lng = readNumber(location.lng ?? location.longitude)
  if (lat === undefined || lng === undefined || lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined
  return { lat, lng }
}

function mapAddressComponents(value: Record<string, unknown>) {
  if (!Object.keys(value).length) return undefined
  return compact({
    nation: readString(value.nation),
    province: readString(value.province),
    city: readString(value.city),
    district: readString(value.district),
    street: readString(value.street),
    streetNumber: readString(value.street_number)
  })
}

function mapAdInfo(value: Record<string, unknown>) {
  if (!Object.keys(value).length) return undefined
  return compact({
    adcode: readString(value.adcode) ?? numberString(value.adcode),
    nation: readString(value.nation),
    province: readString(value.province),
    city: readString(value.city),
    district: readString(value.district)
  })
}

function resultRecord(payload: TencentMapWebServicePayload): Record<string, unknown> {
  return record(payload.result ?? payload)
}

function requestId(payload: TencentMapWebServicePayload): string | undefined {
  return readString(payload.request_id ?? payload.requestId)
}

function invalidResponse(message: string): TencentMapConnectorError {
  return new TencentMapConnectorError('UPSTREAM_RESPONSE_INVALID', message)
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && (!Array.isArray(item) || item.length > 0))
  ) as T
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function stringArray(value: unknown, max: number): string[] {
  return array(value).filter((item): item is string => typeof item === 'string').slice(0, max)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 2_000) : undefined
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function numberString(value: unknown): string | undefined {
  const number = readNumber(value)
  return number === undefined ? undefined : String(number)
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}

function hasKeys<T extends object>(value: T | undefined): value is T {
  return !!value && Object.keys(value).length > 0
}
