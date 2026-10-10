import { HumanMessage } from '@langchain/core/messages'
import { AiProviderRole } from '@xpert-ai/contracts'
import { TongyiProviderStrategy } from '../provider.strategy.js'
import type { TongyiCredentials } from '../types.js'
import { Speech2TextChatModel, TongyiSpeech2TextModel } from './speech2text.js'
import { QwenAsrChatModel } from './qwen-asr.js'

const audio = 'data:audio/wav;base64,UklGRg=='
const model = () =>
  new QwenAsrChatModel({
    apiKey: 'test-only',
    model: 'qwen3-asr-flash',
    baseUrl: 'https://example.com/compatible-mode/v1'
  })
const input = () => [new HumanMessage({ content: [{ type: 'input_audio', input_audio: { data: audio } }] })]

describe('Qwen ASR', () => {
  afterEach(() => jest.restoreAllMocks())

  it('posts inline audio once to the configured compatible endpoint and preserves authoritative usage', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '这是合成测试。' } }],
          usage: {
            prompt_tokens: 42,
            completion_tokens: 12,
            total_tokens: 54,
            seconds: 2,
            prompt_tokens_details: { audio_tokens: 42 }
          }
        }),
        { status: 200 }
      )
    )
    const result = await model().invoke(input())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/compatible-mode/v1/chat/completions')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      model: 'qwen3-asr-flash',
      messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: audio } }] }],
      stream: false,
      asr_options: { enable_itn: false }
    })
    expect(result.content).toBe('这是合成测试。')
    expect(result.usage_metadata).toMatchObject({
      input_tokens: 42,
      output_tokens: 12,
      total_tokens: 54,
      input_token_details: { audio: 42 }
    })
    expect(result.response_metadata.usage.seconds).toBe(2)
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('does not invent usage when the response omits it', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })))
    expect((await model().invoke(input())).usage_metadata).toBeUndefined()
  })

  it('rejects local URLs, paths, malformed content and oversized inline audio without fetching', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
    for (const content of [
      [{ url: 'http://localhost/private.wav' }],
      [{ url: 'file:///private.wav' }],
      [{ url: '/private.wav' }],
      [{ url: 'https://user:password@example.com/private.wav' }],
      [{ type: 'input_audio', input_audio: { data: 'data:audio/wav;base64,A' } }],
      [{ type: 'input_audio', input_audio: { data: 'data:audio/wav;base64,AAAA=' } }],
      [{ type: 'input_audio', input_audio: { data: 'data:audio/wav;base64,AB==' } }],
      [{ url: 'data:audio/wav;base64,' + 'A'.repeat(10 * 1024 * 1024) }]
    ])
      await expect(model().invoke([new HumanMessage({ content })])).rejects.toThrow(/qwen_asr_audio_/)
    await expect(model().invoke([new HumanMessage('not audio')])).rejects.toThrow('qwen_asr_audio_required')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('forwards a legacy HTTPS audio URL only to the provider', async () => {
    const url = 'https://example.org/audio.wav?signature=test-only'
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'hello' } }] })))
    await model().invoke([new HumanMessage({ content: [{ url }] })])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/compatible-mode/v1/chat/completions')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).messages[0].content).toEqual([
      { type: 'input_audio', input_audio: { data: url } }
    ])
  })

  it('rejects multiple audio blocks instead of silently transcribing only one', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
    await expect(
      model().invoke([
        new HumanMessage({
          content: [
            { type: 'input_audio', input_audio: { data: audio } },
            { type: 'input_audio', input_audio: { data: audio } }
          ]
        })
      ])
    ).rejects.toThrow('qwen_asr_audio_required')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not dispatch an already cancelled request', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
    const controller = new AbortController()
    controller.abort()
    await expect(model()._generate(input(), { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError'
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['caller', 'deadline'] as const)('aborts a pending provider request on %s cancellation', async (source) => {
    const caller = new AbortController()
    const deadline = new AbortController()
    const timeout = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal)
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      const signal = init?.signal
      if (!signal) throw new Error('Expected request cancellation signal')
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    })
    const result = model()._generate(input(), { signal: caller.signal })
    const reason = new DOMException('cancelled', source === 'caller' ? 'AbortError' : 'TimeoutError')
    const assertion = expect(result).rejects.toBe(reason)
    const controller = source === 'caller' ? caller : deadline
    controller.abort(reason)
    await assertion
    expect(timeout).toHaveBeenCalledWith(120000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('never exposes provider error bodies that might echo audio or secrets', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'InvalidApiKey', message: 'sensitive-body' } }), { status: 401 })
      )
    await expect(model().invoke(input())).rejects.toThrow('qwen_asr_request_failed:401:InvalidApiKey')
  })

  it('rejects an invalid success payload instead of returning a fake transcription', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ choices: [] })))
    await expect(model().invoke(input())).rejects.toThrow('qwen_asr_response_invalid')
  })

  it('normalizes malformed success JSON without exposing its contents', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('sensitive-invalid-json'))
    await expect(model().invoke(input())).rejects.toThrow(/^qwen_asr_response_invalid$/)
  })
})

describe('Tongyi speech model selection', () => {
  const manager = new TongyiSpeech2TextModel(new TongyiProviderStrategy())
  const configuration = (
    model: string,
    credentials: TongyiCredentials = { dashscope_api_key: 'test-only' }
  ): Parameters<TongyiSpeech2TextModel['getChatModel']>[0] => ({
    model,
    copilot: { role: AiProviderRole.Primary, modelProvider: { credentials } }
  })

  afterEach(() => jest.restoreAllMocks())

  it.each<[Partial<TongyiCredentials>, string]>([
    [{}, 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'],
    [{ use_international_endpoint: true }, 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions'],
    [
      { api_host: 'workspace.cn-beijing.maas.aliyuncs.com' },
      'https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions'
    ]
  ])('uses existing endpoint credentials %j for Qwen ASR', async (credentials, endpoint) => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'hello' } }] })))
    const chat = manager.getChatModel(
      configuration('qwen3-asr-flash', { dashscope_api_key: 'test-only', ...credentials })
    )
    expect(chat).toBeInstanceOf(QwenAsrChatModel)
    await chat.invoke(input())
    expect(fetchMock).toHaveBeenCalledWith(
      endpoint,
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-only', 'Content-Type': 'application/json' }
      })
    )
  })

  it('retains the asynchronous Paraformer adapter', () => {
    expect(manager.getChatModel(configuration('paraformer-v2'))).toBeInstanceOf(Speech2TextChatModel)
  })

  it('exposes the recorded Qwen model in the speech2text catalog', () => {
    expect(manager.predefinedModels().find((entry) => entry.model === 'qwen3-asr-flash')).toMatchObject({
      model_type: 'speech2text',
      model_properties: { file_upload_limit: 7 }
    })
  })
})
