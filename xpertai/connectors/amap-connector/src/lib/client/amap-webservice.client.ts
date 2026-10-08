import { createHash } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import {
  AMAP_CONNECT_TEST_ADDRESS,
  AMAP_CONNECT_TIMEOUT_MS,
  AMAP_REQUEST_TIMEOUT_MS,
  AMAP_REQUEST_URL_MAX_BYTES,
  AMAP_RESPONSE_MAX_BYTES,
  AMAP_WEBSERVICE_ORIGIN
} from '../constants.js'
import { AmapConnectorError, errorMessage } from '../errors.js'
import { assertAmapSuccess, mapGeocode } from '../mappers/amap-mappers.js'
import type { AmapCallInput, AmapRuntimeCredential, AmapWebServicePayload } from './types.js'

type QueryValue = string | number | boolean | undefined
type Query = Record<string, QueryValue>

@Injectable()
export class AmapWebServiceClient {
  async verifyCredential(credential: AmapRuntimeCredential): Promise<void> {
    const payload = await this.call({
      ...credential,
      name: 'geocode',
      arguments: { address: AMAP_CONNECT_TEST_ADDRESS },
      timeoutMs: AMAP_CONNECT_TIMEOUT_MS,
      maxAttempts: 1
    })
    mapGeocode(payload)
  }

  async call(input: AmapCallInput): Promise<AmapWebServicePayload> {
    const maxAttempts = Math.min(Math.max(input.maxAttempts ?? 3, 1), 3)
    let latest: AmapConnectorError | undefined
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.execute(input)
      } catch (error) {
        latest = normalizeWebServiceError(error)
        if (!latest.retryable || attempt === maxAttempts) throw latest
        await delay(attempt === 1 ? 200 : 500)
      }
    }
    throw latest ?? new AmapConnectorError('UPSTREAM_REQUEST_FAILED', 'AMap request failed.')
  }

  private async execute(input: AmapCallInput): Promise<AmapWebServicePayload> {
    const timeoutMs = input.timeoutMs ?? AMAP_REQUEST_TIMEOUT_MS
    const args = input.arguments
    const credential: AmapRuntimeCredential = {
      apiKey: input.apiKey,
      ...(input.privateKey ? { privateKey: input.privateKey } : {})
    }

    switch (input.name) {
      case 'geocode':
        return this.request(credential, '/v3/geocode/geo', {
          address: requiredString(args, 'address'),
          city: optionalString(args, 'city')
        }, timeoutMs)
      case 'reverseGeocode':
        return this.request(credential, '/v3/geocode/regeo', {
          location: requiredString(args, 'location'),
          radius: requiredInteger(args, 'radius'),
          poitype: optionalString(args, 'poitype'),
          extensions: 'all'
        }, timeoutMs)
      case 'placeText':
        return this.request(credential, '/v5/place/text', {
          keywords: optionalString(args, 'keywords'),
          types: optionalString(args, 'types'),
          region: optionalString(args, 'region'),
          city_limit: optionalBoolean(args, 'city_limit'),
          page_num: requiredInteger(args, 'page_num'),
          page_size: requiredInteger(args, 'page_size')
        }, timeoutMs)
      case 'placeAround':
        return this.request(credential, '/v5/place/around', {
          location: requiredString(args, 'location'),
          keywords: optionalString(args, 'keywords'),
          types: optionalString(args, 'types'),
          radius: requiredInteger(args, 'radius'),
          sortrule: requiredString(args, 'sortrule'),
          region: optionalString(args, 'region'),
          city_limit: optionalBoolean(args, 'city_limit'),
          page_num: requiredInteger(args, 'page_num'),
          page_size: requiredInteger(args, 'page_size')
        }, timeoutMs)
      case 'placeDetail':
        return this.request(credential, '/v5/place/detail', {
          id: requiredString(args, 'id'),
          show_fields: 'business,navi'
        }, timeoutMs)
      case 'directionDriving':
        return this.request(credential, '/v5/direction/driving', {
          ...routeQuery(args),
          origin_id: optionalString(args, 'origin_id'),
          destination_id: optionalString(args, 'destination_id'),
          strategy: requiredInteger(args, 'strategy'),
          waypoints: optionalString(args, 'waypoints'),
          alternative_route: requiredInteger(args, 'alternative_route'),
          show_fields: 'cost'
        }, timeoutMs, true)
      case 'directionTransit':
        return this.request(credential, '/v5/direction/transit/integrated', {
          ...routeQuery(args),
          originpoi: optionalString(args, 'originpoi'),
          destinationpoi: optionalString(args, 'destinationpoi'),
          city1: requiredString(args, 'city1'),
          city2: requiredString(args, 'city2'),
          strategy: requiredInteger(args, 'strategy'),
          AlternativeRoute: requiredInteger(args, 'AlternativeRoute'),
          nightflag: requiredInteger(args, 'nightflag'),
          show_fields: 'cost'
        }, timeoutMs)
      case 'directionWalking':
        return this.request(credential, '/v5/direction/walking', {
          ...routeQuery(args),
          origin_id: optionalString(args, 'origin_id'),
          destination_id: optionalString(args, 'destination_id'),
          alternative_route: requiredInteger(args, 'alternative_route'),
          isindoor: requiredInteger(args, 'isindoor'),
          show_fields: 'cost'
        }, timeoutMs)
      case 'directionBicycling':
        return this.request(credential, '/v5/direction/bicycling', {
          ...routeQuery(args),
          alternative_route: requiredInteger(args, 'alternative_route'),
          show_fields: 'cost'
        }, timeoutMs)
      case 'distance':
        return this.request(credential, '/v3/distance', {
          origins: requiredString(args, 'origins'),
          destination: requiredString(args, 'destination'),
          type: requiredInteger(args, 'type')
        }, timeoutMs)
      case 'weather':
        return this.request(credential, '/v3/weather/weatherInfo', {
          city: requiredString(args, 'city'),
          extensions: requiredString(args, 'extensions')
        }, timeoutMs)
      case 'ipLocation':
        return this.request(credential, '/v3/ip', { ip: requiredString(args, 'ip') }, timeoutMs)
      default:
        return unsupportedOperation(input.name)
    }
  }

  private async request(
    credential: AmapRuntimeCredential,
    path: string,
    query: Query,
    timeoutMs: number,
    allowPost = false
  ): Promise<AmapWebServicePayload> {
    const parameters = buildAmapParameters(query, credential)
    const encoded = new URLSearchParams(parameters)
    const getUrl = new URL(path, AMAP_WEBSERVICE_ORIGIN)
    getUrl.search = encoded.toString()
    const usePost = Buffer.byteLength(getUrl.toString(), 'utf8') > AMAP_REQUEST_URL_MAX_BYTES
    if (usePost && !allowPost) {
      throw new AmapConnectorError('INVALID_ARGUMENT', 'AMap request exceeds the supported URL size.')
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(usePost ? new URL(path, AMAP_WEBSERVICE_ORIGIN) : getUrl, {
        method: usePost ? 'POST' : 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Xpert-AMap-Connector/0.1.0',
          ...(usePost ? { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } : {})
        },
        ...(usePost ? { body: encoded.toString() } : {}),
        redirect: 'error',
        signal: controller.signal
      })
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined)
        throw httpStatusError(response.status)
      }
      return assertAmapSuccess(await readBoundedJson(response, AMAP_RESPONSE_MAX_BYTES))
    } finally {
      clearTimeout(timeout)
    }
  }
}

export function signAmapParameters(parameters: Record<string, string>, privateKey: string): string {
  const canonical = Object.entries(parameters)
    .filter(([name]) => name !== 'sig')
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([name, value]) => `${name}=${value}`)
    .join('&')
  return createHash('md5').update(canonical + privateKey, 'utf8').digest('hex')
}

function buildAmapParameters(query: Query, credential: AmapRuntimeCredential): Record<string, string> {
  const parameters: Record<string, string> = {}
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined) parameters[name] = String(value)
  }
  parameters.output = 'json'
  parameters.key = credential.apiKey
  if (credential.privateKey) parameters.sig = signAmapParameters(parameters, credential.privateKey)
  return parameters
}

async function readBoundedJson(response: Response, maxBytes: number): Promise<AmapWebServicePayload> {
  const contentLength = readContentLength(response.headers.get('content-length'))
  if (contentLength !== undefined && contentLength > maxBytes) throw responseTooLargeError()
  if (!response.body) throw invalidResponseError('AMap returned an empty response body.')

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
    if (!isRecord(parsed)) throw invalidResponseError('AMap returned a non-object JSON response.')
    return parsed
  } catch (error) {
    if (error instanceof AmapConnectorError) throw error
    throw invalidResponseError('AMap returned invalid JSON.')
  }
}

function routeQuery(args: Record<string, unknown>): Query {
  return {
    origin: requiredString(args, 'origin'),
    destination: requiredString(args, 'destination')
  }
}

function requiredString(args: Record<string, unknown>, name: string): string {
  const value = optionalString(args, name)
  if (!value) throw new AmapConnectorError('INVALID_ARGUMENT', `AMap argument '${name}' is required.`)
  return value
}

function optionalString(args: Record<string, unknown>, name: string): string | undefined {
  const value = args[name]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function requiredInteger(args: Record<string, unknown>, name: string): number {
  const value = args[name]
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  throw new AmapConnectorError('INVALID_ARGUMENT', `AMap argument '${name}' must be an integer.`)
}

function optionalBoolean(args: Record<string, unknown>, name: string): boolean | undefined {
  const value = args[name]
  if (value === undefined) return undefined
  if (typeof value === 'boolean') return value
  throw new AmapConnectorError('INVALID_ARGUMENT', `AMap argument '${name}' must be a boolean.`)
}

function readContentLength(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

function httpStatusError(status: number): AmapConnectorError {
  if (status === 401) return new AmapConnectorError('CREDENTIAL_INVALID', 'AMap rejected the Web Service Key.')
  if (status === 403) return new AmapConnectorError('PERMISSION_DENIED', 'AMap denied Web Service access.')
  if (status === 429) return new AmapConnectorError('QUOTA_EXCEEDED', 'AMap request quota was exceeded.')
  if (status === 502 || status === 503 || status === 504) {
    return new AmapConnectorError('UPSTREAM_UNAVAILABLE', `AMap is unavailable (HTTP ${status}).`, true)
  }
  if (status >= 500) return new AmapConnectorError('UPSTREAM_UNAVAILABLE', `AMap failed (HTTP ${status}).`)
  return new AmapConnectorError('UPSTREAM_REQUEST_FAILED', `AMap rejected the HTTP request (HTTP ${status}).`)
}

function normalizeWebServiceError(error: unknown): AmapConnectorError {
  if (error instanceof AmapConnectorError) return error
  if (error instanceof Error && error.name === 'AbortError') {
    return new AmapConnectorError('UPSTREAM_TIMEOUT', 'AMap request timed out.', true)
  }
  const message = errorMessage(error)
  if (/timeout|timed out/i.test(message)) {
    return new AmapConnectorError('UPSTREAM_TIMEOUT', 'AMap request timed out.', true)
  }
  return new AmapConnectorError('UPSTREAM_UNAVAILABLE', `AMap Web Service request failed: ${message}`, true)
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function responseTooLargeError(): AmapConnectorError {
  return new AmapConnectorError('RESPONSE_TOO_LARGE', 'AMap response exceeded the 1 MiB connector limit.')
}

function invalidResponseError(message: string): AmapConnectorError {
  return new AmapConnectorError('UPSTREAM_RESPONSE_INVALID', message)
}

function unsupportedOperation(value: never): never {
  throw new AmapConnectorError('CONFIGURATION_INVALID', `Unsupported AMap operation '${String(value)}'.`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
