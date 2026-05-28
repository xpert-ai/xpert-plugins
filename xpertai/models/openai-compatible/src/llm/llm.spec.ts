import { OAIAPICompatLargeLanguageModel } from './llm.js'
import { OpenAICompatibleProviderStrategy } from '../provider.strategy.js'
import { ModelFeature } from '@metad/contracts'
import { TChatModelOptions } from '@xpert-ai/plugin-sdk'
import { OpenAICompatModelCredentials, toCredentialKwargs } from '../types.js'

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
    expect(invocationParams['enable_thinking']).toBe(true)
    expect(invocationParams['chat_template_kwargs']).toEqual({
      enable_thinking: true
    })
  })

  it('should pass enable_thinking from copilot model options', () => {
    const credentials: OpenAICompatModelCredentials = {
      api_key: 'test-key',
      endpoint_url: 'http://test.com',
      endpoint_model_name: 'test-model',
      mode: 'chat',
      context_size: '4096',
      max_tokens_to_sample: '4096',
      vision_support: 'no_support'
    }
    const model = llm.getChatModel(
      {
        model: 'test-model',
        options: {
          enable_thinking: true
        }
      },
      { modelProperties: credentials } as unknown as TChatModelOptions,
      null
    )

    const invocationParams = model.invocationParams()
    expect(invocationParams['enable_thinking']).toBe(true)
    expect(invocationParams['chat_template_kwargs']).toEqual({
      enable_thinking: true
    })
  })

  it('should pass enable_thinking false from copilot model options', () => {
    const credentials: OpenAICompatModelCredentials = {
      api_key: 'test-key',
      endpoint_url: 'http://test.com',
      endpoint_model_name: 'test-model',
      mode: 'chat',
      context_size: '4096',
      max_tokens_to_sample: '4096',
      vision_support: 'no_support',
      enable_thinking: true
    }
    const model = llm.getChatModel(
      {
        model: 'test-model',
        options: {
          enable_thinking: false
        }
      },
      { modelProperties: credentials } as unknown as TChatModelOptions,
      null
    )

    const invocationParams = model.invocationParams()
    expect(invocationParams['enable_thinking']).toBe(false)
    expect(invocationParams['chat_template_kwargs']).toEqual({
      enable_thinking: false
    })
  })

  it('should pass runtime sampling, penalty, and retry options', () => {
    const credentials: OpenAICompatModelCredentials = {
      api_key: 'test-key',
      endpoint_url: 'http://test.com',
      endpoint_model_name: 'test-model',
      mode: 'chat',
      context_size: '4096',
      max_tokens_to_sample: '4096',
      vision_support: 'no_support'
    }
    const model = llm.getChatModel(
      {
        model: 'test-model',
        options: {
          temperature: 0.2,
          max_tokens: 8192,
          top_p: 0.8,
          presence_penalty: 0.3,
          frequency_penalty: 0.4,
          maxRetries: 6
        }
      },
      { modelProperties: credentials } as unknown as TChatModelOptions,
      null
    )

    const invocationParams = model.invocationParams()
    expect(invocationParams['temperature']).toBe(0.2)
    expect(invocationParams['max_completion_tokens']).toBe(8192)
    expect(invocationParams['top_p']).toBe(0.8)
    expect(invocationParams['presence_penalty']).toBe(0.3)
    expect(invocationParams['frequency_penalty']).toBe(0.4)
    expect((model as any).caller.maxRetries).toBe(6)
  })

  it('should merge custom body params into invocation params with typed values', () => {
    const credentials = {
      api_key: 'test-key',
      endpoint_url: 'http://test.com',
      endpoint_model_name: 'test-model',
      mode: 'chat',
      context_size: '4096',
      max_tokens_to_sample: '4096',
      vision_support: 'no_support',
      enable_thinking: true,
      customBodyParams: {
        thinking_enable: 'xhigh',
        top_k: 40,
        enable_thinking: false
      }
    } as OpenAICompatModelCredentials

    const model = llm.getChatModel(
      { model: 'test-model' },
      { modelProperties: credentials } as unknown as TChatModelOptions,
      null
    )

    const invocationParams = model.invocationParams()
    expect(invocationParams['thinking_enable']).toBe('xhigh')
    expect(invocationParams['top_k']).toBe(40)
    expect(invocationParams['enable_thinking']).toBe(false)
    expect(invocationParams['chat_template_kwargs']).toEqual({
      enable_thinking: false
    })
  })

  it('should not merge custom body params unless explicitly included', () => {
    const params = toCredentialKwargs(
      {
        api_key: 'test-key',
        endpoint_model_name: 'test-model',
        mode: 'chat',
        context_size: '4096',
        max_tokens_to_sample: '4096',
        vision_support: 'no_support',
        customBodyParams: {
          top_k: 40
        }
      } as OpenAICompatModelCredentials,
      'test-model'
    )

    expect(params.modelKwargs).toEqual({})
  })

  it.each(['model', 'messages', 'stream'])('should reject reserved custom body param key %s', (key) => {
    expect(() =>
      toCredentialKwargs(
        {
          api_key: 'test-key',
          endpoint_model_name: 'test-model',
          mode: 'chat',
          context_size: '4096',
          max_tokens_to_sample: '4096',
          vision_support: 'no_support',
          customBodyParams: {
            [key]: 'blocked'
          }
        } as OpenAICompatModelCredentials,
        'test-model',
        { includeCustomBodyParams: true }
      )
    ).toThrow(`Custom body param '${key}' is reserved`)
  })

  it('should trim and reject empty custom body param keys', () => {
    expect(() =>
      toCredentialKwargs(
        {
          api_key: 'test-key',
          endpoint_model_name: 'test-model',
          mode: 'chat',
          context_size: '4096',
          max_tokens_to_sample: '4096',
          vision_support: 'no_support',
          customBodyParams: {
            '   ': 'blocked'
          }
        } as OpenAICompatModelCredentials,
        'test-model',
        { includeCustomBodyParams: true }
      )
    ).toThrow('Custom body param key must not be empty')
  })

  it('should reject non-object custom body params', () => {
    expect(() =>
      toCredentialKwargs(
        {
          api_key: 'test-key',
          endpoint_model_name: 'test-model',
          mode: 'chat',
          context_size: '4096',
          max_tokens_to_sample: '4096',
          vision_support: 'no_support',
          customBodyParams: ['bad']
        } as unknown as OpenAICompatModelCredentials,
        'test-model',
        { includeCustomBodyParams: true }
      )
    ).toThrow('Custom body params must be an object')
  })

  it.each([
    ['array', ['bad']],
    ['object', { nested: true }],
    ['null', null],
    ['non-finite number', Number.POSITIVE_INFINITY]
  ])('should reject custom body param value %s', (_label, value) => {
    expect(() =>
      toCredentialKwargs(
        {
          api_key: 'test-key',
          endpoint_model_name: 'test-model',
          mode: 'chat',
          context_size: '4096',
          max_tokens_to_sample: '4096',
          vision_support: 'no_support',
          customBodyParams: {
            bad_param: value
          }
        } as OpenAICompatModelCredentials,
        'test-model',
        { includeCustomBodyParams: true }
      )
    ).toThrow("Custom body param 'bad_param' must be a string, finite number, or boolean")
  })
})
