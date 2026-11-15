import { TTSChatModel } from './tts.js'
import { AiModelTypeEnum } from '@xpert-ai/contracts'

const originalFetch = global.fetch
afterEach(() => {
  global.fetch = originalFetch
})
function mockStream(events: unknown[]) {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')
  global.fetch = jest.fn(
    async () => new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
  ) as typeof fetch
}
it('streams typed PCM and records provider character usage once, without treating it as tokens', async () => {
  const usage = jest.fn(),
    pricing = jest.fn(async () => ({ capturedAt: new Date().toISOString(), rules: [] }))
  mockStream([
    { output: { audio: { data: 'AAAAAA==' } } },
    {
      request_id: 'provider',
      output: { finish_reason: 'stop', audio: { data: '', url: 'https://example.invalid/audio.wav' } },
      usage: { input_tokens: 0, output_tokens: 0, characters: 4 }
    }
  ])
  const model = new TTSChatModel({
    apiKey: 'test',
    model: 'qwen3-tts-flash',
    voice: 'Cherry',
    runtime: { handleModelUsage: usage, resolveUsagePricingSnapshot: pricing } as never
  })
  const chunks = []
  for await (const chunk of await model.stream('金额12')) chunks.push(chunk)
  expect(chunks[0].content).toMatchObject([
    { type: 'audio', format: 'pcm_s16le', sampleRate: 24000, channels: 1, data: 'AAAAAA==' }
  ])
  expect(usage).toHaveBeenCalledTimes(1)
  expect(usage).toHaveBeenCalledWith(
    expect.objectContaining({
      modelType: AiModelTypeEnum.TTS,
      metrics: [{ unit: 'character', component: 'input', quantity: 4, authority: 'provider' }]
    })
  )
  expect(pricing).toHaveBeenCalledTimes(1)
  expect(global.fetch).toHaveBeenCalledTimes(1)
})
it('propagates ledger failures without another billable request', async () => {
  mockStream([{ output: { finish_reason: 'stop', audio: {} }, usage: { characters: 2 } }])
  const usage = jest.fn().mockRejectedValue(new Error('ledger unavailable'))
  const model = new TTSChatModel({
    apiKey: 'test',
    model: 'qwen3-tts-flash',
    voice: 'Cherry',
    runtime: { handleModelUsage: usage } as never
  })
  await expect(async () => {
    for await (const _chunk of await model.stream('测试')) {
      /* consume */
    }
  }).rejects.toThrow('ledger unavailable')
  expect(global.fetch).toHaveBeenCalledTimes(1)
})
it('rejects incomplete synthesis and oversized input instead of claiming success', async () => {
  mockStream([{ output: { audio: { data: 'AAAA' } } }])
  const model = new TTSChatModel({ apiKey: 'test', model: 'qwen3-tts-flash', voice: 'Cherry' })
  await expect(async () => {
    for await (const _chunk of await model.stream('测试')) {
    }
  }).rejects.toThrow('before synthesis completed')
  await expect(async () => {
    for await (const _chunk of await model.stream('长'.repeat(601))) {
    }
  }).rejects.toThrow('1–600')
  expect(global.fetch).toHaveBeenCalledTimes(1)
})

it('consumes the final SSE event at EOF without a newline', async () => {
  global.fetch = jest.fn(
    async () =>
      new Response(
        'data: ' + JSON.stringify({ output: { finish_reason: 'stop', audio: {} }, usage: { characters: 2 } })
      )
  ) as typeof fetch
  const usage = jest.fn()
  const model = new TTSChatModel({ apiKey: 'test', runtime: { handleModelUsage: usage } as never })
  for await (const _chunk of await model.stream('测试')) {
  }
  expect(usage).toHaveBeenCalledTimes(1)
})

it('preserves token usage for legacy token-priced TTS models', async () => {
  mockStream([{ output: { finish_reason: 'stop', audio: {} }, usage: { input_tokens: 4, output_tokens: 10 } }])
  const usage = jest.fn(),
    model = new TTSChatModel({ apiKey: 'test', model: 'qwen-tts-flash', runtime: { handleModelUsage: usage } as never })
  for await (const _chunk of await model.stream('测试')) {
  }
  expect(usage.mock.calls[0][0].metrics).toEqual([
    { unit: 'token', component: 'input', quantity: 4, authority: 'provider' },
    { unit: 'token', component: 'output', quantity: 10, authority: 'provider' }
  ])
})
