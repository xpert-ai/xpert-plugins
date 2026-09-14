import axios from 'axios'
import { z } from 'zod'

type TransferStage = 'file upload' | 'result download' | 'source download'

const remoteFailureSchema = z.object({
  code: z.union([z.string(), z.number()]).optional(),
  message: z.string().optional(),
  msg: z.string().optional(),
  request_id: z.string().optional(),
  trace_id: z.string().optional()
})

/** Keep transfer failures useful in the host's message-only job log, without logging credentials or signed URLs. */
export async function withMinerUTransferError<T>(stage: TransferStage, url: string, request: () => Promise<T>): Promise<T> {
  try {
    return await request()
  } catch (error) {
    if (!axios.isAxiosError(error)) throw error
    const remote = readRemoteFailure(error.response?.data)
    const tags = [
      error.response?.status ? `HTTP ${error.response.status}` : undefined,
      `host=${requestHost(url)}`,
      remote.code ? `code=${safeDetail(String(remote.code))}` : error.code ? `code=${error.code}` : undefined,
      remote.requestId ? `requestId=${safeDetail(remote.requestId)}` : undefined
    ].filter(Boolean)
    // Do not attach the Axios error: its config contains signed query parameters and request headers.
    throw new Error(`MinerU ${stage} failed: ${safeDetail(remote.message || error.message)} [${tags.join(', ')}]`)
  }
}

function readRemoteFailure(data: unknown): { code?: string | number; message?: string; requestId?: string } {
  if (Buffer.isBuffer(data)) data = data.subarray(0, 16_384).toString('utf8')
  else if (data instanceof ArrayBuffer) data = Buffer.from(data, 0, Math.min(data.byteLength, 16_384)).toString('utf8')
  if (typeof data === 'string') {
    const text = data.slice(0, 16_384)
    // OSS uses XML. Read only diagnostic fields; never include SignatureProvided, StringToSign, or the whole body.
    const code = xmlField(text, 'Code')
    if (code) return { code, message: xmlField(text, 'Message'), requestId: xmlField(text, 'RequestId') }
    try {
      data = JSON.parse(text)
    } catch {
      return {}
    }
  }
  const parsed = remoteFailureSchema.safeParse(data)
  if (!parsed.success) return {}
  return {
    code: parsed.data.code,
    message: parsed.data.message || parsed.data.msg,
    requestId: parsed.data.request_id || parsed.data.trace_id
  }
}

function xmlField(text: string, name: 'Code' | 'Message' | 'RequestId'): string | undefined {
  return new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(text)?.[1]
}

function requestHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return 'unavailable'
  }
}

function safeDetail(value: string): string {
  return value
    .replace(/https?:\/\/[^\s<>"']+/gi, '[redacted URL]')
    .replace(/Bearer\s+[^\s<>"']+/gi, 'Bearer [redacted]')
    .replace(/\b(token|signature|api[_-]?key|secret|authorization)\s*[:=]\s*[^\s,;<>"']+/gi, '$1=[redacted]')
    .replace(/\s+/g, ' ')
    .slice(0, 500)
}
