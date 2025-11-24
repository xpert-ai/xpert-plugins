import { XinferenceLargeLanguageModel } from './llm.js'
import { XinferenceProviderStrategy } from '../provider.strategy.js'
import { ModelFeature } from '@metad/contracts'

describe('getCustomizableModelSchemaFromCredentials', () => {
  let llm: XinferenceLargeLanguageModel
  let provider: XinferenceProviderStrategy

  beforeEach(() => {
    provider = new XinferenceProviderStrategy()
    llm = new XinferenceLargeLanguageModel(provider)
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
    expect(rules?.find((r) => r.name === 'top_p')).toBeDefined()
    expect(rules?.find((r) => r.name === 'max_tokens')).toBeDefined()
    expect(rules?.find((r) => r.name === 'presence_penalty')).toBeDefined()
    expect(rules?.find((r) => r.name === 'frequency_penalty')).toBeDefined()
  })

  it('should return correct schema for completion model with vision support', () => {
    const credentials = {
      completion_type: 'completion',
      support_function_call: false,
      support_vision: true,
      context_length: 8192
    }
    const schema = llm.getCustomizableModelSchemaFromCredentials('test-model', credentials)

    expect(schema?.model_properties?.mode).toBe('completion')
    expect(schema?.features).not.toContain(ModelFeature.TOOL_CALL)
    expect(schema?.features).toContain(ModelFeature.VISION)
    expect(schema?.model_properties?.context_size).toBe(8192)
  })

  it('should default to chat mode if completion_type is missing', () => {
    const credentials = {
      // completion_type missing
    }
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
})
