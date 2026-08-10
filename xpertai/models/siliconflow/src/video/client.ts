import { getBaseUrlFromCredentials, type SiliconflowCredentials } from '../types.js'
import {
  SiliconflowVideoDefaultBaseUrl,
  type SiliconflowVideoCredentials,
  type SiliconflowVideoGenerationPayload,
  type SiliconflowVideoResult,
  type SiliconflowVideoTask
} from './types.js'

const REQUEST_TIMEOUT_MS = 30_000
const DOWNLOAD_TIMEOUT_MS = 120_000
const MAX_VIDEO_BYTES = 512 * 1024 * 1024

export class SiliconflowVideoClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly fetchImpl: typeof fetch

  constructor(credentials: SiliconflowVideoCredentials, fetchImpl: typeof fetch = fetch) {
    const apiKey = credentials.api_key?.trim()
    if (!apiKey) {
      throw new Error('SiliconFlow API key is missing')
    }

    const configuredBaseUrl = credentials.endpoint_url || SiliconflowVideoDefaultBaseUrl
    const baseUrl = configuredBaseUrl === SiliconflowVideoDefaultBaseUrl
      ? getBaseUrlFromCredentials(credentials as SiliconflowCredentials)
      : configuredBaseUrl.replace(/\/$/, '')
    const parsedBaseUrl = new URL(baseUrl)
    if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) {
      throw new Error('SiliconFlow endpoint URL must use HTTP or HTTPS')
    }

    this.apiKey = apiKey
    this.baseUrl = baseUrl
    this.fetchImpl = fetchImpl
  }

  async submitVideo(payload: SiliconflowVideoGenerationPayload): Promise<SiliconflowVideoTask> {
    return this.requestJson('/video/submit', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  }

  async getVideoTask(requestId: string): Promise<SiliconflowVideoTask> {
    return this.requestJson('/video/status', {
      method: 'POST',
      body: JSON.stringify({ requestId })
    })
  }

  async downloadBuffer(url: string): Promise<{ buffer: Buffer; mimeType?: string }> {
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol !== 'https:') {
      throw new Error('Generated video URL must use HTTPS')
    }

    const response = await this.fetchWithTimeout(url, { method: 'GET' }, DOWNLOAD_TIMEOUT_MS)
    if (!response.ok) {
      throw new Error(`Failed to download generated video: ${response.status} ${response.statusText}`)
    }

    const contentLength = response.headers.get('content-length')
    if (contentLength && Number(contentLength) > MAX_VIDEO_BYTES) {
      throw new Error('Generated video exceeds the 512MB limit')
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > MAX_VIDEO_BYTES) {
      throw new Error('Generated video exceeds the 512MB limit')
    }

    return {
      buffer,
      mimeType: response.headers.get('content-type')?.split(';')[0]?.trim() || 'video/mp4'
    }
  }

  private async requestJson(path: string, init: RequestInit): Promise<SiliconflowVideoTask> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {})
      }
    }, REQUEST_TIMEOUT_MS)

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`SiliconFlow API error ${response.status}: ${text || response.statusText}`)
    }

    return parseVideoTask(await response.json())
  }

  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal })
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`SiliconFlow request timed out after ${timeoutMs}ms`)
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
}

function parseVideoTask(value: unknown): SiliconflowVideoTask {
  if (!isRecord(value)) {
    throw new Error('SiliconFlow returned an invalid video task response')
  }

  const results = isRecord(value.results) ? value.results : {}
  const videos = Array.isArray(results.videos) ? results.videos.filter(isVideoResult) : []

  return {
    requestId: readString(value.requestId) || readString(value.request_id),
    status: readString(value.status),
    reason: readString(value.reason),
    results: {
      videos,
      seed: readNumber(results.seed),
      inference: readNumber(results.timings && isRecord(results.timings) ? results.timings.inference : undefined)
    }
  }
}

function isVideoResult(value: unknown): value is SiliconflowVideoResult {
  return isRecord(value) && (value.url === undefined || typeof value.url === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
