import {
  ModelProviderHttpClient,
  type ModelProviderHttpResponse
} from '@xpert-ai/plugin-sdk/model-provider-http-client'
import {
  OmniModel,
  VeoApiBaseUrl,
  type VeoCredentials,
  type VeoModel,
  type VeoOperation
} from './types.js'

const MAX_DOWNLOAD_BYTES = 500 * 1024 * 1024
const MAX_REDIRECTS = 5

export class GeminiVeoClient extends ModelProviderHttpClient {
  private readonly apiKey: string

  constructor(credentials: VeoCredentials, fetchImpl: typeof fetch = fetch) {
    const apiKey = credentials.gemini_api_key?.trim()
    if (!apiKey) {
      throw new Error('Gemini API key is missing')
    }
    super({
      provider: 'Gemini Veo',
      baseUrl: VeoApiBaseUrl,
      defaultHeaders: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      fetchImpl
    })
    this.apiKey = apiKey
  }

  async submit(
    model: VeoModel,
    payload: Record<string, unknown>
  ): Promise<VeoOperation> {
    if (model === OmniModel) {
      return this.requestJson('/interactions', { method: 'POST', body: JSON.stringify(payload) }, parseOmniInteraction)
    }
    return this.requestJson(
      `/models/${encodeURIComponent(model)}:predictLongRunning`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      },
      parseVeoOperation
    )
  }

  async getOperation(operationName: string): Promise<VeoOperation> {
    const name = validateVeoOperationName(operationName)
    if (name.startsWith('interactions/')) {
      const operation = await this.requestJson('/' + name, { method: 'GET' }, parseOmniInteraction)
      const uri = operation.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri
      if (uri) {
        const file = await this.requestJson(uri.replace(/:download\?alt=media$/, ''), { method: 'GET' }, value => {
          if (!isRecord(value) || typeof value.state !== 'string') throw new Error('Invalid Gemini file response')
          return value
        })
        if (file.state === 'PROCESSING') return { name, done: false }
        if (file.state !== 'ACTIVE') return { name, done: true, error: { message: 'Gemini video file processing failed' } }
      }
      return operation
    }
    return this.requestJson(
      '/' + name,
      { method: 'GET' },
      parseVeoOperation
    )
  }

  async downloadVideo(uri: string): Promise<{ buffer: Buffer; mimeType: string }> {
    let currentUrl = validateDownloadUrl(uri, true)
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const includeApiKey = currentUrl.hostname === 'generativelanguage.googleapis.com'
      const response = await this.fetchResponse(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: includeApiKey ? { 'x-goog-api-key': this.apiKey } : undefined
      })
      if (isRedirect(response.status)) {
        const location = response.headers.get('location')
        if (!location || redirectCount === MAX_REDIRECTS) {
          throw new Error('Veo video download redirect is invalid')
        }
        currentUrl = validateDownloadUrl(new URL(location, currentUrl).toString(), false)
        continue
      }
      if (!response.ok) {
        throw new Error(`Veo video download failed with status ${response.status}`)
      }
      const result = await this.readBufferResponse(response, {
        maxBytes: MAX_DOWNLOAD_BYTES,
        maxBytesError: 'Veo video exceeds the 500MB download safety limit',
        defaultMimeType: 'video/mp4'
      })
      return {
        buffer: result.buffer,
        mimeType: result.mimeType ?? 'video/mp4'
      }
    }
    throw new Error('Veo video download exceeded the redirect limit')
  }

  protected override async createHttpError(response: ModelProviderHttpResponse): Promise<Error> {
    return new Error(`Gemini Veo API error ${response.status}: ${await readSafeProviderError(response)}`)
  }
}

function parseOmniInteraction(value: unknown): VeoOperation {
  if (!isRecord(value) || typeof value.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value.id)) {
    throw new Error('Gemini returned an invalid interaction ID')
  }
  const name = 'interactions/' + value.id
  if (value.status === 'in_progress' || value.status === 'queued') return { name, done: false }
  if (value.status !== 'completed') return { name, done: true, error: { message: 'Gemini interaction failed' } }
  const steps = Array.isArray(value.steps) ? value.steps : []
  const video = steps.filter(step => step?.type === 'model_output' && Array.isArray(step.content))
    .flatMap(step => step.content).find(part => part?.type === 'video')
  const uri = video?.uri
  const file = typeof uri === 'string' && /^(?:https:\/\/generativelanguage\.googleapis\.com\/v1beta\/)?files\/([A-Za-z0-9_-]+)(?::download\?alt=media)?$/.exec(uri)
  if (!file) return { name, done: true, error: { message: 'Gemini did not return a downloadable video file' } }
  const download = VeoApiBaseUrl + '/files/' + file[1] + ':download?alt=media'
  return { name, done: true, metadata: { usage: value.usage }, response: {
    generateVideoResponse: { generatedSamples: [{ video: { uri: download, mimeType: 'video/mp4' } }] }
  } }
}

function parseVeoOperation(value: unknown): VeoOperation {
  if (!isVeoOperation(value)) {
    throw new Error('Gemini Veo API returned an invalid operation response')
  }
  return value
}

function isVeoOperation(value: unknown): value is VeoOperation {
  if (!isRecord(value)) return false
  return (
    isOptionalString(value.name) &&
    (value.done === undefined || typeof value.done === 'boolean') &&
    (value.error === undefined || isRecord(value.error)) &&
    (value.metadata === undefined || isRecord(value.metadata)) &&
    (value.response === undefined || isRecord(value.response))
  )
}

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function validateVeoOperationName(value: string) {
  const name = value.trim()
  if (/^interactions\/[A-Za-z0-9_-]+$/.test(name)) return name
  const segment = '[A-Za-z0-9._~-]+'
  const operationPattern = new RegExp(
    `^(?:operations/${segment}|${segment}(?:/${segment})*/operations/${segment})$`
  )
  if (!operationPattern.test(name) || name.includes('..')) {
    throw new Error('Invalid Veo operation name')
  }
  return name
}

function validateDownloadUrl(value: string, requireGeminiHost: boolean) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Invalid Veo video download URI')
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Invalid Veo video download URI')
  }
  const isGemini = url.hostname === 'generativelanguage.googleapis.com'
  const isGoogleMedia =
    url.hostname === 'storage.googleapis.com' ||
    url.hostname.endsWith('.googleusercontent.com')
  if ((requireGeminiHost && !isGemini) || (!isGemini && !isGoogleMedia)) {
    throw new Error('Untrusted Veo video download host')
  }
  return url
}

async function readSafeProviderError(response: ModelProviderHttpResponse) {
  const raw = await response.text().catch(() => '')
  let message = raw
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: unknown; status?: unknown } }
    const providerMessage = parsed.error?.message
    const providerStatus = parsed.error?.status
    message =
      typeof providerMessage === 'string'
        ? providerMessage
        : typeof providerStatus === 'string'
          ? providerStatus
          : response.statusText
  } catch {
    message = raw || response.statusText
  }
  return message
    .replace(/https?:\/\/\S+/gi, '[redacted-url]')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 500)
}

function isRedirect(status: number) {
  return [301, 302, 303, 307, 308].includes(status)
}
