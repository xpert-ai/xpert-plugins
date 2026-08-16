import { ModelProviderHttpClient } from '@xpert-ai/plugin-sdk/model-provider-http-client'
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

export class SiliconflowVideoClient extends ModelProviderHttpClient {
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

    super({
      provider: 'SiliconFlow',
      baseUrl,
      defaultHeaders: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      fetchImpl,
      requestTimeoutMs: REQUEST_TIMEOUT_MS
    })
  }

  async submitVideo(payload: SiliconflowVideoGenerationPayload): Promise<SiliconflowVideoTask> {
    return this.requestJson(
      '/video/submit',
      { method: 'POST', body: JSON.stringify(payload) },
      parseVideoTask
    )
  }

  async getVideoTask(requestId: string): Promise<SiliconflowVideoTask> {
    return this.requestJson(
      '/video/status',
      { method: 'POST', body: JSON.stringify({ requestId }) },
      parseVideoTask
    )
  }

  async downloadBuffer(url: string): Promise<{ buffer: Buffer; mimeType?: string }> {
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol !== 'https:') {
      throw new Error('Generated video URL must use HTTPS')
    }

    const response = await this.fetchResponse(url, { method: 'GET' }, DOWNLOAD_TIMEOUT_MS)
    if (!response.ok) {
      throw new Error(`Failed to download generated video: ${response.status} ${response.statusText}`)
    }

    return this.readBufferResponse(response, {
      maxBytes: MAX_VIDEO_BYTES,
      maxBytesError: 'Generated video exceeds the 512MB limit',
      defaultMimeType: 'video/mp4'
    })
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
