import { AiProviderRole } from '@xpert-ai/contracts'
import { buildKimi31Options } from './kimi31-options.js'
import { createMoonshotChatModel } from './moonshot-chat-model.js'
import { MoonshotLargeLanguageModel } from './llm.js'
import { MoonshotProviderStrategy } from '../provider.strategy.js'

describe('Kimi K3.1 request parameters', () => {
  it('serializes completion tokens and max effort through the installed OpenAI client', () => {
    const model = createMoonshotChatModel({ apiKey: 'test', model: 'kimi-k3.1-pro', modelKwargs: buildKimi31Options({ max_completion_tokens: 1234 }) })
    const params = model.invocationParams()
    expect(params).toMatchObject({ model: 'kimi-k3.1-pro', max_completion_tokens: 1234, reasoning_effort: 'max' })
    expect(params.max_tokens).toBeUndefined()
  })
  it('takes options through the model manager for both variants', () => {
    const manager = new MoonshotLargeLanguageModel(new MoonshotProviderStrategy())
    for (const model of ['kimi-k3.1-pro', 'kimi-k3.1-pro-highspeed']) {
      const client = manager.getChatModel({ model, copilot: { role: AiProviderRole.Primary, modelProvider: { credentials: { api_key: 'test' } } }, options: { max_completion_tokens: 1024, reasoning_effort: 'low' } })
      expect(client.invocationParams()).toMatchObject({ max_completion_tokens: 1024, reasoning_effort: 'low' })
    }
  })
  it('normalizes structured output and rejects malformed options before I/O', () => {
    expect(buildKimi31Options({ response_format: 'json_schema', json_schema: '{"type":"object","properties":{"answer":{"type":"string"}}}' })).toMatchObject({ response_format: { type: 'json_schema', json_schema: { schema: { type: 'object' } } } })
    expect(() => buildKimi31Options({ reasoning_effort: 'medium' })).toThrow('reasoning_effort')
    expect(() => buildKimi31Options({ max_completion_tokens: 0 })).toThrow('max_completion_tokens')
    expect(() => buildKimi31Options({ response_format: 'json_schema', json_schema: '[]' })).toThrow('json_schema')
  })
})

it('keeps Kimi reasoning content on the returned message', async () => {
  const client = createMoonshotChatModel({ apiKey: 'test', model: 'kimi-k3.1-pro', streaming: false, configuration: {
    fetch: async () => new Response(JSON.stringify({ id: 'test', object: 'chat.completion', created: 1, model: 'kimi-k3.1-pro', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'answer', reasoning_content: 'reasoning' } }], usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 } }), { headers: { 'content-type': 'application/json' } })
  } })
  const result = await client.invoke('hello')
  expect(result.content).toBe('answer')
  expect(result.additional_kwargs.reasoning_content).toBe('reasoning')
})
