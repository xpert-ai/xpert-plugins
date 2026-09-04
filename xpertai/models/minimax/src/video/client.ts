import { ModelProviderHttpClient } from '@xpert-ai/plugin-sdk/model-provider-http-client'
import type { MiniMaxCredentials } from '../types.js'
import type { MiniMaxVideoGenerationPayload, MiniMaxVideoTask } from './types.js'

const MAX_VIDEO_BYTES = 1024 * 1024 * 1024

export class MiniMaxVideoClient extends ModelProviderHttpClient {
  constructor(credentials: MiniMaxCredentials, fetchImpl: typeof fetch = fetch) {
    const apiKey = credentials.api_key?.trim()
    if (!apiKey) throw new Error('MiniMax API key is missing')
    super({
      provider: 'MiniMax',
      baseUrl: normalizeApiRoot(credentials.base_url || 'https://api.minimax.cn'),
      defaultHeaders: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      fetchImpl,
      requestTimeoutMs: 30_000
    })
  }

  async submitVideo(payload: MiniMaxVideoGenerationPayload): Promise<MiniMaxVideoTask> {
    return this.requestJson(
      '/v2/video_generation',
      { method: 'POST', body: JSON.stringify(payload) },
      parseSubmission
    )
  }

  async queryVideo(taskId: string): Promise<MiniMaxVideoTask> {
    return this.requestJson(
      `/v2/query/video_generation/${encodeURIComponent(taskId)}`,
      { method: 'GET' },
      parseTaskResponse
    )
  }

  async downloadBuffer(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const parsed = validatePublicHttpsUrl(url)
    const response = await this.fetchResponse(parsed, { method: 'GET' }, 120_000)
    if (!response.ok) throw new Error(`MiniMax video download failed (HTTP ${response.status})`)
    const result = await this.readBufferResponse(response, {
      maxBytes: MAX_VIDEO_BYTES,
      maxBytesError: 'MiniMax video exceeds the 1 GiB download limit',
      defaultMimeType: 'video/mp4'
    })
    return { buffer: result.buffer, mimeType: result.mimeType || 'video/mp4' }
  }
}

function normalizeApiRoot(value: string) {
  const parsed = new URL(value)
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('MiniMax API endpoint must use HTTPS')
  }
  parsed.pathname = parsed.pathname.replace(/\/(?:v1|v2)\/?$/u, '').replace(/\/$/u, '')
  return parsed.toString().replace(/\/$/u, '')
}

function parseSubmission(value: unknown): MiniMaxVideoTask {
  if (!isRecord(value)) throw new Error('MiniMax returned an invalid video submission')
  const id = readString(value.task_id)
  if (!id) throw new Error('MiniMax did not return a video task ID')
  return { id, status: 'queued' }
}

function parseTaskResponse(value: unknown): MiniMaxVideoTask {
  if (!isRecord(value) || !isRecord(value.task)) {
    throw new Error('MiniMax returned an invalid video task')
  }
  const task = value.task
  const id = readString(task.id)
  const status = readStatus(task.status)
  if (!id || !status) throw new Error('MiniMax returned an invalid video task identity or status')
  const content = isRecord(task.content) ? { url: readString(task.content.url) } : undefined
  const error = isRecord(task.error)
    ? { code: readString(task.error.code), message: readString(task.error.message) }
    : undefined
  const usage = isRecord(task.usage)
    ? {
        total_seconds: readNumber(task.usage.total_seconds),
        input_seconds: readNumber(task.usage.input_seconds),
        output_seconds: readNumber(task.usage.output_seconds),
        input_image_count: readNumber(task.usage.input_image_count)
      }
    : undefined
  return {
    id,
    status,
    model: readString(task.model),
    content,
    resolution: readString(task.resolution),
    duration: readNumber(task.duration),
    ratio: readString(task.ratio),
    usage,
    error
  }
}

function readStatus(value: unknown): MiniMaxVideoTask['status'] | undefined {
  return ['queued', 'running', 'succeeded', 'failed', 'cancelled'].includes(String(value))
    ? (value as MiniMaxVideoTask['status'])
    : undefined
}

function validatePublicHttpsUrl(value: string) {
  const parsed = new URL(value)
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || isPrivateHostname(parsed.hostname)) {
    throw new Error('MiniMax result URL must use a public HTTPS host')
  }
  return parsed
}

function isPrivateHostname(value: string) {
  const hostname = value.toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) return true
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(hostname)
  if (!match) return hostname === '::1'
  const [first, second] = match.slice(1).map(Number)
  return first === 10 || first === 127 || first === 0 ||
    (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) || first >= 224
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
