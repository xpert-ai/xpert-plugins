import { AnthropicLargeLanguageModel } from './llm.js'
import { AnthropicProviderStrategy } from '../provider.strategy.js'
import { ModelFeature } from '@metad/contracts'
import { TChatModelOptions } from '@xpert-ai/plugin-sdk'
import { AnthropicModelCredentials } from '../types.js'

// Mock ChatAnthropic to avoid actual API calls during testing
jest.mock('@langchain/anthropic', () => ({
  ChatAnthropic: jest.fn().mockImplementation((params) => ({
    model: params.modelName || 'claude-3-5-sonnet-20241022',
    anthropicApiKey: params.anthropicApiKey,
    streaming: params.streaming,
    temperature: params.temperature,
    topP: params.topP,
    maxTokens: params.maxTokens,
    invoke: jest.fn().mockResolvedValue({
      content: 'Test response',
      role: 'assistant'
    }),
    invocationParams: jest.fn().mockReturnValue(params)
  }))
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
        api_key: 'test-key',
        context_size: '200000',
        max_tokens_to_sample: '4096',
        function_calling_type: 'tool_call',
        vision_support: 'support'
      }
      const schema = llm.getCustomizableModelSchemaFromCredentials('claude-3-5-sonnet-20241022', credentials)

      expect(schema).toBeDefined()
      expect(schema?.model).toBe('claude-3-5-sonnet-20241022')
      expect(schema?.model_type).toBe('llm')
      expect(schema?.features).toContain(ModelFeature.TOOL_CALL)
      expect(schema?.features).toContain(ModelFeature.VISION)
      expect(schema?.model_properties?.context_size).toBe(200000)
    })

    it('should not include tool call feature when disabled', () => {
      const credentials = {
        api_key: 'test-key',
        context_size: '200000',
        max_tokens_to_sample: '4096',
        function_calling_type: 'no_call',
        vision_support: 'no_support'
      }
      const schema = llm.getCustomizableModelSchemaFromCredentials('claude-3-5-sonnet-20241022', credentials)

      expect(schema?.features).not.toContain(ModelFeature.TOOL_CALL)
      expect(schema?.features).not.toContain(ModelFeature.VISION)
    })

    it('should use display name if provided', () => {
      const credentials = {
        api_key: 'test-key',
        context_size: '200000',
        max_tokens_to_sample: '4096',
        display_name: 'My Claude Model'
      }
      const schema = llm.getCustomizableModelSchemaFromCredentials('claude-3-5-sonnet-20241022', credentials)

      expect(schema?.label).toEqual({
        en_US: 'My Claude Model',
        zh_Hans: 'My Claude Model'
      })
    })

    it('should use model name as label when display_name is not provided', () => {
      const credentials = {
        api_key: 'test-key',
        context_size: '200000',
        max_tokens_to_sample: '4096'
      }
      const schema = llm.getCustomizableModelSchemaFromCredentials('claude-3-5-sonnet-20241022', credentials)

      expect(schema?.label).toEqual({
        en_US: 'claude-3-5-sonnet-20241022',
        zh_Hans: 'claude-3-5-sonnet-20241022'
      })
    })

    it('should include parameter rules for temperature, top_p, and max_tokens', () => {
      const credentials = {
        api_key: 'test-key',
        context_size: '200000',
        max_tokens_to_sample: '4096'
      }
      const schema = llm.getCustomizableModelSchemaFromCredentials('claude-3-5-sonnet-20241022', credentials)

      const rules = schema?.parameter_rules
      expect(rules).toBeDefined()
      expect(rules?.find((r) => r.name === 'temperature')).toBeDefined()
      expect(rules?.find((r) => r.name === 'top_p')).toBeDefined()
      expect(rules?.find((r) => r.name === 'max_tokens')).toBeDefined()
    })

    it('should set correct max_tokens limit based on context_size', () => {
      const credentials = {
        api_key: 'test-key',
        context_size: '100000',
        max_tokens_to_sample: '4096'
      }
      const schema = llm.getCustomizableModelSchemaFromCredentials('claude-3-5-sonnet-20241022', credentials)

      const maxTokensRule = schema?.parameter_rules?.find((r) => r.name === 'max_tokens')
      expect(maxTokensRule?.max).toBe(100000)
    })

    it('should default context_size to 200000 when not provided', () => {
      const credentials = {
        api_key: 'test-key',
        max_tokens_to_sample: '4096'
      }
      const schema = llm.getCustomizableModelSchemaFromCredentials('claude-3-5-sonnet-20241022', credentials)

      expect(schema?.model_properties?.context_size).toBe(200000)
    })
  })

  describe('getChatModel', () => {
    it('should create chat model with correct configuration', () => {
      const mockCopilotModel = {
        model: 'claude-3-5-sonnet-20241022',
        options: {},
        copilot: {
          modelProvider: {
            credentials: {
              api_key: 'test-key'
            }
          }
        }
      } as any

      const model = llm.getChatModel(mockCopilotModel, {} as TChatModelOptions)

      expect(model).toBeDefined()
      expect(model.model).toBe('claude-3-5-sonnet-20241022')
    })

    it('should use options from copilotModel when provided', () => {
      const mockCopilotModel = {
        model: 'claude-3-5-sonnet-20241022',
        options: {
          temperature: 0.8,
          max_tokens: '2048'
        },
        copilot: {
          modelProvider: {
            credentials: {
              api_key: 'test-key'
            }
          }
        }
      } as any

      const model = llm.getChatModel(mockCopilotModel, {} as TChatModelOptions)

      const params = model.invocationParams()
      expect(params.temperature).toBe(0.8)
      expect(params.maxTokens).toBe(2048)
      expect(params.streaming).toBe(true)
    })
  })
})

