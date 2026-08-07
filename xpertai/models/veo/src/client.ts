import {
  VeoApiBaseUrl,
  type VeoCredentials,
  type VeoModel,
  type VeoOperation
} from './types.js'

const MAX_DOWNLOAD_BYTES = 500 * 1024 * 1024
const MAX_REDIRECTS = 5

export class GeminiVeoClient {
  private readonly apiKey: string
  private readonly fetchImpl: typeof fetch

  constructor(credentials: VeoCredentials, fetchImpl: typeof fetch = fetch) {
    const apiKey = credentials.gemini_api_key?.trim()
    if (!apiKey) {
      throw new Error('Gemini API key is missing')
    }
    this.apiKey = apiKey
    this.fetchImpl = fetchImpl
  }

  async submit(
    model: VeoModel,
    payload: Record<string, unknown>
  ): Promise<VeoOperation> {
    return this.requestJson(
      `${VeoApiBaseUrl}/models/${encodeURIComponent(model)}:predictLongRunning`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    )
  }

  async getOperation(operationName: string): Promise<VeoOperation> {
    return this.requestJson(
      `${VeoApiBaseUrl}/${validateVeoOperationName(operationName)}`,
      { method: 'GET' }
    )
  }

  async downloadVideo(uri: string): Promise<{ buffer: Buffer; mimeType: string }> {
    let currentUrl = validateDownloadUrl(uri, true)
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const includeApiKey = currentUrl.hostname === 'generativelanguage.googleapis.com'
      const response = await this.fetchImpl(currentUrl, {
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
      const declaredLength = Number(response.headers.get('content-length'))
      if (Number.isFinite(declaredLength) && declaredLength > MAX_DOWNLOAD_BYTES) {
        throw new Error('Veo video exceeds the 500MB download safety limit')
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.length > MAX_DOWNLOAD_BYTES) {
        throw new Error('Veo video exceeds the 500MB download safety limit')
      }
      return {
        buffer,
        mimeType:
          response.headers.get('content-type')?.split(';')[0]?.trim() ||
          'video/mp4'
      }
    }
    throw new Error('Veo video download exceeded the redirect limit')
  }

  private async requestJson(
    url: string,
    init: RequestInit
  ): Promise<VeoOperation> {
    const response = await this.fetchImpl(url, {
      ...init,
      headers: {
        'x-goog-api-key': this.apiKey,
        'Content-Type': 'application/json',
        ...(init.headers ?? {})
      }
    })
    if (!response.ok) {
      throw new Error(
        `Gemini Veo API error ${response.status}: ${await readSafeProviderError(response)}`
      )
    }
    return (await response.json()) as VeoOperation
  }
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

async function readSafeProviderError(response: Response) {
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
