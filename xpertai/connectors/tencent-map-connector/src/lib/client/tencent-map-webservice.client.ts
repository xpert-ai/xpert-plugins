import { Injectable } from '@nestjs/common'
import {
  TENCENT_MAP_ALONGBY_MAX_POINTS,
  TENCENT_MAP_CONNECT_TEST_ADDRESS,
  TENCENT_MAP_CONNECT_TIMEOUT_MS,
  TENCENT_MAP_REQUEST_TIMEOUT_MS,
  TENCENT_MAP_REQUEST_URL_MAX_BYTES,
  TENCENT_MAP_RESPONSE_MAX_BYTES,
  TENCENT_MAP_WEBSERVICE_ORIGIN
} from '../constants.js'
import { errorMessage, TencentMapConnectorError } from '../errors.js'
import { assertTencentMapSuccess, mapGeocode } from '../mappers/tencent-map-mappers.js'
import type {
  TencentMapCallInput,
  TencentMapCoordinate,
  TencentMapWebServicePayload
} from './types.js'

type QueryValue = string | number | boolean | undefined
type Query = Record<string, QueryValue>

@Injectable()
export class TencentMapWebServiceClient {
  async verifyCredential(apiKey: string): Promise<void> {
    const payload = await this.call({
      apiKey,
      name: 'geocoder',
      arguments: { address: TENCENT_MAP_CONNECT_TEST_ADDRESS },
      timeoutMs: TENCENT_MAP_CONNECT_TIMEOUT_MS
    })
    mapGeocode(payload)
  }

  async call(input: TencentMapCallInput): Promise<TencentMapWebServicePayload> {
    try {
      return await this.execute(input)
    } catch (error) {
      throw normalizeWebServiceError(error)
    }
  }

  private async execute(input: TencentMapCallInput): Promise<TencentMapWebServicePayload> {
    const timeoutMs = input.timeoutMs ?? TENCENT_MAP_REQUEST_TIMEOUT_MS
    const args = input.arguments

    switch (input.name) {
      case 'geocoder':
        return this.request(input.apiKey, '/ws/geocoder/v1/', {
          address: requiredString(args, 'address'),
          policy: 0
        }, timeoutMs)
      case 'reverseGeocoder':
        return this.request(input.apiKey, '/ws/geocoder/v1/', {
          location: requiredString(args, 'location'),
          get_poi: 1,
          poi_options: 'radius=1000;policy=1;orderby=_distance'
        }, timeoutMs)
      case 'placeSuggestion':
        return this.request(input.apiKey, '/ws/place/v1/suggestion', {
          keyword: requiredString(args, 'keyword'),
          region: optionalString(args, 'region'),
          page_index: positiveInteger(args, 'page_index', 1),
          page_size: positiveInteger(args, 'page_size', 20)
        }, timeoutMs)
      case 'placeSearchNearby':
        return this.request(input.apiKey, '/ws/place/v1/search', {
          keyword: requiredString(args, 'keyword'),
          boundary: nearbyBoundary(args),
          page_index: positiveInteger(args, 'page_index', 1),
          page_size: positiveInteger(args, 'page_size', 20),
          orderby: '_distance'
        }, timeoutMs)
      case 'placeDetail':
        return this.request(input.apiKey, '/ws/place/v1/detail', {
          id: requiredString(args, 'id')
        }, timeoutMs)
      case 'directionDriving':
        return this.request(input.apiKey, '/ws/direction/v1/driving/', {
          ...routeQuery(args),
          get_mp: 1
        }, timeoutMs)
      case 'directionTransit':
        return this.request(input.apiKey, '/ws/direction/v1/transit/', {
          ...routeQuery(args),
          policy: optionalString(args, 'policy'),
          price_unit: 1
        }, timeoutMs)
      case 'directionWalking':
        return this.request(input.apiKey, '/ws/direction/v1/walking/', routeQuery(args), timeoutMs)
      case 'directionBicycling':
        return this.request(input.apiKey, '/ws/direction/v1/bicycling/', routeQuery(args), timeoutMs)
      case 'matrix':
        return this.request(input.apiKey, '/ws/distance/v1/matrix/', {
          from: requiredString(args, 'from'),
          to: requiredString(args, 'to'),
          mode: requiredString(args, 'mode')
        }, timeoutMs)
      case 'weather':
        return this.request(input.apiKey, '/ws/weather/v1/', {
          adcode: optionalString(args, 'adcode'),
          location: optionalString(args, 'location'),
          type: optionalString(args, 'type') ?? 'now'
        }, timeoutMs)
      case 'ipLocation':
        return this.request(input.apiKey, '/ws/location/v1/ip', {
          ip: requiredString(args, 'ip')
        }, timeoutMs)
      case 'placeAlongby':
        return this.searchAlongRoute(input.apiKey, args, timeoutMs)
      case 'futureDrivingDirection':
        return this.request(input.apiKey, '/ws/direction/v1/driving/', {
          ...routeQuery(args),
          departure_time: requiredString(args, 'departure_time'),
          get_mp: 1
        }, timeoutMs)
      case 'waypointOrder':
        return this.request(input.apiKey, '/ws/direction/v1/driving/', {
          ...routeQuery(args),
          waypoints: requiredString(args, 'waypoints'),
          waypoint_order: 1,
          with_dest: 1
        }, timeoutMs)
      default:
        return unsupportedOperation(input.name)
    }
  }

  private async searchAlongRoute(
    apiKey: string,
    args: Record<string, unknown>,
    timeoutMs: number
  ): Promise<TencentMapWebServicePayload> {
    const route = await this.request(apiKey, '/ws/direction/v1/driving/', {
      ...routeQuery(args),
      get_mp: 0,
      no_step: 1
    }, timeoutMs)
    const polyline = formatAlongbyPolyline(firstRoutePolyline(route))
    return this.request(apiKey, '/ws/place/v1/alongby', {
      keyword: requiredString(args, 'keyword'),
      polyline
    }, timeoutMs)
  }

  private async request(
    apiKey: string,
    path: string,
    query: Query,
    timeoutMs: number
  ): Promise<TencentMapWebServicePayload> {
    const url = new URL(path, TENCENT_MAP_WEBSERVICE_ORIGIN)
    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(name, String(value))
    }
    url.searchParams.set('output', 'json')
    url.searchParams.set('key', apiKey)
    if (Buffer.byteLength(url.toString(), 'utf8') > TENCENT_MAP_REQUEST_URL_MAX_BYTES) {
      throw new TencentMapConnectorError('INVALID_ARGUMENT', 'Tencent Maps request exceeds the supported URL size.')
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Xpert-Tencent-Map-Connector/0.1.0'
        },
        redirect: 'error',
        signal: controller.signal
      })
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined)
        throw httpStatusError(response.status)
      }
      const payload = await readBoundedJson(response, TENCENT_MAP_RESPONSE_MAX_BYTES)
      return assertTencentMapSuccess(payload)
    } finally {
      clearTimeout(timeout)
    }
  }
}

async function readBoundedJson(response: Response, maxBytes: number): Promise<TencentMapWebServicePayload> {
  const contentLength = readContentLength(response.headers.get('content-length'))
  if (contentLength !== undefined && contentLength > maxBytes) throw responseTooLargeError()
  if (!response.body) throw invalidResponseError('Tencent Maps returned an empty response body.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > maxBytes) {
        await reader.cancel()
        throw responseTooLargeError()
      }
      text += decoder.decode(part.value, { stream: true })
    }
    text += decoder.decode()
  } finally {
    reader.releaseLock()
  }

  try {
    const parsed: unknown = JSON.parse(text)
    if (!isRecord(parsed)) throw invalidResponseError('Tencent Maps returned a non-object JSON response.')
    return parsed
  } catch (error) {
    if (error instanceof TencentMapConnectorError) throw error
    throw invalidResponseError('Tencent Maps returned invalid JSON.')
  }
}

function routeQuery(args: Record<string, unknown>): Query {
  return {
    from: requiredString(args, 'from'),
    to: requiredString(args, 'to')
  }
}

function nearbyBoundary(args: Record<string, unknown>): string {
  const location = requiredString(args, 'location')
  const radius = positiveInteger(args, 'radius', 1000)
  const autoExtend = optionalBoolean(args, 'auto_extend') ?? false
  return `nearby(${location},${radius},${autoExtend ? 1 : 0})`
}

function firstRoutePolyline(payload: TencentMapWebServicePayload): unknown {
  const result = record(payload.result)
  const firstRoute = record(array(result.routes)[0])
  if (!Array.isArray(firstRoute.polyline) || firstRoute.polyline.length < 4) {
    throw new TencentMapConnectorError('NO_RESULT', 'Tencent Maps returned no route polyline for along-route search.')
  }
  return firstRoute.polyline
}

export function decodeTencentPolyline(value: unknown): TencentMapCoordinate[] {
  if (!Array.isArray(value) || value.length < 4 || value.length % 2 !== 0) {
    throw invalidResponseError('Tencent Maps returned an invalid route polyline.')
  }
  const coordinates = value.map(readFiniteNumber)
  for (let index = 2; index < coordinates.length; index += 1) {
    coordinates[index] = coordinates[index - 2] + coordinates[index] / 1_000_000
  }
  const points: TencentMapCoordinate[] = []
  for (let index = 0; index < coordinates.length; index += 2) {
    const lat = coordinates[index]
    const lng = coordinates[index + 1]
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw invalidResponseError('Tencent Maps returned an out-of-range route coordinate.')
    }
    points.push({ lat, lng })
  }
  return points
}

function formatAlongbyPolyline(value: unknown): string {
  const decoded = decodeTencentPolyline(value)
  const sampled = samplePoints(decoded, TENCENT_MAP_ALONGBY_MAX_POINTS)
  return sampled.flatMap((point) => [formatNumber(point.lat), formatNumber(point.lng)]).join(',')
}

function samplePoints(points: TencentMapCoordinate[], maxPoints: number): TencentMapCoordinate[] {
  if (points.length <= maxPoints) return points
  return Array.from({ length: maxPoints }, (_, index) => {
    const sourceIndex = Math.round(index * (points.length - 1) / (maxPoints - 1))
    return points[sourceIndex]
  })
}

function formatNumber(value: number): string {
  return String(Number(value.toFixed(6)))
}

function requiredString(args: Record<string, unknown>, name: string): string {
  const value = optionalString(args, name)
  if (!value) throw new TencentMapConnectorError('INVALID_ARGUMENT', `Tencent Maps argument '${name}' is required.`)
  return value
}

function optionalString(args: Record<string, unknown>, name: string): string | undefined {
  const value = args[name]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function positiveInteger(args: Record<string, unknown>, name: string, fallback: number): number {
  const value = args[name]
  if (value === undefined) return fallback
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value
  throw new TencentMapConnectorError('INVALID_ARGUMENT', `Tencent Maps argument '${name}' must be a positive integer.`)
}

function optionalBoolean(args: Record<string, unknown>, name: string): boolean | undefined {
  const value = args[name]
  if (value === undefined) return undefined
  if (typeof value === 'boolean') return value
  throw new TencentMapConnectorError('INVALID_ARGUMENT', `Tencent Maps argument '${name}' must be a boolean.`)
}

function readFiniteNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  throw invalidResponseError('Tencent Maps returned a non-numeric route polyline value.')
}

function readContentLength(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

function httpStatusError(status: number): TencentMapConnectorError {
  if (status === 401) return new TencentMapConnectorError('AUTHENTICATION_FAILED', 'Tencent Maps rejected the developer Key.')
  if (status === 403) return new TencentMapConnectorError('PERMISSION_DENIED', 'Tencent Maps denied WebService access for this Key.')
  if (status === 429) return new TencentMapConnectorError('QUOTA_EXCEEDED', 'Tencent Maps request quota was exceeded.', true)
  if (status >= 500) return new TencentMapConnectorError('UPSTREAM_UNAVAILABLE', `Tencent Maps is unavailable (HTTP ${status}).`, true)
  return new TencentMapConnectorError('UPSTREAM_REQUEST_FAILED', `Tencent Maps rejected the HTTP request (HTTP ${status}).`)
}

function normalizeWebServiceError(error: unknown): TencentMapConnectorError {
  if (error instanceof TencentMapConnectorError) return error
  if (error instanceof Error && error.name === 'AbortError') {
    return new TencentMapConnectorError('UPSTREAM_TIMEOUT', 'Tencent Maps request timed out.', true)
  }
  const message = errorMessage(error)
  if (/timeout|timed out/i.test(message)) {
    return new TencentMapConnectorError('UPSTREAM_TIMEOUT', 'Tencent Maps request timed out.', true)
  }
  return new TencentMapConnectorError('UPSTREAM_UNAVAILABLE', `Tencent Maps WebService request failed: ${message}`, true)
}

function responseTooLargeError(): TencentMapConnectorError {
  return new TencentMapConnectorError('RESPONSE_TOO_LARGE', 'Tencent Maps response exceeded the 1 MiB connector limit.')
}

function invalidResponseError(message: string): TencentMapConnectorError {
  return new TencentMapConnectorError('UPSTREAM_RESPONSE_INVALID', message)
}

function unsupportedOperation(value: never): never {
  throw new TencentMapConnectorError('CONFIGURATION_INVALID', `Unsupported Tencent Maps operation '${String(value)}'.`)
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
