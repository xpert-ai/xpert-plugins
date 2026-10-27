import { once } from 'node:events'
import WebSocket, { WebSocketServer } from 'ws'
import { XirangTtsChatModel } from './tts.js'
import { synthesize, ttsHeaders, ttsParametersSchema, validateTtsConnection, type SocketFactory } from './protocol.js'

const credentials = { tts_app_id: 'app-id', tts_app_key: 'secret-key', tts_region: 'QG' }

describe('Xirang TTS WebSocket contract', () => {
  let server: WebSocketServer
  let createSocket: SocketFactory
  beforeEach(async () => {
    server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    await once(server, 'listening')
    const address = server.address()
    if (typeof address === 'string') throw new Error('Expected TCP address')
    createSocket = (_url, options) => new WebSocket(`ws://127.0.0.1:${address.port}`, options)
  })
  afterEach(async () => {
    for (const socket of server.clients) socket.terminate()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('signs GET with the speech app ID, region and two HMAC stages', () => {
    expect(ttsHeaders(credentials, 1700000000)).toEqual({
      'Content-Type': 'application/json', 'X-APP-ID': 'app-id',
      Authorization: 'teleai-cloud-auth-v1/app-id/QG/1700000000/1800/x-app-id/2f035497714f2334cdf574155426a0f6e6ea15241ffbb4986b6a3ccc9e88a025'
    })
  })

  it('validates authentication by handshake without submitting text', async () => {
    const receive = jest.fn()
    server.on('connection', (socket, request) => {
      expect(request.headers['x-app-id']).toBe('app-id')
      socket.on('message', receive)
    })
    await validateTtsConnection(credentials, createSocket)
    expect(receive).not.toHaveBeenCalled()
  })

  it('returns platform PCM audio, handles ack frames and preserves volume zero', async () => {
    server.on('connection', (socket) => socket.on('message', (data) => {
      expect(JSON.parse(data.toString())).toEqual({ req_id: expect.any(String), text: '你好', format: 'PCM', sample_rate: 24000, volume: 0 })
      socket.send(JSON.stringify({ code: 10000, sid: 'session' }))
      socket.send(JSON.stringify({ code: 10000, result: { audio: 'AQACAA==', is_end: false } }))
      socket.send(JSON.stringify({ code: 10000, result: { audio: 'AwAEAA==', is_end: true } }))
    }))
    const result = await new XirangTtsChatModel(credentials, { volume: 0 }, createSocket).invoke('你好')
    expect(result.content).toEqual([{ type: 'audio', data: 'AQACAAMABAA=', format: 'pcm', sample_rate: 24000 }])
  })

  it('splits long text instead of letting the provider truncate after 500 characters', async () => {
    const texts: string[] = []
    server.on('connection', (socket) => socket.on('message', (data) => {
      texts.push(JSON.parse(data.toString()).text)
      socket.send(JSON.stringify({ code: 10000, result: { audio: 'AQACAA==', is_end: true } }))
    }))
    const chunks = []
    for await (const chunk of await new XirangTtsChatModel(credentials, {}, createSocket).stream('中'.repeat(501))) chunks.push(chunk)
    expect(texts.map((text) => text.length)).toEqual([500, 1])
    expect(chunks).toHaveLength(2)
    expect(chunks[0].content).toEqual([{ type: 'audio', data: 'AQACAA==', format: 'pcm', sample_rate: 24000 }])
  })

  it.each(['invalid-json', JSON.stringify({ code: 10301 }), JSON.stringify({ code: 10000, result: { audio: 'invalid!', is_end: true } })])('rejects malformed/error frames', async (frame) => {
    server.on('connection', (socket) => socket.on('message', () => socket.send(frame)))
    await expect(new XirangTtsChatModel(credentials, {}, createSocket).invoke('test')).rejects.toThrow('invalid or unsuccessful')
  })

  it('rejects premature close', async () => {
    server.on('connection', (socket) => socket.on('message', () => socket.close()))
    await expect(new XirangTtsChatModel(credentials, {}, createSocket).invoke('test')).rejects.toThrow('before the final')
  })

  it('cancels an idle stream and closes its socket', async () => {
    const controller = new AbortController()
    server.on('connection', (socket) => socket.on('message', () => controller.abort()))
    const stream = synthesize(credentials, 'test', {}, controller.signal, createSocket)
    await expect(stream.next()).rejects.toThrow('canceled or timed out')
  })

  it('enforces request bounds before contacting the service', async () => {
    const model = new XirangTtsChatModel(credentials, {}, createSocket)
    await expect(model.invoke('x'.repeat(10001))).rejects.toThrow()
    expect(ttsParametersSchema.safeParse({ volume: 101 }).success).toBe(false)
    expect(ttsParametersSchema.safeParse({ speech_rate: 0.1 }).success).toBe(false)
    expect(server.clients.size).toBe(0)
  })
})
