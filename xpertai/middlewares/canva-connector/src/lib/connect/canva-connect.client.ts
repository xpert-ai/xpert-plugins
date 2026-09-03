import { Injectable } from '@nestjs/common'
import { CANVA_CONNECT_REST_BASE_URL, CANVA_RESPONSE_MAX_BYTES } from '../constants.js'
import { CanvaConnectorError, errorMessage } from '../errors.js'
import { readRecord, type CanvaPayload } from '../mcp/canva-mappers.js'

@Injectable()
export class CanvaConnectClient {
  async call(input: {
    accessToken: string
    operation: string
    designId?: string
    arguments: Record<string, unknown>
  }): Promise<CanvaPayload> {
    const request = restRequest(input.operation, input.designId, input.arguments)
    try {
      const response = await fetch(request.url, {
        method: request.method,
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Xpert-Canva-Connector'
        },
        ...(request.body ? { body: JSON.stringify(request.body) } : {})
      })
      const text = await readBoundedText(response)
      let parsed: unknown = {}
      try {
        parsed = text.trim() ? JSON.parse(text) : {}
      } catch {
        parsed = {}
      }
      if (!response.ok)
        throw new CanvaConnectorError(
          response.status === 429 ? 'CANVA_RATE_LIMITED' : 'CANVA_MCP_TOOL_FAILED',
          `Canva Connect request returned HTTP ${response.status}`,
          response.status === 429
        )
      return readRecord(parsed) ?? {}
    } catch (error) {
      if (error instanceof CanvaConnectorError) throw error
      throw new CanvaConnectorError('CANVA_MCP_TOOL_FAILED', `Canva Connect request failed: ${errorMessage(error)}`)
    }
  }
}

function restRequest(operation: string, designId: string | undefined, args: Record<string, unknown>) {
  const id = encodeURIComponent(designId ?? '')
  switch (operation) {
    case 'search-designs':
      return {
        method: 'GET',
        url: `${CANVA_CONNECT_REST_BASE_URL}/designs?query=${encodeURIComponent(
          String(args.query ?? '')
        )}&page=${encodeURIComponent(String(args.page ?? 1))}&page_size=${encodeURIComponent(
          String(args.page_size ?? args.pageSize ?? 20)
        )}`
      }
    case 'get-design':
      return { method: 'GET', url: `${CANVA_CONNECT_REST_BASE_URL}/designs/${id}` }
    case 'get-design-pages':
      return { method: 'GET', url: `${CANVA_CONNECT_REST_BASE_URL}/designs/${id}/pages` }
    case 'get-design-content':
      return { method: 'GET', url: `${CANVA_CONNECT_REST_BASE_URL}/designs/${id}/content` }
    case 'get-export-formats':
      return { method: 'GET', url: `${CANVA_CONNECT_REST_BASE_URL}/designs/${id}/export-formats` }
    case 'export-design':
      return { method: 'POST', url: `${CANVA_CONNECT_REST_BASE_URL}/designs/${id}/export`, body: args }
    case 'import-design-from-url':
      return { method: 'POST', url: `${CANVA_CONNECT_REST_BASE_URL}/imports`, body: args }
    default:
      throw new CanvaConnectorError(
        'CANVA_TOOL_UNAVAILABLE',
        `Canva Connect operation '${operation}' is not supported by the REST fallback`
      )
  }
}

async function readBoundedText(response: Response) {
  const declaredLength = Number(response.headers.get('content-length') ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > CANVA_RESPONSE_MAX_BYTES) {
    throw new CanvaConnectorError('CANVA_RESPONSE_TOO_LARGE', 'Canva Connect response exceeds the allowed size')
  }

  const reader = response.body?.getReader()
  if (!reader) {
    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > CANVA_RESPONSE_MAX_BYTES) {
      throw new CanvaConnectorError('CANVA_RESPONSE_TOO_LARGE', 'Canva Connect response exceeds the allowed size')
    }
    return text
  }

  const chunks: Uint8Array[] = []
  let received = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > CANVA_RESPONSE_MAX_BYTES) {
        await reader.cancel()
        throw new CanvaConnectorError('CANVA_RESPONSE_TOO_LARGE', 'Canva Connect response exceeds the allowed size')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8')
}
