import { ModelFeature } from '@metad/contracts'
import { AnthropicInput } from '@langchain/anthropic'
import { TChatModelOptions, CredentialsValidateFailedError } from '@xpert-ai/plugin-sdk'
import { AnthropicLargeLanguageModel } from './llm.js'
import { AnthropicProviderStrategy } from '../provider.strategy.js'
import { AnthropicCredentials } from '../types.js'

jest.mock('@langchain/anthropic', () => ({
  ChatAnthropic: jest.fn().mockImplementation((params: AnthropicInput & Record<string, any>) => ({
    model: params.modelName || params.model || 'claude-sonnet-4-6',
    anthropicApiKey: params.anthropicApiKey || params.apiKey,
    clientOptions: params.clientOptions,
    streaming: params.streaming,
    temperature: params.temperature,
    topK: params.topK,
    topP: params.topP,
    maxTokens: params.maxTokens,
    thinking: params.thinking,
    formatStructuredToolToAnthropic: jest.fn().mockReturnValue(undefined),
    invoke: jest.fn().mockResolvedValue({
      content: 'Test response',
      role: 'assistant'
    }),
    invocationParams: jest.fn().mockReturnValue(params)
  })),
  AnthropicInput: {}
}))

describe('AnthropicLargeLanguageModel', () => {
  let llm: AnthropicLargeLanguageModel
  let provider: AnthropicProviderStrategy

  beforeEach(() => {
    provider = new AnthropicProviderStrategy()
    llm = new AnthropicLargeLanguageModel(provider)
  })

  describe('getCustomizableModelSchemaFromCredentials', () => {
    it('should return correct schema for model with tool call support', () => {
      const credentials = {
        context_size: '200000',
        function_calling_type: 'tool_call',
        vision_support: 'support'
      }
      const schema = llm.getCustomizableModelSchemaFromCredentials('claude-sonnet-4-6', credentials)

      expect(schema).toBeDefined()
      expect(schema?.model).toBe('claude-sonnet-4-6')
      expect(schema?.model_type).toBe('llm')
      expect(schema?.features).toContain(ModelFeature.TOOL_CALL)
      expect(schema?.features).toContain(ModelFeature.VISION)
      expect(schema?.model_properties?.context_size).toBe(200000)
    })

    it('should use display name if provided', () => {
      const credentials = {
        context_size: '200000',
        display_name: 'My Claude Model'
      }
      const schema = llm.getCustomizableModelSchemaFromCredentials('claude-sonnet-4-6', credentials)

      expect(schema?.label).toEqual({
        en_US: 'My Claude Model',
        zh_Hans: 'My Claude Model'
      })
    })
  })

  describe('getChatModel', () => {
    it('should create chat model with correct configuration', () => {
      const mockCopilotModel = {
        model: 'claude-sonnet-4-6',
        options: {},
        copilot: {
          modelProvider: {
            credentials: {
              anthropic_api_key: 'test-key'
            }
          }
        }
      } as any

      const model = llm.getChatModel(mockCopilotModel, {} as TChatModelOptions)

      expect(model).toBeDefined()
      expect(model.model).toBe('claude-sonnet-4-6')
    })

    it('should wire supported runtime parameters', () => {
      const mockCopilotModel = {
        model: 'claude-opus-4-6',
        options: {
          temperature: '0.8',
          top_p: '0.9',
          top_k: '32',
          max_tokens: '2048'
        },
        copilot: {
          modelProvider: {
            credentials: {
              anthropic_api_key: 'test-key',
              anthropic_api_url: 'https://anthropic.example.com/'
            }
          }
        }
      } as any

      const model = llm.getChatModel(mockCopilotModel, {} as TChatModelOptions)
      const params = model.invocationParams()

      expect(params.temperature).toBe(0.8)
      expect(params.topP).toBe(0.9)
      expect(params.topK).toBe(32)
      expect(params.maxTokens).toBe(2048)
      expect(params.clientOptions?.baseURL).toBe('https://anthropic.example.com')
      expect(params.clientOptions?.defaultHeaders?.['anthropic-beta']).toContain(
        'prompt-caching-2024-07-31'
      )
      expect(params.streaming).toBe(true)
    })

    it('should disable sampling parameters when thinking is enabled', () => {
      const mockCopilotModel = {
        model: 'claude-sonnet-4-6',
        options: {
          thinking: true,
          thinking_budget: '4096',
          temperature: '0.8',
          top_p: '0.9',
          top_k: '16',
          context_1m: true
        },
        copilot: {
          modelProvider: {
            credentials: {
              anthropic_api_key: 'test-key'
            }
          }
        }
      } as any

      const model = llm.getChatModel(mockCopilotModel, {} as TChatModelOptions)
      const params = model.invocationParams()

      expect(params.temperature).toBeUndefined()
      expect(params.topP).toBeUndefined()
      expect(params.topK).toBeUndefined()
      expect(params.thinking).toEqual({
        type: 'enabled',
        budget_tokens: 4096
      })
      expect(params.clientOptions?.defaultHeaders?.['anthropic-beta']).toContain(
        'context-1m-2025-08-07'
      )
    })
  })

  describe('validateCredentials', () => {
    it('should validate credentials successfully with mock', async () => {
      const credentials: AnthropicCredentials = {
        anthropic_api_key: 'test-api-key'
      }

      await expect(llm.validateCredentials('claude-sonnet-4-6', credentials)).resolves.toBeUndefined()
    })

    it('should throw CredentialsValidateFailedError when API call fails', async () => {
      const { ChatAnthropic } = require('@langchain/anthropic')
      const mockInvoke = jest.fn().mockRejectedValue(new Error('API Error'))
      ;(ChatAnthropic as jest.Mock).mockImplementation((params: AnthropicInput) => ({
        formatStructuredToolToAnthropic: jest.fn().mockReturnValue(undefined),
        invocationParams: jest.fn().mockReturnValue(params),
        invoke: mockInvoke
      }))

      const credentials: AnthropicCredentials = {
        anthropic_api_key: 'test-api-key'
      }

      await expect(llm.validateCredentials('claude-sonnet-4-6', credentials)).rejects.toThrow(
        CredentialsValidateFailedError
      )
    })
  })
})
