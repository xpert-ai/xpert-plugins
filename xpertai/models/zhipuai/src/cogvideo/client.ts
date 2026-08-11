import {
  ZhipuCogVideoDefaultBaseUrl,
  type ZhipuCogVideoCredentials,
  type ZhipuVideoGenerationPayload,
  type ZhipuVideoTask
} from './types.js'

const REQUEST_TIMEOUT_MS = 30_000
const DOWNLOAD_TIMEOUT_MS = 120_000
const MAX_VIDEO_BYTES = 512 * 1024 * 1024

export class ZhipuCogVideoClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly fetchImpl: typeof fetch

  constructor(credentials: ZhipuCogVideoCredentials, fetchImpl: typeof fetch = fetch) {
    const apiKey = credentials.api_key?.trim()
    if (!apiKey) {
      throw new Error('ZhipuAI API key is missing')
    }

    const baseUrl = (credentials.endpoint_url || ZhipuCogVideoDefaultBaseUrl).replace(/\/$/, '')
    const parsedBaseUrl = new URL(baseUrl)
    if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) {
      throw new Error('ZhipuAI endpoint URL must use HTTP or HTTPS')
    }

    this.apiKey = apiKey
    this.baseUrl = baseUrl
    this.fetchImpl = fetchImpl
  }

  async submitVideo(payload: ZhipuVideoGenerationPayload): Promise<ZhipuVideoTask> {
    return this.requestJson('/videos/generations', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  }

  async getVideoTask(taskId: string): Promise<ZhipuVideoTask> {
    return this.requestJson(`/async-result/${encodeURIComponent(taskId)}`, { method: 'GET' })
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
      mimeType: response.headers.get('content-type')?.split(';')[0]?.trim() || undefined
    }
  }

  private async requestJson(path: string, init: RequestInit): Promise<ZhipuVideoTask> {
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
      throw new Error(`ZhipuAI API error ${response.status}: ${text || response.statusText}`)
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
        throw new Error(`ZhipuAI request timed out after ${timeoutMs}ms`)
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
}

function parseVideoTask(value: unknown): ZhipuVideoTask {
  if (!isRecord(value)) {
    throw new Error('ZhipuAI returned an invalid video task response')
  }

  const results = Array.isArray(value.video_result)
    ? value.video_result.filter(isVideoResult)
    : []

  return {
    id: readString(value.id),
    model: readString(value.model),
    video_result: results,
    task_status: readString(value.task_status),
    request_id: readString(value.request_id),
    error: value.error
  }
}

function isVideoResult(value: unknown): value is { url?: string; cover_image_url?: string } {
  return isRecord(value) && (
    value.url === undefined || typeof value.url === 'string'
  ) && (
    value.cover_image_url === undefined || typeof value.cover_image_url === 'string'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}
