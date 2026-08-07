import {
  KlingDefaultBaseUrl,
  type KlingCredentials,
  type KlingProviderTask,
  type KlingProviderTaskStatus
} from './types.js'

type ApiEnvelope = {
  code?: unknown
  message?: unknown
  request_id?: unknown
  data?: unknown
}

const TASK_STATUSES = new Set<KlingProviderTaskStatus>(['submitted', 'processing', 'succeeded', 'failed'])
const MAX_VIDEO_BYTES = 1024 * 1024 * 1024
const MAX_DOWNLOAD_REDIRECTS = 5

export class KlingClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly fetchImpl: typeof fetch

  constructor(credentials: KlingCredentials, fetchImpl: typeof fetch = fetch) {
    const apiKey = credentials.api_key?.trim()
    if (!apiKey) {
      throw new Error('Kling API key is missing')
    }
    this.apiKey = apiKey
    this.baseUrl = normalizeBaseUrl(credentials.api_endpoint_host || KlingDefaultBaseUrl)
    this.fetchImpl = fetchImpl
  }

  async createTask(path: string, payload: Record<string, unknown>): Promise<KlingProviderTask> {
    const response = await this.requestJson(`${this.baseUrl}${path}`, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
    return parseTask(response.data)
  }

  async queryTask(taskId: string): Promise<KlingProviderTask> {
    const response = await this.requestJson(
      `${this.baseUrl}/tasks?task_ids=${encodeURIComponent(taskId)}`,
      { method: 'GET' }
    )
    if (!Array.isArray(response.data)) {
      throw new Error('Kling API returned an invalid task list')
    }
    const tasks = response.data.map(parseTask)
    const task = tasks.find((item) => item.id === taskId) ?? tasks[0]
    if (!task) {
      throw new Error('Kling API did not return the requested task')
    }
    return task
  }

  async downloadBuffer(url: string): Promise<{ buffer: Buffer; mimeType?: string }> {
    let currentUrl = validatePublicHttpsUrl(url)
    for (
      let redirectCount = 0;
      redirectCount <= MAX_DOWNLOAD_REDIRECTS;
      redirectCount += 1
    ) {
      const response = await this.fetchImpl(currentUrl, {
        method: 'GET',
        redirect: 'manual'
      })
      if (isRedirect(response.status)) {
        const location = response.headers.get('location')
        if (!location || redirectCount === MAX_DOWNLOAD_REDIRECTS) {
          throw new Error('Kling result download redirect is invalid')
        }
        currentUrl = validatePublicHttpsUrl(
          new URL(location, currentUrl).toString()
        )
        continue
      }
      if (!response.ok) {
        throw new Error(`Kling result download failed (HTTP ${response.status})`)
      }
      const declaredSize = parsePositiveInteger(response.headers.get('content-length'))
      if (declaredSize && declaredSize > MAX_VIDEO_BYTES) {
        throw new Error('Kling result exceeds the 1 GiB download limit')
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.length > MAX_VIDEO_BYTES) {
        throw new Error('Kling result exceeds the 1 GiB download limit')
      }
      return {
        buffer,
        mimeType: response.headers.get('content-type')?.split(';')[0]?.trim() || undefined
      }
    }
    throw new Error('Kling result download exceeded the redirect limit')
  }

  private async requestJson(url: string, init: RequestInit): Promise<ApiEnvelope> {
    const response = await this.fetchImpl(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {})
      }
    })
    if (!response.ok) {
      throw new Error(`Kling API request failed (HTTP ${response.status})`)
    }

    const body = (await response.json()) as unknown
    if (!isRecord(body)) {
      throw new Error('Kling API returned an invalid response')
    }
    const envelope = body as ApiEnvelope
    if (typeof envelope.code === 'number' && envelope.code !== 0) {
      const providerMessage = typeof envelope.message === 'string' ? sanitizeMessage(envelope.message, this.apiKey) : ''
      throw new Error(`Kling API rejected the request (code ${envelope.code})${providerMessage ? `: ${providerMessage}` : ''}`)
    }
    return envelope
  }
}

function normalizeBaseUrl(value: string) {
  const parsed = new URL(value)
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('Kling API endpoint must use HTTPS')
  }
  return parsed.toString().replace(/\/$/, '')
}

function validatePublicHttpsUrl(value: string) {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('Kling result URL is invalid')
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    isPrivateHostname(parsed.hostname)
  ) {
    throw new Error('Kling result URL must use a public HTTPS host')
  }
  return parsed
}

function isPrivateHostname(value: string) {
  const hostname = value.replace(/^\[|\]$/gu, '').toLowerCase()
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    return true
  }
  if (hostname === '::1' || hostname.startsWith('fc') || hostname.startsWith('fd')) {
    return true
  }
  if (/^fe[89ab][0-9a-f]:/u.test(hostname)) return true
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(hostname)
  if (!match) return false
  const octets = match.slice(1).map(Number)
  if (octets.some((octet) => octet > 255)) return true
  const [first, second] = octets
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  )
}

function isRedirect(status: number) {
  return [301, 302, 303, 307, 308].includes(status)
}

function parseTask(value: unknown): KlingProviderTask {
  if (!isRecord(value)) {
    throw new Error('Kling API returned an invalid task')
  }
  const id = readString(value.id) ?? readString(value.task_id)
  const status = readString(value.status) as KlingProviderTaskStatus | undefined
  if (!id || !status || !TASK_STATUSES.has(status)) {
    throw new Error('Kling API returned an invalid task identity or status')
  }

  const outputs = parseOutputs(value.outputs ?? value.output)
  return {
    id,
    status,
    model: readString(value.model),
    createdAt: readNumber(value.create_time),
    updatedAt: readNumber(value.update_time),
    error: readProviderError(value),
    outputs
  }
}

function parseOutputs(value: unknown): KlingProviderTask['outputs'] {
  if (!Array.isArray(value)) return []
  const outputs: KlingProviderTask['outputs'] = []
  for (const item of value) {
    if (!isRecord(item) || item.type !== 'video') continue
    const url = readString(item.url)
    if (!url) continue
    outputs.push({
      type: 'video',
      id: readString(item.id),
      url,
      duration: readNumericValue(item.duration)
    })
  }
  return outputs
}

function readProviderError(value: Record<string, unknown>) {
  const error = value.error
  if (typeof error === 'string') return sanitizeMessage(error)
  if (isRecord(error)) {
    return sanitizeMessage(readString(error.message) ?? readString(error.code) ?? 'Video generation failed')
  }
  const message = readString(value.message)
  if (value.status === 'failed') return sanitizeMessage(message ?? 'Video generation failed')
  return undefined
}

function sanitizeMessage(message: string, secret?: string) {
  let sanitized = message.replace(/https?:\/\/\S+/giu, '[redacted-url]')
  if (secret) sanitized = sanitized.split(secret).join('[redacted]')
  return sanitized.replace(/[\r\n\t]+/gu, ' ').slice(0, 500).trim()
}

function parsePositiveInteger(value: string | null) {
  if (!value || !/^\d+$/u.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readNumericValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
