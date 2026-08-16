import { ModelProviderHttpClient } from '@xpert-ai/plugin-sdk/model-provider-http-client'
import {
  SeedreamAigcDefaultBaseUrl,
  type SeedanceVideoTask,
  type SeedanceVideoUsage,
  type SeedreamAigcCredentials,
  type SeedreamImageResponse
} from './types.js'

export class SeedreamArkClient extends ModelProviderHttpClient {
  constructor(credentials: SeedreamAigcCredentials, fetchImpl: typeof fetch = fetch) {
    if (!credentials.ark_api_key) {
      throw new Error('Ark API key is missing')
    }
    super({
      provider: 'Ark',
      baseUrl: credentials.api_endpoint_host || SeedreamAigcDefaultBaseUrl,
      defaultHeaders: {
        Authorization: `Bearer ${credentials.ark_api_key}`,
        'Content-Type': 'application/json'
      },
      fetchImpl
    })
  }

  async generateImages(payload: Record<string, unknown>): Promise<SeedreamImageResponse> {
    return this.requestJson(
      '/images/generations',
      { method: 'POST', body: JSON.stringify(payload) },
      parseImageResponse
    )
  }

  async createVideoTask(payload: Record<string, unknown>): Promise<SeedanceVideoTask> {
    return this.requestJson(
      '/contents/generations/tasks',
      { method: 'POST', body: JSON.stringify(payload) },
      parseVideoTask
    )
  }

  async getVideoTask(taskId: string): Promise<SeedanceVideoTask> {
    return this.requestJson(
      `/contents/generations/tasks/${encodeURIComponent(taskId)}`,
      { method: 'GET' },
      parseVideoTask
    )
  }

  async downloadBuffer(url: string): Promise<{ buffer: Buffer; mimeType?: string }> {
    const response = await this.fetchResponse(url, { method: 'GET' })
    if (!response.ok) {
      throw new Error(`Failed to download generated asset: ${response.status} ${response.statusText}`)
    }
    return this.readBufferResponse(response)
  }
}

function parseImageResponse(value: unknown): SeedreamImageResponse {
  if (!isRecord(value)) throw new Error('Ark API returned an invalid image generation response')
  return {
    ...value,
    id: value.id,
    request_id: value.request_id,
    usage: value.usage,
    data: value.data
  }
}

function parseVideoTask(value: unknown): SeedanceVideoTask {
  if (!isRecord(value)) throw new Error('Ark API returned an invalid video task response')
  const content = isRecord(value.content) ? value.content : undefined
  return {
    id: readString(value.id),
    status: readString(value.status),
    model: readString(value.model),
    content: content
      ? {
          video_url: readString(content.video_url),
          last_frame_url: readString(content.last_frame_url)
        }
      : undefined,
    error: value.error,
    usage: parseUsage(value.usage)
  }
}

function parseUsage(value: unknown): SeedanceVideoUsage | undefined {
  if (!isRecord(value)) return undefined
  const usage: SeedanceVideoUsage = {}
  const promptTokens = readTokenCount(value.prompt_tokens)
  const completionTokens = readTokenCount(value.completion_tokens)
  const totalTokens = readTokenCount(value.total_tokens)
  if (promptTokens !== undefined) usage.prompt_tokens = promptTokens
  if (completionTokens !== undefined) usage.completion_tokens = completionTokens
  if (totalTokens !== undefined) usage.total_tokens = totalTokens
  return Object.keys(usage).length ? usage : undefined
}

function readTokenCount(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
