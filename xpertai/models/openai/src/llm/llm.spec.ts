import { ICopilotModel } from '@metad/contracts'
import { OpenAIProviderStrategy } from '../provider.strategy.js'
import { OpenAILargeLanguageModel } from './llm.js'

function createCopilotModel(
  model: string,
  options: Record<string, unknown>,
  credentials: Record<string, unknown> = { api_key: 'test-key' }
): ICopilotModel {
  return {
    model,
    options,
    copilot: {
      modelProvider: {
        credentials,
      },
    },
  } as unknown as ICopilotModel
}

describe('OpenAILargeLanguageModel', () => {
  let provider: OpenAIProviderStrategy
  let llm: OpenAILargeLanguageModel

  beforeEach(() => {
    provider = new OpenAIProviderStrategy()
    llm = new OpenAILargeLanguageModel(provider)
  })

  it('maps GPT-5.4 options to Responses API parameters', () => {
    const model = llm.getChatModel(
      createCopilotModel('gpt-5.4', {
        temperature: 0.4,
        top_p: 0.7,
        max_tokens: 1024,
        reasoning_effort: 'high',
        response_format: 'json_object',
      })
    )

    const params = (model as any).invocationParams()

    expect(params.model).toBe('gpt-5.4')
    expect(params.temperature).toBe(0.4)
    expect(params.top_p).toBe(0.7)
    expect(params.max_output_tokens).toBe(1024)
    expect(params.reasoning).toEqual({ effort: 'high' })
    expect(params.text?.format).toEqual({ type: 'json_object' })
  })

  it('suppresses unsupported GPT-5 Pro parameters on the official endpoint', () => {
    const model = llm.getChatModel(
      createCopilotModel('gpt-5.4-pro', {
        temperature: 0.4,
        top_p: 0.7,
        response_format: 'json_object',
        reasoning_effort: 'minimal',
      })
    )

    const params = (model as any).invocationParams()

    expect(params.temperature).toBeUndefined()
    expect(params.top_p).toBeUndefined()
    expect(params.reasoning).toEqual({ effort: 'minimal' })
    expect(params.text?.format).toBeUndefined()
  })

  it('keeps auto sampling disabled for custom endpoints', () => {
    const model = llm.getChatModel(
      createCopilotModel(
        'gpt-5.4',
        {
          temperature: 0.5,
          top_p: 0.8,
        },
        {
          api_key: 'test-key',
          endpoint_url: 'https://gateway.example.com/v1',
        }
      )
    )

    const params = (model as any).invocationParams()

    expect(params.temperature).toBeUndefined()
    expect(params.top_p).toBeUndefined()
  })
})
