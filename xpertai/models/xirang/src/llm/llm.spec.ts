import { AiProviderRole } from '@xpert-ai/contracts'
import { getModelContextSize } from '@xpert-ai/plugin-sdk'
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
})
