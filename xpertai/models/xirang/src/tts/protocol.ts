import { createHmac, randomUUID } from 'node:crypto'
import WebSocket, { type ClientOptions } from 'ws'
import { z } from 'zod'

export const ttsModel = 'supernaturalrt'
export const ttsUrl = 'wss://xirang-openapi.ctyun.cn/aipaas/voice/v1/tts/supernaturalrt'
export const ttsCredentialsSchema = z.object({
  tts_app_id: z.string().trim().regex(/^[A-Za-z0-9_-]+$/),
  tts_app_key: z.string().trim().min(1),
  tts_region: z.string().trim().regex(/^[A-Z]{2}$/)
})
export type TtsCredentials = z.infer<typeof ttsCredentialsSchema>
export const ttsParametersSchema = z.object({
  voice: z.string().trim().min(1).optional(),
  speech_rate: z.number().min(0.5).max(2).optional(),
  volume: z.number().int().min(0).max(100).optional()
})
export type SocketFactory = (url: string, options: ClientOptions) => WebSocket
const socketFactory: SocketFactory = (url, options) => new WebSocket(url, options)
const frameSchema = z.object({
  code: z.number(),
  result: z.object({
    audio: z.string().regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
    is_end: z.boolean()
  }).optional()
})

// The documented signing key is its lowercase hexadecimal STRING, not raw HMAC bytes.
export function ttsHeaders(credentials: TtsCredentials, timestamp = Math.floor(Date.now() / 1000)) {
  const { tts_app_id: appId, tts_app_key: key, tts_region: region } = ttsCredentialsSchema.parse(credentials)
  const prefix = `teleai-cloud-auth-v1/${appId}/${region}/${timestamp}/1800`
  const signingKey = createHmac('sha256', key).update(prefix).digest('hex')
  const canonical = `GET\n${new URL(ttsUrl).pathname}\n\nx-app-id:${encodeURIComponent(appId)}`
  const signature = createHmac('sha256', signingKey).update(canonical).digest('hex')
  return { 'Content-Type': 'application/json', 'X-APP-ID': appId, Authorization: `${prefix}/x-app-id/${signature}` }
}

export async function validateTtsConnection(credentials: TtsCredentials, createSocket = socketFactory): Promise<void> {
  const socket = createSocket(ttsUrl, { headers: ttsHeaders(credentials), handshakeTimeout: 10_000 })
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve)
      socket.once('error', () => reject(new Error('Xirang TTS handshake failed; check the speech credentials and region')))
      socket.once('close', () => reject(new Error('Xirang TTS closed before authentication completed')))
    })
  } finally {
    socket.terminate()
  }
}

export async function* synthesize(
  credentials: TtsCredentials,
  text: string,
  parameters: z.infer<typeof ttsParametersSchema>,
  signal: AbortSignal,
  createSocket = socketFactory
): AsyncGenerator<string> {
  signal.throwIfAborted()
  const socket = createSocket(ttsUrl, { headers: ttsHeaders(credentials), handshakeTimeout: 10_000, maxPayload: 4 * 1024 * 1024 })
  const queue: string[] = []
  let queuedBytes = 0
  let completed = false
  let failure: Error | undefined
  let wake: (() => void) | undefined
  const fail = (error: Error) => { failure ??= error; wake?.(); socket.terminate() }
  const abort = () => fail(new Error('Xirang TTS canceled or timed out'))
  socket.on('open', () => {
    socket.send(JSON.stringify({ req_id: randomUUID(), text, format: 'PCM', sample_rate: 24000, ...parameters }))
  })
  socket.on('message', (data, binary) => {
    if (completed || failure) return
    try {
      if (binary) throw new Error('Unexpected binary Xirang TTS frame')
      const frame = frameSchema.parse(JSON.parse(data.toString()))
      if (frame.code !== 10000) throw new Error(`Xirang TTS failed (code ${frame.code})`)
      if (frame.result) {
        if (frame.result.audio) {
          queuedBytes += frame.result.audio.length
          if (queuedBytes > 8 * 1024 * 1024) throw new Error('Xirang TTS buffered audio limit exceeded')
          queue.push(frame.result.audio)
        }
        completed = frame.result.is_end
        wake?.()
      }
    } catch {
      // Never include provider payloads, signed headers or input text in error messages.
      fail(new Error('Xirang TTS returned an invalid or unsuccessful response'))
    }
  })
  socket.on('error', () => fail(new Error('Xirang TTS connection failed')))
  socket.on('close', () => { if (!completed) fail(new Error('Xirang TTS closed before the final audio fragment')) })
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  try {
    while (true) {
      if (failure) throw failure
      const audio = queue.shift()
      if (audio !== undefined) {
        queuedBytes -= audio.length
        yield audio
      } else if (completed) {
        return
      } else {
        await new Promise<void>((resolve) => { wake = resolve })
        wake = undefined
      }
    }
  } finally {
    signal.removeEventListener('abort', abort)
    socket.terminate()
  }
}
