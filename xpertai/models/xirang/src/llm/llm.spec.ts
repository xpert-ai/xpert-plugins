import { AiProviderRole, AiModelTypeEnum, defaultModelConfiguration, resolveModelParameterOptions } from '@xpert-ai/contracts'
import { AIMessageChunk } from '@langchain/core/messages'
import { ChatOAICompatReasoningModel, CommonParameterRules, getModelContextSize } from '@xpert-ai/plugin-sdk'
import { XirangProviderStrategy } from '../provider.strategy.js'
import { XirangLargeLanguageModel } from './llm.js'

function createCopilotModel(
  model: string,
  options: Record<string, unknown> = {},
  credentials: Record<string, unknown> = { app_key: 'test-key' }
): Parameters<XirangLargeLanguageModel['getChatModel']>[0] {
  return {
    model,
    options,
    copilot: {
      role: AiProviderRole.Primary,
      modelProvider: { credentials }
    }
  }
}

describe('Xirang LLM request configuration', () => {
  const manager = new XirangLargeLanguageModel(new XirangProviderStrategy())

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it.each(['kimi-k3', 'kimi-k3.1-pro'])('leaves unset generation parameters to the server for %s', (model) => {
    const credentials = { app_key: 'test-key' }
    // Exercise the same default resolution used by the model picker and host runtime.
    const rules = manager.getParameterRules(model, credentials)
    const options = resolveModelParameterOptions(undefined, rules)
    const chat = manager.getChatModel(createCopilotModel(model, options, credentials))
    const request = JSON.parse(JSON.stringify(chat.invocationParams()))

    expect(request).toEqual({ model, stream: true, stream_options: { include_usage: true } })
    for (const name of ['temperature', 'top_p', 'max_tokens', 'enable_thinking']) {
      expect(rules.find((rule) => rule.name === name)).toMatchObject({ required: false })
      expect(rules.find((rule) => rule.name === name)?.default).toBeUndefined()
    }
  })

  it('preserves explicitly saved values, including zero and false', () => {
    const credentials = { app_key: 'test-key' }
    const saved = {
      temperature: 0, top_p: 0.8, max_tokens: 8192, enable_thinking: false,
      response_format: 'json_object', frequency_penalty: 0, presence_penalty: 0, streaming: false
    }
    const options = resolveModelParameterOptions(saved, manager.getParameterRules('kimi-k3', credentials))
    const params = manager.getChatModel(createCopilotModel('kimi-k3', options, credentials)).invocationParams()

    expect(params).toMatchObject({
      temperature: 0, top_p: 0.8, max_tokens: 8192, enable_thinking: false,
      chat_template_kwargs: { enable_thinking: false }, response_format: { type: 'json_object' },
      frequency_penalty: 0, presence_penalty: 0, stream: false
    })
    expect(manager.getChatModel(createCopilotModel('kimi-k3.1-pro', { temperature: 1 })).invocationParams().temperature)
      .toBe(1)
  })

  it('lets cleared numeric fields remain unset after host parameter resolution', () => {
    const credentials = { app_key: 'test-key' }
    const options = resolveModelParameterOptions(
      { temperature: null, top_p: '', max_tokens: null }, manager.getParameterRules('kimi-k3', credentials)
    )
    const params = manager.getChatModel(createCopilotModel('kimi-k3', options, credentials)).invocationParams()
    expect(params.temperature).toBeUndefined()
    expect(params.top_p).toBeUndefined()
    expect(params.max_tokens).toBeUndefined()
  })

  it('keeps SDK defaults for other providers and the retry setting unchanged', () => {
    const rules = manager.getParameterRules('kimi-k3', { app_key: 'key' })
    expect(rules.find((rule) => rule.name === 'maxRetries')?.default).toBe(6)
    expect(CommonParameterRules.find((rule) => rule.name === 'temperature')?.default).toBe(0.2)
  })

  it('validates custom model credentials without forcing generation parameters', async () => {
    const invoke = jest.spyOn(ChatOAICompatReasoningModel.prototype, 'invoke')
      .mockImplementation(async function (this: ChatOAICompatReasoningModel) {
        expect(JSON.parse(JSON.stringify(this.invocationParams()))).toEqual({ model: 'kimi-k3.1-pro', stream: false })
        return new AIMessageChunk('OK')
      })
    await manager.validateCredentials('kimi-k3.1-pro', { app_key: 'test-key' })
    expect(invoke).toHaveBeenCalledWith([{ role: 'human', content: 'Reply only: OK' }])
  })

  it.each(['qwen3.8-max', 'qwen3.8-flash'])('exposes the catalog context window for %s to compression', (model) => {
    const chatModel = manager.getChatModel(createCopilotModel(model, { context_size: 1_000_000, max_tokens: 36_005 }))

    expect(getModelContextSize(chatModel)).toBe(1_000_000)
    expect(chatModel.metadata?.profile).toEqual(manager.getModelProfile(model, { app_key: 'test-key' }))
    expect(chatModel.invocationParams().max_tokens).toBe(36_005)
  })

  it('retains the logical model profile when an endpoint model ID is overridden', () => {
    const chatModel = manager.getChatModel(createCopilotModel('qwen3.8-max'), {
      modelProperties: { endpoint_model_name: 'custom-endpoint-id' }
    })

    expect(chatModel.invocationParams().model).toBe('custom-endpoint-id')
    expect(getModelContextSize(chatModel)).toBe(1_000_000)
  })

  it('exposes custom model limits from the resolved model properties', () => {
    const chatModel = manager.getChatModel(
      createCopilotModel('custom-model', {}, { app_key: 'test-key', context_size: '32768' }),
      { modelProperties: { context_size: '262144', max_tokens_to_sample: '8192' } }
    )

    expect(getModelContextSize(chatModel)).toBe(262_144)
    expect(chatModel.metadata?.profile).toEqual(
      expect.objectContaining({ maxInputTokens: 262_144, maxOutputTokens: 8192, toolCalling: true })
    )
  })

  it('uses the captured endpoint model ID and forwards response_format', () => {
    const chatModel = manager.getChatModel(createCopilotModel('qwen3.8-flash', { response_format: 'json_object' }))
    const params = chatModel.invocationParams()

    expect(params.model).toBe('865d804fa96848bbad8d047707f33565')
    expect(params['response_format']).toEqual({ type: 'json_object' })
  })

  it('keeps an explicit endpoint model override above the predefined ID', () => {
    const chatModel = manager.getChatModel(
      createCopilotModel('qwen3.8-flash'),
      { modelProperties: { endpoint_model_name: 'custom-endpoint-id' } }
    )

    expect(chatModel.invocationParams().model).toBe('custom-endpoint-id')
  })

  it('does not leak a Tianyi model ID into a custom compatible gateway', () => {
    const chatModel = manager.getChatModel(
      createCopilotModel('qwen3.8-flash', {}, { app_key: 'key', endpoint_url: 'https://example.test/v1' })
    )

    expect(chatModel.invocationParams().model).toBe('qwen3.8-flash')
  })

  it('uses the logical pricing key officially and preserves a custom gateway override', () => {
    const callbackSpy = jest
      .spyOn(manager as unknown as { createHandleUsageCallbacks: (...args: unknown[]) => unknown[] }, 'createHandleUsageCallbacks')
      .mockReturnValue([])

    manager.getChatModel(createCopilotModel('qwen3.8-flash'))
    expect(callbackSpy).toHaveBeenLastCalledWith(expect.anything(), 'qwen3.8-flash', expect.anything(), undefined)

    manager.getChatModel(
      createCopilotModel('qwen3.8-flash', {}, { app_key: 'key', endpoint_url: 'https://example.test/v1' }),
      { modelProperties: { endpoint_model_name: 'custom-endpoint-id' } }
    )
    expect(callbackSpy).toHaveBeenLastCalledWith(expect.anything(), 'custom-endpoint-id', expect.anything(), undefined)
  })

  it('preserves the existing customizable-model capability contract', () => {
    expect(manager.getModelProfile('custom-model', { app_key: 'key' })).toEqual(
      expect.objectContaining({ imageInputs: false, videoInputs: false, toolCalling: true, structuredOutput: false })
    )
    expect(manager.getParameterRules('custom-model', { app_key: 'key' }).map((rule) => rule.name))
      .toContain('enable_thinking')
  })

  it('uses edited imported limits and capabilities over the catalog and bounds requested output', () => {
    const modelProperties = { model_configuration: {
      ...defaultModelConfiguration(AiModelTypeEnum.LLM), contextSize: 32768,
      maxOutputTokens: 4096, defaultMaxTokens: 1024, maxConcurrency: 2
    } }
    const chat = manager.getChatModel(createCopilotModel('qwen3.8-flash'), { modelProperties })
    expect(getModelContextSize(chat)).toBe(32768)
    expect(chat.metadata.profile).toMatchObject({ maxOutputTokens: 4096, toolCalling: false })
    expect(chat.invocationParams().max_tokens).toBeUndefined()
    expect(chat.caller.maxConcurrency).toBe(2)
    // @ts-expect-error The SDK types credentials as strings, but the host passes structured model properties too.
    const rules = manager.getParameterRules('qwen3.8-flash', { app_key: 'key', ...modelProperties })
    const options = resolveModelParameterOptions(undefined, rules)
    expect(rules.find((rule) => rule.name === 'max_tokens')).toMatchObject({ max: 4096, required: false })
    expect(options?.max_tokens).toBeUndefined()
    expect(manager.getChatModel(createCopilotModel('qwen3.8-flash', options), {
      modelProperties, handleLLMTokens: undefined, verbose: false
    })
      .invocationParams().max_tokens).toBeUndefined()
    expect(manager.getChatModel(createCopilotModel('qwen3.8-flash', { max_tokens: 8192 }), { modelProperties })
      .invocationParams().max_tokens).toBe(4096)
  })
})
