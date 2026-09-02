import { BaiduNetdiskConnectorError, isRecord } from '../errors.js'

export async function readBoundedJsonObject(
  response: Response,
  maxBytes: number,
  source: string
): Promise<Record<string, unknown>> {
  const declaredLength = readContentLength(response.headers.get('content-length'))
  if (declaredLength !== undefined && declaredLength > maxBytes) throw tooLarge(source)
  if (!response.body) throw invalidJson(source)

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw tooLarge(source)
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (!isRecord(parsed)) throw new Error('Expected an object')
    return parsed
  } catch {
    throw invalidJson(source)
  }
}

function readContentLength(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

function tooLarge(source: string): BaiduNetdiskConnectorError {
  return new BaiduNetdiskConnectorError('RESPONSE_TOO_LARGE', `${source} response exceeded the connector limit.`)
}

function invalidJson(source: string): BaiduNetdiskConnectorError {
  return new BaiduNetdiskConnectorError('UPSTREAM_RESPONSE_INVALID', `${source} returned invalid JSON.`)
}
