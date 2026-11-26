import { AnthropicLargeLanguageModel } from './llm.js'
import { AnthropicProviderStrategy } from '../provider.strategy.js'

it.each(['claude-fable-5-2', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'])(
  'serializes adaptive thinking and effort for %s', model => {
    const manager = new AnthropicLargeLanguageModel(new AnthropicProviderStrategy())
    const chat = manager.getChatModel({ model, options: { effort: 'high', temperature: 0.3 },
      copilot: { modelProvider: { credentials: { anthropic_api_key: 'test' } } } } as any)
    const body = JSON.parse(JSON.stringify(chat.invocationParams()))
    expect(body).toMatchObject({ model, thinking: { type: 'adaptive' }, output_config: { effort: 'high' } })
    for (const key of ['temperature', 'top_k', 'top_p']) expect(body).not.toHaveProperty(key)
  }
)
