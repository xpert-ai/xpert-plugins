import { OAIAPICompatLargeLanguageModel } from './llm.js'
import { OpenAICompatibleProviderStrategy } from '../provider.strategy.js'
import { ModelFeature } from '@metad/contracts'
import { TChatModelOptions } from '@xpert-ai/plugin-sdk'
import { OpenAICompatModelCredentials } from '../types.js'

describe('getCustomizableModelSchemaFromCredentials', () => {
  let llm: OAIAPICompatLargeLanguageModel
  let provider: OpenAICompatibleProviderStrategy

  beforeEach(() => {
    provider = new OpenAICompatibleProviderStrategy()
    llm = new OAIAPICompatLargeLanguageModel(provider)
  })

  it('should return correct schema for chat model with tool call support', () => {
    const credentials = {
      completion_type: 'chat',
      support_function_call: true,
      support_vision: false,
      context_length: 4096
    }
    const schema = llm.getCustomizableModelSchemaFromCredentials('test-model', credentials)

    expect(schema).toBeDefined()
    expect(schema?.model).toBe('test-model')
    expect(schema?.model_properties?.mode).toBe('chat')
    expect(schema?.features).toContain(ModelFeature.TOOL_CALL)
    expect(schema?.features).not.toContain(ModelFeature.VISION)
    expect(schema?.model_properties?.context_size).toBe(4096)

    const rules = schema?.parameter_rules
    expect(rules?.find((r) => r.name === 'temperature')).toBeDefined()
    expect(rules?.find((r) => r.name === 'enable_thinking')).toBeDefined()
  })

  it('should support agent thought feature', () => {
    const credentials = {
      agent_though_support: 'supported'
    }
    const schema = llm.getCustomizableModelSchemaFromCredentials('test-model', credentials)
    expect(schema?.features).toContain(ModelFeature.AGENT_THOUGHT)
  })

  it('should support structured output', () => {
    const credentials = {
      structured_output_support: 'supported'
    }
    const schema = llm.getCustomizableModelSchemaFromCredentials('test-model', credentials)
    const rules = schema?.parameter_rules
    expect(rules?.find((r) => r.name === 'response_format')).toBeDefined()
    expect(rules?.find((r) => r.name === 'json_schema')).toBeDefined()
  })

  it('should use display name if provided', () => {
    const credentials = {
      display_name: 'My Custom Model'
    }
    const schema = llm.getCustomizableModelSchemaFromCredentials('test-model', credentials)
    expect(schema?.label).toEqual({
      en_US: 'My Custom Model',
      zh_Hans: 'My Custom Model'
    })
  })

  it('should default to chat mode if completion_type is missing', () => {
    const credentials = {}
    const schema = llm.getCustomizableModelSchemaFromCredentials('test-model', credentials)
    expect(schema?.model_properties?.mode).toBe('chat')
  })

  it('should throw error for unsupported completion_type', () => {
    const credentials = {
      completion_type: 'unsupported'
    }
    expect(() => {
      llm.getCustomizableModelSchemaFromCredentials('test-model', credentials)
    }).toThrow('completion_type unsupported is not supported')
  })

  it('should return chat model with correct configuration', () => {
    const credentials: OpenAICompatModelCredentials = {
      api_key: 'test-key',
      endpoint_url: 'http://test.com',
      endpoint_model_name: 'test-model',
      mode: 'chat',
      context_size: '4096',
      temperature: 0.2,
      max_tokens_to_sample: '4096',
      vision_support: 'no_support',
      streaming: true,
      enable_thinking: true
    }
    const model = llm.getChatModel(
      { model: 'test-model' },
      { modelProperties: credentials } as unknown as TChatModelOptions,
      null
    )
    expect(model).toBeDefined()
    expect(model.model).toBe('test-model')
    const invocationParams = model.invocationParams()
    console.log(invocationParams)
    expect(invocationParams['chat_template_kwargs']).toEqual({
      enable_thinking: true
    })
  })
})
