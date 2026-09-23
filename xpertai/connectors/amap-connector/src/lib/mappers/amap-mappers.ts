import type { AmapCoordinate, AmapWebServicePayload } from '../client/types.js'
import { AmapConnectorError } from '../errors.js'

const MAX_GEOCODES = 10
const MAX_PLACES = 20
const MAX_ROUTES = 5
const MAX_STEPS = 80
const MAX_TRANSIT_SEGMENTS = 20
const MAX_BUS_LINES = 10
const MAX_FORECAST_DAYS = 7
const MAX_TEXT_LENGTH = 512

const CREDENTIAL_INVALID_CODES = new Set(['10001', '10009', '10013'])
const CREDENTIAL_RESTRICTED_CODES = new Set(['10005', '10007'])
const PERMISSION_CODES = new Set(['10002', '10012', '10041'])
const QUOTA_CODES = new Set([
  '10003', '10004', '10010', '10014', '10015', '10019', '10020', '10021',
  '10029', '10044', '10045', '40000', '40002', '40003'
])
const INVALID_ARGUMENT_CODES = new Set(['20000', '20001', '20002', '20003', '20012'])
const OUT_OF_SERVICE_CODES = new Set(['20011', '20800'])
const NO_RESULT_CODES = new Set(['20801', '20802', '20803'])

export type AmapPageContext = {
  page: number
  pageSize: number
}

export function assertAmapSuccess(payload: AmapWebServicePayload): AmapWebServicePayload {
  const status = scalarString(payload.status)
  const upstreamCode = scalarString(payload.infocode)
  if (!status || !upstreamCode) {
    throw invalidResponse('AMap response is missing status or infocode.')
  }
  if (status === '1' && upstreamCode === '10000') return payload

  if (CREDENTIAL_INVALID_CODES.has(upstreamCode)) {
    throw providerError('CREDENTIAL_INVALID', 'AMap rejected the Web Service Key.', false, upstreamCode)
  }
  if (CREDENTIAL_RESTRICTED_CODES.has(upstreamCode)) {
    throw providerError('CREDENTIAL_RESTRICTED', 'AMap rejected the request restriction or digital signature.', false, upstreamCode)
  }
  if (PERMISSION_CODES.has(upstreamCode)) {
    throw providerError('PERMISSION_DENIED', 'AMap denied access to this Web Service operation.', false, upstreamCode)
  }
  if (QUOTA_CODES.has(upstreamCode)) {
    throw providerError('QUOTA_EXCEEDED', 'AMap request quota or purchased capacity was exhausted.', false, upstreamCode)
  }
  if (INVALID_ARGUMENT_CODES.has(upstreamCode)) {
    throw providerError('INVALID_ARGUMENT', 'AMap rejected one or more request arguments.', false, upstreamCode)
  }
  if (OUT_OF_SERVICE_CODES.has(upstreamCode)) {
    throw providerError('OUT_OF_SERVICE', 'AMap does not cover the requested location or service.', false, upstreamCode)
  }
  if (NO_RESULT_CODES.has(upstreamCode)) {
    throw providerError('NO_RESULT', 'AMap could not calculate a result for the requested locations.', false, upstreamCode)
  }
  if (upstreamCode === '10016' || /^3\d{4}$/.test(upstreamCode)) {
    throw providerError('UPSTREAM_UNAVAILABLE', 'AMap is temporarily unavailable.', true, upstreamCode)
  }
  if (upstreamCode === '10017') {
    throw providerError('UPSTREAM_UNAVAILABLE', 'The requested AMap resource is unavailable.', false, upstreamCode)
  }
  throw providerError('UPSTREAM_REQUEST_FAILED', 'AMap rejected the Web Service request.', false, upstreamCode)
}

export function mapGeocode(payload: AmapWebServicePayload) {
  const source = array(payload.geocodes)
  const items = source.slice(0, MAX_GEOCODES).map(mapGeocodeItem).filter(isDefined)
  if (!items.length) throw new AmapConnectorError('NO_RESULT', 'AMap returned no geocoding result.')
  return compact({
    count: readNumber(payload.count) ?? items.length,
    returned: items.length,
    truncated: source.length > items.length,
    items,
    coordinateSystem: 'GCJ02'
  })
}

export function mapReverseGeocode(payload: AmapWebServicePayload, location: AmapCoordinate) {
  const regeocode = record(payload.regeocode)
  const formattedAddress = readString(regeocode.formatted_address)
  if (!formattedAddress) throw invalidResponse('AMap reverse geocoding response is missing a formatted address.')
  const component = record(regeocode.addressComponent)
  const sourcePois = array(regeocode.pois)
  const pois = sourcePois.slice(0, MAX_PLACES).map(mapPlace).filter(isDefined)
  return compact({
    location,
    formattedAddress,
    addressComponent: compact({
      country: readString(component.country),
      province: readString(component.province),
      city: readString(component.city),
      cityCode: readString(component.citycode),
      district: readString(component.district),
      township: readString(component.township),
      neighborhood: readString(record(component.neighborhood).name),
      building: readString(record(component.building).name),
      adcode: readString(component.adcode),
      street: readString(record(component.streetNumber).street),
      streetNumber: readString(record(component.streetNumber).number)
    }),
    pois,
    poisTruncated: sourcePois.length > pois.length,
    coordinateSystem: 'GCJ02'
  })
}

export function mapPlaceSearch(payload: AmapWebServicePayload, pageContext: AmapPageContext) {
  const source = array(payload.pois)
  const items = source.slice(0, MAX_PLACES).map(mapPlace).filter(isDefined)
  const count = readNumber(payload.count)
  const officialCount = count === undefined ? undefined : Math.min(count, 200)
  const hasMore = officialCount === undefined
    ? items.length === pageContext.pageSize
    : pageContext.page * pageContext.pageSize < officialCount
  return compact({
    page: pageContext.page,
    pageSize: pageContext.pageSize,
    count,
    returned: items.length,
    hasMore,
    items,
    coordinateSystem: 'GCJ02'
  })
}

export function mapPlaceDetail(payload: AmapWebServicePayload) {
  const place = mapPlace(array(payload.pois)[0])
  if (!place) throw new AmapConnectorError('NO_RESULT', 'AMap returned no place for the requested POI ID.')
  return { place, coordinateSystem: 'GCJ02' as const }
}

export function mapRoute(
  payload: AmapWebServicePayload,
  mode: 'driving' | 'walking' | 'bicycling'
) {
  const route = record(payload.route)
  const origin = requiredCoordinate(route.origin, 'route origin')
  const destination = requiredCoordinate(route.destination, 'route destination')
  const sourcePaths = array(route.paths)
  const paths = sourcePaths.slice(0, mode === 'driving' ? 3 : 3).map(mapRoutePath).filter(isDefined)
  if (!paths.length) throw new AmapConnectorError('NO_RESULT', `AMap returned no ${mode} route.`)
  return compact({
    mode,
    origin,
    destination,
    taxiCostYuan: readNumber(route.taxi_cost),
    paths,
    returned: paths.length,
    truncated: sourcePaths.length > paths.length,
    coordinateSystem: 'GCJ02'
  })
}

export function mapTransitRoute(payload: AmapWebServicePayload) {
  const route = record(payload.route)
  const origin = requiredCoordinate(route.origin, 'transit origin')
  const destination = requiredCoordinate(route.destination, 'transit destination')
  const sourcePlans = array(route.transits)
  const plans = sourcePlans.slice(0, MAX_ROUTES).map(mapTransitPlan).filter(isDefined)
  if (!plans.length) throw new AmapConnectorError('NO_RESULT', 'AMap returned no transit route.')
  return compact({
    mode: 'transit',
    origin,
    destination,
    distanceMeters: readNumber(route.distance),
    taxiCostYuan: readNumber(route.taxi_cost),
    plans,
    returned: plans.length,
    truncated: sourcePlans.length > plans.length,
    coordinateSystem: 'GCJ02'
  })
}

export function mapDistance(payload: AmapWebServicePayload, mode: string) {
  const source = array(payload.results)
  const items = source.slice(0, 100).map((value, index) => {
    const item = record(value)
    return compact({
      originIndex: readNumber(item.origin_id) ?? index + 1,
      destinationIndex: readNumber(item.dest_id) ?? 1,
      distanceMeters: readNumber(item.distance),
      durationSeconds: readNumber(item.duration),
      statusCode: readString(item.code)
    })
  })
  if (!items.length) throw invalidResponse('AMap distance response contains no results.')
  return { mode, items, returned: items.length }
}

export function mapWeather(payload: AmapWebServicePayload, mode: 'live' | 'forecast') {
  if (mode === 'live') {
    const source = array(payload.lives)
    const lives = source.slice(0, 10).map((value) => {
      const item = record(value)
      return compact({
        province: readString(item.province),
        city: readString(item.city),
        adcode: readString(item.adcode),
        weather: readString(item.weather),
        temperatureCelsius: readNumber(item.temperature),
        windDirection: readString(item.winddirection),
        windPower: readString(item.windpower),
        humidityPercent: readNumber(item.humidity),
        reportTime: readString(item.reporttime)
      })
    }).filter(hasKeys)
    if (!lives.length) throw invalidResponse('AMap weather response contains no live weather data.')
    return { mode, lives }
  }

  const source = array(payload.forecasts)
  const forecasts = source.slice(0, 10).map((value) => {
    const item = record(value)
    const sourceCasts = array(item.casts)
    const days = sourceCasts.slice(0, MAX_FORECAST_DAYS).map((cast) => {
      const day = record(cast)
      return compact({
        date: readString(day.date),
        week: readString(day.week),
        dayWeather: readString(day.dayweather),
        nightWeather: readString(day.nightweather),
        dayTemperatureCelsius: readNumber(day.daytemp),
        nightTemperatureCelsius: readNumber(day.nighttemp),
        dayWindDirection: readString(day.daywind),
        nightWindDirection: readString(day.nightwind),
        dayWindPower: readString(day.daypower),
        nightWindPower: readString(day.nightpower)
      })
    }).filter(hasKeys)
    return compact({
      province: readString(item.province),
      city: readString(item.city),
      adcode: readString(item.adcode),
      reportTime: readString(item.reporttime),
      days,
      daysTruncated: sourceCasts.length > days.length
    })
  }).filter(hasKeys)
  if (!forecasts.length) throw invalidResponse('AMap weather response contains no forecast data.')
  return { mode, forecasts }
}

export function mapIpLocation(payload: AmapWebServicePayload) {
  const rectangle = parseRectangle(payload.rectangle)
  const province = readString(payload.province)
  const city = readString(payload.city)
  if (!province && !city) throw new AmapConnectorError('NO_RESULT', 'AMap returned no location for the IP address.')
  return compact({
    province,
    city,
    adcode: readString(payload.adcode),
    rectangle,
    coordinateSystem: 'GCJ02'
  })
}

function mapGeocodeItem(value: unknown) {
  const item = record(value)
  const location = mapCoordinate(item.location)
  if (!location) return undefined
  return compact({
    formattedAddress: readString(item.formatted_address),
    country: readString(item.country),
    province: readString(item.province),
    city: readString(item.city),
    cityCode: readString(item.citycode),
    district: readString(item.district),
    township: readString(item.township),
    neighborhood: readString(record(item.neighborhood).name),
    building: readString(record(item.building).name),
    adcode: readString(item.adcode),
    street: readString(item.street),
    number: readString(item.number),
    level: readString(item.level),
    location
  })
}

function mapPlace(value: unknown) {
  const item = record(value)
  const id = readString(item.id)
  const name = readString(item.name)
  if (!id || !name) return undefined
  const business = record(item.business)
  const navi = record(item.navi)
  return compact({
    id,
    parentId: readString(item.parent),
    name,
    type: readString(item.type),
    typeCode: readString(item.typecode),
    businessType: readString(item.biz_type),
    address: readString(item.address),
    location: mapCoordinate(item.location),
    telephone: readString(item.tel),
    province: readString(item.pname),
    city: readString(item.cityname),
    district: readString(item.adname),
    cityCode: readString(item.citycode),
    adcode: readString(item.adcode),
    distanceMeters: readNumber(item.distance),
    businessArea: readString(business.business_area),
    openingHoursToday: readString(business.opentime_today),
    openingHoursWeek: readString(business.opentime_week),
    rating: readNumber(business.rating),
    averageCostYuan: readNumber(business.cost),
    entrance: mapCoordinate(navi.entr_location),
    exit: mapCoordinate(navi.exit_location)
  })
}

function mapRoutePath(value: unknown) {
  const path = record(value)
  if (!Object.keys(path).length) return undefined
  const cost = record(path.cost)
  const sourceSteps = array(path.steps)
  const steps = sourceSteps.slice(0, MAX_STEPS).map((step) => {
    const item = record(step)
    const stepCost = record(item.cost)
    return compact({
      instruction: readString(item.instruction),
      orientation: readString(item.orientation),
      roadName: readString(item.road_name),
      distanceMeters: readNumber(item.step_distance),
      durationSeconds: readNumber(stepCost.duration)
    })
  }).filter(hasKeys)
  return compact({
    distanceMeters: readNumber(path.distance),
    restriction: readString(path.restriction),
    durationSeconds: readNumber(cost.duration),
    tollsYuan: readNumber(cost.tolls),
    tollDistanceMeters: readNumber(cost.toll_distance),
    trafficLightCount: readNumber(cost.traffic_lights),
    steps,
    stepsTruncated: sourceSteps.length > steps.length
  })
}

function mapTransitPlan(value: unknown) {
  const plan = record(value)
  if (!Object.keys(plan).length) return undefined
  const cost = record(plan.cost)
  const sourceSegments = array(plan.segments)
  const segments = sourceSegments.slice(0, MAX_TRANSIT_SEGMENTS).map((segment) => {
    const item = record(segment)
    const walking = record(item.walking)
    const bus = record(item.bus)
    const sourceBusLines = array(bus.buslines)
    const busLines = sourceBusLines.slice(0, MAX_BUS_LINES).map((line) => {
      const busLine = record(line)
      return compact({
        id: readString(busLine.id),
        name: readString(busLine.name),
        type: readString(busLine.type),
        distanceMeters: readNumber(busLine.distance),
        durationSeconds: readNumber(busLine.duration),
        departureStop: mapTransitStop(busLine.departure_stop),
        arrivalStop: mapTransitStop(busLine.arrival_stop),
        viaStopCount: readNumber(busLine.via_num)
      })
    }).filter(hasKeys)
    return compact({
      walkingDistanceMeters: readNumber(walking.distance),
      walkingDurationSeconds: readNumber(walking.duration),
      busLines,
      busLinesTruncated: sourceBusLines.length > busLines.length,
      railway: mapRailway(item.railway),
      taxi: mapTaxi(item.taxi)
    })
  }).filter(hasKeys)
  return compact({
    durationSeconds: readNumber(cost.duration ?? plan.duration),
    priceYuan: readNumber(cost.transit_fee ?? plan.cost),
    walkingDistanceMeters: readNumber(plan.walking_distance),
    nightFlag: readString(plan.nightflag),
    segments,
    segmentsTruncated: sourceSegments.length > segments.length
  })
}

function mapTransitStop(value: unknown) {
  const stop = record(value)
  if (!Object.keys(stop).length) return undefined
  return compact({
    id: readString(stop.id),
    name: readString(stop.name),
    location: mapCoordinate(stop.location)
  })
}

function mapRailway(value: unknown) {
  const railway = record(value)
  if (!Object.keys(railway).length) return undefined
  return compact({
    id: readString(railway.id),
    name: readString(railway.name),
    time: readString(railway.time),
    trip: readString(railway.trip),
    distanceMeters: readNumber(railway.distance)
  })
}

function mapTaxi(value: unknown) {
  const taxi = record(value)
  if (!Object.keys(taxi).length) return undefined
  return compact({
    priceYuan: readNumber(taxi.price),
    durationSeconds: readNumber(taxi.drivetime),
    distanceMeters: readNumber(taxi.distance)
  })
}

function parseRectangle(value: unknown) {
  const text = scalarString(value)
  if (!text) return undefined
  const [southwestValue, northeastValue] = text.split(';')
  const southwest = mapCoordinate(southwestValue)
  const northeast = mapCoordinate(northeastValue)
  return southwest && northeast ? { southwest, northeast } : undefined
}

function requiredCoordinate(value: unknown, label: string): AmapCoordinate {
  const coordinate = mapCoordinate(value)
  if (!coordinate) throw invalidResponse(`AMap response is missing a valid ${label}.`)
  return coordinate
}

function mapCoordinate(value: unknown): AmapCoordinate | undefined {
  if (typeof value === 'string') {
    const [lngText, latText, ...rest] = value.split(',')
    if (rest.length) return undefined
    const lng = readNumber(lngText)
    const lat = readNumber(latText)
    return validCoordinate(lng, lat)
  }
  const coordinate = record(value)
  return validCoordinate(readNumber(coordinate.lng), readNumber(coordinate.lat))
}

function validCoordinate(lng: number | undefined, lat: number | undefined): AmapCoordinate | undefined {
  if (lng === undefined || lat === undefined || lng < -180 || lng > 180 || lat < -90 || lat > 90) return undefined
  return { lng, lat }
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text ? text.slice(0, MAX_TEXT_LENGTH) : undefined
}

function scalarString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>
}

function hasKeys(value: object): boolean {
  return Object.keys(value).length > 0
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidResponse(message: string): AmapConnectorError {
  return new AmapConnectorError('UPSTREAM_RESPONSE_INVALID', message)
}

function providerError(
  code: AmapConnectorError['code'],
  message: string,
  retryable: boolean,
  upstreamCode: string
): AmapConnectorError {
  return new AmapConnectorError(code, `${message} (infocode ${upstreamCode})`, retryable, upstreamCode)
}
