jest.mock('@metad/contracts', () => ({
  AiModelTypeEnum: {
    LLM: 'llm'
  }
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AIModelProviderStrategy: () => () => undefined,
  CredentialsValidateFailedError: class extends Error {},
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  ModelProvider: class {},
  LargeLanguageModel: class {
    constructor(readonly modelProvider: unknown, readonly modelType: unknown) {}

    createHandleUsageCallbacks() {
      return []
    }

    createHandleLLMErrorCallbacks() {
      return {}
    }

    getModelProfile() {
      return {}
    }
  }
}))

jest.mock('@langchain/openai', () => {
  class MockChatOpenAI {
    private params: Record<string, any>

    constructor(params: Record<string, any>) {
      this.params = { ...params }
    }

    invocationParams() {
      const params = { ...this.params }

      if (params.maxTokens !== undefined) {
        params.max_output_tokens = params.maxTokens
        delete params.maxTokens
      }

      if (params.topP !== undefined) {
        params.top_p = params.topP
        delete params.topP
      }

      if (params.frequencyPenalty !== undefined) {
        params.frequency_penalty = params.frequencyPenalty
        delete params.frequencyPenalty
      }

      if (params.presencePenalty !== undefined) {
        params.presence_penalty = params.presencePenalty
        delete params.presencePenalty
      }

      return params
    }

    withConfig(config: Record<string, any>) {
      if (config.response_format) {
        return new MockChatOpenAI({
          ...this.params,
          text: {
            format: config.response_format
          }
        })
      }

      return new MockChatOpenAI(this.params)
    }

    invoke = jest.fn().mockResolvedValue({
      content: 'Test response',
      role: 'assistant'
    })
  }

  class MockChatOpenAIResponses {
    constructor(_params: Record<string, any>) {}
  }

  return {
    ChatOpenAI: MockChatOpenAI,
    ChatOpenAIResponses: MockChatOpenAIResponses,
    OpenAIClient: {}
  }
})

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
    expect(params.reasoning).toEqual({ effort: 'high', summary: 'auto' })
    expect(params.text?.format).toEqual({ type: 'json_object' })
  })

  it('clamps official OpenAI max_tokens below the Responses API minimum', () => {
    const model = llm.getChatModel(
      createCopilotModel('gpt-5.4', {
        max_tokens: 5,
      })
    )

    const params = (model as any).invocationParams()

    expect(params.max_output_tokens).toBe(16)
  })

  it('normalizes legacy GPT-5.4 reasoning values to the official enum', () => {
    const model = llm.getChatModel(
      createCopilotModel('gpt-5.4', {
        reasoning_effort: 'minimal',
      })
    )

    const params = (model as any).invocationParams()

    expect(params.reasoning).toEqual({ effort: 'none', summary: 'auto' })
  })

  it('suppresses unsupported GPT-5 Pro parameters on the official endpoint', () => {
    const model = llm.getChatModel(
      createCopilotModel('gpt-5.4-pro', {
        temperature: 0.4,
        top_p: 0.7,
        response_format: 'json_object',
        reasoning_effort: 'low',
      })
    )

    const params = (model as any).invocationParams()

    expect(params.temperature).toBeUndefined()
    expect(params.top_p).toBeUndefined()
    expect(params.reasoning).toEqual({ effort: 'medium', summary: 'auto' })
    expect(params.text?.format).toBeUndefined()
  })

  it('normalizes legacy Codex reasoning values to the supported enum', () => {
    const model = llm.getChatModel(
      createCopilotModel('gpt-5.3-codex', {
        reasoning_effort: 'minimal',
      })
    )

    const params = (model as any).invocationParams()

    expect(params.reasoning).toEqual({ effort: 'low', summary: 'auto' })
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
