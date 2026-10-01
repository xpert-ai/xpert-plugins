import { AiProviderRole } from '@xpert-ai/contracts'
import { HumanMessage, ToolMessage } from '@langchain/core/messages'
import { DeepSeekProviderStrategy } from '../provider.strategy.js'
import { DeepSeekChatOAICompatReasoningModel, DeepSeekLargeLanguageModel, buildDeepSeekThinkingParameter } from './llm.js'

describe('DeepSeek model parameters', () => {
  it('keeps enabled and disabled thinking values explicit', () => {
    expect(buildDeepSeekThinkingParameter(true)).toEqual({
      thinking: { type: 'enabled' }
    })
    expect(buildDeepSeekThinkingParameter(false)).toEqual({
      thinking: { type: 'disabled' }
    })
  })

  it('does not add thinking for models without a thinking rule', () => {
    expect(buildDeepSeekThinkingParameter(undefined)).toEqual({})
  })
})


describe('DeepSeek V4.1 Flash request parameters', () => {
  it.each([true, false])('normalizes thinking controls with streaming=%s', (streaming) => {
    for (const thinking of [undefined, true, false]) {
      const model = new DeepSeekChatOAICompatReasoningModel({
        model: 'deepseek-flash', apiKey: 'test-key', streaming, thinking,
        temperature: 0.8, topP: 0.96, frequencyPenalty: 0.4, presencePenalty: 0.3,
        maxTokens: 65536, modelKwargs: { reasoning_effort: 'max' }
      })
      const params = model.invocationParams()
      expect(params.max_tokens).toBe(65536)
      if (thinking === false) {
        expect(params.temperature).toBe(0.8)
        expect(params.top_p).toBeUndefined()
        expect(params.reasoning_effort).toBeUndefined()
      } else {
        expect(params.temperature).toBeUndefined()
        expect(params.frequency_penalty).toBeUndefined()
        expect(params.presence_penalty).toBeUndefined()
        expect(params.top_p).toBe(0.96)
        expect(params.reasoning_effort).toBe('max')
      }
    }
  })

  it('preserves existing model sampling behavior', () => {
    const model = new DeepSeekChatOAICompatReasoningModel({
      model: 'deepseek-v4-flash', apiKey: 'test-key', thinking: true,
      temperature: 0.8, topP: 0.9
    })
    expect(model.invocationParams()).toMatchObject({ temperature: 0.8, top_p: 0.9 })
  })
})


describe('DeepSeek V4.1 Flash integration', () => {
  it.each(['text', 'json_object'] as const)('forwards %s output from model options', (response_format) => {
    const manager = new DeepSeekLargeLanguageModel(new DeepSeekProviderStrategy())
    const chat = manager.getChatModel({
      model: 'deepseek-flash',
      options: { response_format, max_tokens: 65536, thinking: false, reasoning_effort: 'max' },
      copilot: { role: AiProviderRole.Primary, modelProvider: { credentials: { api_key: 'test-key' } } }
    })
    expect(chat.invocationParams()).toMatchObject({ response_format: { type: response_format }, max_tokens: 65536 })
    expect(chat.invocationParams().reasoning_effort).toBeUndefined()
  })

  it('serializes tool image content through the non-streaming request path', async () => {
    const chat = new DeepSeekChatOAICompatReasoningModel({ model: 'deepseek-flash', apiKey: 'test-key', streaming: false })
    const completion = jest.spyOn(chat, 'completionWithRetry').mockResolvedValue({
      id: 'test', object: 'chat.completion', created: 0, model: 'deepseek-flash',
      choices: [{ index: 0, message: { role: 'assistant', content: 'An image', refusal: null }, finish_reason: 'stop', logprobs: null }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
    })
    await chat.invoke([
      new HumanMessage('Describe the image'),
      new ToolMessage({ tool_call_id: 'image-1', content: [
        { type: 'text', text: 'Screenshot' },
        { type: 'image', source_type: 'base64', mime_type: 'image/png', data: 'aGVsbG8=' }
      ] })
    ])
    expect(completion.mock.calls[0][0]).toMatchObject({
      model: 'deepseek-flash', messages: expect.arrayContaining([
        { role: 'tool', tool_call_id: 'image-1', content: [
          { type: 'text', text: 'Screenshot' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,aGVsbG8=' } }
        ] }
      ])
    })
  })
})
