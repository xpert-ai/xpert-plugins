import { SeedreamAigcDefaultBaseUrl, type SeedreamAigcCredentials } from './types.js'

export class SeedreamArkClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly fetchImpl: typeof fetch

  constructor(credentials: SeedreamAigcCredentials, fetchImpl: typeof fetch = fetch) {
    if (!credentials.ark_api_key) {
      throw new Error('Ark API key is missing')
    }
    this.apiKey = credentials.ark_api_key
    this.baseUrl = (credentials.api_endpoint_host || SeedreamAigcDefaultBaseUrl).replace(/\/$/, '')
    this.fetchImpl = fetchImpl
  }

  async generateImages(payload: Record<string, unknown>): Promise<any> {
    return this.postJson(`${this.baseUrl}/images/generations`, payload)
  }

  async createVideoTask(payload: Record<string, unknown>): Promise<any> {
    return this.postJson(`${this.baseUrl}/contents/generations/tasks`, payload)
  }

  async getVideoTask(taskId: string): Promise<any> {
    return this.requestJson(`${this.baseUrl}/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
      method: 'GET'
    })
  }

  async downloadBuffer(url: string): Promise<{ buffer: Buffer; mimeType?: string }> {
    const response = await this.fetchImpl(url, { method: 'GET' })
    if (!response.ok) {
      throw new Error(`Failed to download generated asset: ${response.status} ${response.statusText}`)
    }
    const arrayBuffer = await response.arrayBuffer()
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType: response.headers.get('content-type')?.split(';')[0]?.trim() || undefined
    }
  }

  private async postJson(url: string, payload: Record<string, unknown>): Promise<any> {
    return this.requestJson(url, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  }

  private async requestJson(url: string, init: RequestInit): Promise<any> {
    const response = await this.fetchImpl(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {})
      }
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Ark API error ${response.status}: ${text || response.statusText}`)
    }
    return response.json()
  }
}
