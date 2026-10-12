import { createHash } from 'node:crypto'
import type { MapProviderId } from '../contracts.js'
import { MapProviderError, type MapCredential, type MapHttpOptions } from './types.js'

const origins = { amap: 'https://restapi.amap.com', tencent: 'https://apis.map.qq.com' } as const
const paths = {
  amap: ['/v5/place/text', '/v5/place/around', '/v5/place/detail', '/v5/direction/driving', '/v5/direction/walking', '/v3/staticmap'],
  tencent: ['/ws/place/v1/search', '/ws/place/v1/detail', '/ws/direction/v1/driving/', '/ws/direction/v1/walking/', '/ws/staticmap/v2/']
}
export type MapQuery = Record<string, string | number | undefined>
export function signParameters(provider: MapProviderId, path: string, query: Record<string, string>, privateKey: string): string {
  const canonical = Object.keys(query).filter((key) => key !== 'sig').sort().map((key) => `${key}=${query[key]}`).join('&')
  return createHash('md5').update((provider === 'tencent' ? `${path}?` : '') + canonical + privateKey).digest('hex')
}

/** Only adapter-owned paths can reach the network. Errors never include a credential-bearing URL. */
export class MapHttpClient {
  private readonly fetcher: typeof globalThis.fetch
  private readonly timeoutMs: number
  constructor(options: MapHttpOptions = {}) {
    this.fetcher = options.fetch ?? globalThis.fetch
    this.timeoutMs = Math.max(1, Math.min(options.timeoutMs ?? 15000, 30000))
  }
  async json(provider: MapProviderId, path: string, query: MapQuery, credential: MapCredential, signal?: AbortSignal): Promise<unknown> {
    const { bytes } = await this.request(provider, path, { ...query, output: 'json' }, credential, false, signal)
    try { return JSON.parse(bytes.toString('utf8')) as unknown } catch { throw new MapProviderError('RESPONSE_INVALID', 'Map provider returned invalid JSON.') }
  }
  async image(provider: MapProviderId, path: string, query: MapQuery, credential: MapCredential, signal?: AbortSignal): Promise<string> {
    const { bytes, contentType } = await this.request(provider, path, query, credential, true, signal)
    const png = contentType === 'image/png' && bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString('ascii', 12, 16) === 'IHDR'
    const jpeg = contentType === 'image/jpeg' && bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217
    if (!png && !jpeg) throw new MapProviderError('RESPONSE_INVALID', 'Map provider did not return a valid PNG or JPEG image. Check static-map access for the credential.')
    if (png && (bytes.readUInt32BE(16) > 2048 || bytes.readUInt32BE(20) > 2048 || !bytes.readUInt32BE(16) || !bytes.readUInt32BE(20))) {
      throw new MapProviderError('RESPONSE_INVALID', 'Map image dimensions exceed the supported range.')
    }
    return `data:${contentType};base64,${bytes.toString('base64')}`
  }
  private async request(provider: MapProviderId, path: string, query: MapQuery, credential: MapCredential, image: boolean, callerSignal?: AbortSignal): Promise<{ bytes: Buffer; contentType: string }> {
    if (!paths[provider].includes(path)) throw new MapProviderError('REQUEST_FAILED', 'Unsupported map provider operation.')
    if (!credential?.apiKey || credential.apiKey.length > 300 || (credential.privateKey?.length ?? 0) > 300) throw new MapProviderError('CREDENTIAL_INVALID', 'A valid map provider credential is required.')
    if (callerSignal?.aborted) throw new MapProviderError('CANCELLED', 'Map request was cancelled.')
    const params: Record<string, string> = { key: credential.apiKey }
    for (const [key, value] of Object.entries(query)) if (value !== undefined) params[key] = String(value)
    if (credential.privateKey) params.sig = signParameters(provider, path, params, credential.privateKey)
    const url = new URL(path, origins[provider])
    url.search = new URLSearchParams(params).toString()
    if (Buffer.byteLength(url.href) > 8192) throw new MapProviderError('REQUEST_FAILED', 'Map request exceeds the supported size.')
    const controller = new AbortController()
    const abort = () => controller.abort()
    callerSignal?.addEventListener('abort', abort, { once: true })
    const timeout = setTimeout(abort, this.timeoutMs)
    try {
      const response = await this.fetcher(url, {
        method: 'GET', redirect: 'error', signal: controller.signal,
        headers: { Accept: image ? 'image/png,image/jpeg' : 'application/json', 'User-Agent': 'Xpert-Maps/0.1.0' }
      })
      if (!response.ok) {
        await response.body?.cancel()
        const code = response.status === 429 ? 'QUOTA_EXCEEDED' : response.status === 401 || response.status === 403 ? 'CREDENTIAL_INVALID' : 'REQUEST_FAILED'
        throw new MapProviderError(code, `Map provider rejected the request (HTTP ${response.status}).`)
      }
      const bytes = await readBounded(response, image ? 1500000 : 2097152)
      return { bytes, contentType: (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() }
    } catch (error) {
      if (error instanceof MapProviderError) throw error
      if (callerSignal?.aborted) throw new MapProviderError('CANCELLED', 'Map request was cancelled.')
      if (controller.signal.aborted) throw new MapProviderError('TIMEOUT', 'Map provider request timed out.')
      throw new MapProviderError('REQUEST_FAILED', 'Map provider request failed. Check connectivity and provider configuration.')
    } finally {
      clearTimeout(timeout)
      callerSignal?.removeEventListener('abort', abort)
    }
  }
}
async function readBounded(response: Response, limit: number): Promise<Buffer> {
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel()
    throw new MapProviderError('RESPONSE_TOO_LARGE', 'Map provider response exceeds the supported size.')
  }
  if (!response.body) throw new MapProviderError('RESPONSE_INVALID', 'Map provider returned an empty response.')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        await reader.cancel()
        throw new MapProviderError('RESPONSE_TOO_LARGE', 'Map provider response exceeds the supported size.')
      }
      chunks.push(value)
    }
    return Buffer.concat(chunks, size)
  } finally { reader.releaseLock() }
}
