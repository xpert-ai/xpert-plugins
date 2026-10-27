import { AiProviderRole } from '@xpert-ai/contracts'
import { AIMessageChunk } from '@langchain/core/messages'
import { TongyiProviderStrategy } from '../provider.strategy.js'
import { TongyiLargeLanguageModel } from './llm.js'
import { TongyiReasoningChatModel } from './chat-model.js'
import { validateTongyiToolControls } from './model-options.js'

describe('Tongyi provider-specific request controls', () => {
  afterEach(() => jest.restoreAllMocks())
  const manager = new TongyiLargeLanguageModel(new TongyiProviderStrategy())
  function params(model: string, options: Record<string, unknown>) {
    return manager.getChatModel({ model, options, copilot: { role: AiProviderRole.Primary,
      modelProvider: { credentials: { dashscope_api_key: 'test' } } } }).invocationParams()
  }

  it('omits fixed sampling overrides and unsupported MiMo controls', () => {
    const request = params('xiaomi/mimo-v2.6-pro-ultraspeed', {
      temperature: .2, top_p: .4, frequency_penalty: .8, reasoning_effort: 'max', thinking_budget: 100,
      enable_thinking: false, enable_search: true, tool_stream: true
    })
    expect(request.temperature).toBeUndefined()
    for (const field of ['top_p', 'frequency_penalty', 'reasoning_effort', 'thinking_budget', 'enable_search', 'tool_stream']) {
      expect(request[field]).toBeUndefined()
    }
    expect(request['enable_thinking']).toBe(false)
    const schema = manager.predefinedModels().find((model) => model.model === 'xiaomi/mimo-v2.6-pro-ultraspeed')
    expect(schema?.parameter_rules?.some((rule) => rule.name === 'temperature')).toBe(false)
  })

  it('uses reasoning_effort alone for Omni and preserves always-on MiniMax thinking', () => {
    expect(params('qwen3.8-omni-flash', { enable_thinking: false, thinking_budget: 100, reasoning_effort: 'high' }))
      .toMatchObject({ reasoning_effort: 'none' })
    expect(params('qwen3.8-omni-flash', { reasoning_effort: 'xhigh', thinking_budget: 100 })['thinking_budget']).toBeUndefined()
    expect(params('MiniMax/MiniMax-M3.1-Flash', { enable_thinking: false, reasoning_effort: 'max' })['enable_thinking'])
      .toBeUndefined()
    expect(() => params('MiniMax/MiniMax-M3.1-Flash', { reasoning_effort: 'none' })).toThrow('reasoning_effort')
    const request = params('MiniMax/MiniMax-M3.1-Flash', { temperature: .2, top_p: .4 })
    expect(request.temperature).toBeUndefined()
    expect(request.top_p).toBeUndefined()
  })

  it.each(['MiniMax/MiniMax-M3.1-Flash', 'xiaomi/mimo-v2.6-pro-ultraspeed'])(
    'uses supported sampling defaults during credential validation for %s', async (model) => {
      const invocation = jest.spyOn(TongyiReasoningChatModel.prototype, 'invoke').mockImplementation(
        async function (this: TongyiReasoningChatModel) {
          expect(this.invocationParams().temperature).toBeUndefined()
          expect(this.invocationParams().top_p).toBeUndefined()
          return new AIMessageChunk('ok')
        }
      )
      await manager.validateCredentials(model, { dashscope_api_key: 'test' })
      expect(invocation).toHaveBeenCalledTimes(1)
    }
  )

  it('rejects unsupported JSON Schema and forced tool selection before transport', () => {
    expect(() => params('stepfun/step-5-preview', { response_format: 'json_schema' })).toThrow('response_format')
    expect(() => validateTongyiToolControls('stepfun/step-5-preview', { tool_choice: 'auto' })).toThrow('unsupported')
    expect(() => validateTongyiToolControls('MiniMax/MiniMax-M3.1-Flash', { tool_choice: 'required' })).toThrow('only supports auto')
    expect(() => validateTongyiToolControls('MiniMax/MiniMax-M3.1-Flash', { tool_choice: 'auto' })).not.toThrow()
    expect(() => validateTongyiToolControls('custom-model', { tool_choice: 'required' })).not.toThrow()
  })
})
