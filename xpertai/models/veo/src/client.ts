import {
  ModelProviderHttpClient,
  type ModelProviderHttpResponse
} from '@xpert-ai/plugin-sdk/model-provider-http-client'
import {
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
    return this.requestJson(
      `/${validateVeoOperationName(operationName)}`,
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
