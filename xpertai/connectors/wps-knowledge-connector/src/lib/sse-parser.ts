import { WpsKnowledgeConnectorError } from './errors.js'

export type WpsSseEvent = { event: string; data: string }

export async function* parseWpsSse(
  body: ReadableStream<Uint8Array>,
  options: { maxBytes: number; totalTimeoutMs: number; idleTimeoutMs: number }
): AsyncGenerator<WpsSseEvent> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.totalTimeoutMs)
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let size = 0
  let event = 'message'
  let data: string[] = []
  let lastRead = Date.now()
  try {
    while (true) {
      const result = await readWithIdleTimeout(reader, controller.signal, options.idleTimeoutMs, lastRead)
      if (result.done) break
      lastRead = Date.now()
      size += result.value.byteLength
      if (size > options.maxBytes) throw new WpsKnowledgeConnectorError('RESPONSE_TOO_LARGE', 'WPS SSE response is too large.')
      buffer += decoder.decode(result.value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const parsed = parseLine(line)
        if (parsed.type === 'event') event = parsed.value
        if (parsed.type === 'data') data.push(parsed.value)
        if (parsed.type === 'blank' && data.length) {
          yield { event, data: data.join('\n') }
          event = 'message'
          data = []
        }
      }
    }
    buffer += decoder.decode()
    const parsed = parseLine(buffer)
    if (parsed.type === 'data') data.push(parsed.value)
    if (data.length) yield { event, data: data.join('\n') }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    if (error instanceof WpsKnowledgeConnectorError) throw error
    const timedOut = error instanceof DOMException && error.name === 'AbortError'
    throw new WpsKnowledgeConnectorError(timedOut ? 'REQUEST_TIMEOUT' : 'PROVIDER_UNAVAILABLE', timedOut ? 'WPS SSE request timed out.' : 'WPS SSE request failed.', true)
  } finally {
    clearTimeout(timer)
    reader.releaseLock()
  }
}

async function readWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
  idleTimeoutMs: number,
  lastRead: number
): Promise<Awaited<ReturnType<typeof reader.read>>> {
  const remaining = Math.max(1, idleTimeoutMs - (Date.now() - lastRead))
  let handle: ReturnType<typeof setTimeout> | undefined
  let onAbort: (() => void) | undefined
  try {
    const timeout = new Promise<Awaited<ReturnType<typeof reader.read>>>((_, reject) => {
      handle = setTimeout(() => reject(new DOMException('Timeout', 'AbortError')), remaining)
      onAbort = () => reject(new DOMException('Timeout', 'AbortError'))
      signal.addEventListener('abort', onAbort, { once: true })
    })
    return await Promise.race([reader.read(), timeout])
  } finally {
    if (handle) clearTimeout(handle)
    if (onAbort) signal.removeEventListener('abort', onAbort)
  }
}

function parseLine(line: string): { type: 'event' | 'data' | 'blank' | 'comment' | 'other'; value: string } {
  if (!line.trim()) return { type: 'blank', value: '' }
  if (line.startsWith(':')) return { type: 'comment', value: '' }
  if (line.startsWith('event:')) return { type: 'event', value: line.slice(6).trim() }
  if (line.startsWith('data:')) return { type: 'data', value: line.slice(5).replace(/^ /, '') }
  return { type: 'other', value: '' }
}
