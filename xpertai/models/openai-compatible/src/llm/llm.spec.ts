import { OpenAIClient } from '@langchain/openai'
import { OAIAPICompatLargeLanguageModel, StableOpenAICompatibleChatModel } from './llm.js'
import { OpenAICompatibleProviderStrategy } from '../provider.strategy.js'
import { ModelFeature } from '@xpert-ai/contracts'
import { TChatModelOptions } from '@xpert-ai/plugin-sdk'
import { OpenAICompatModelCredentials, toCredentialKwargs } from '../types.js'

class TestableStableOpenAICompatibleChatModel extends StableOpenAICompatibleChatModel {
  convertDelta(
    delta: Record<string, unknown>,
    rawResponse: OpenAIClient.ChatCompletionChunk,
    defaultRole?: 'function' | 'user' | 'system' | 'developer' | 'assistant' | 'tool'
  ) {
    return this._convertCompletionsDeltaToBaseMessageChunk(delta, rawResponse, defaultRole)
  }

  convertMessage(message: OpenAIClient.ChatCompletionMessage, rawResponse: OpenAIClient.ChatCompletion) {
    return this._convertCompletionsMessageToBaseMessage(message, rawResponse)
  }
}

describe('getCustomizableModelSchemaFromCredentials', () => {
  let llm: OAIAPICompatLargeLanguageModel
  let provider: OpenAICompatibleProviderStrategy

  beforeEach(() => {
    provider = new OpenAICompatibleProviderStrategy()
    llm = new OAIAPICompatLargeLanguageModel(provider)
  })

  it('should replace placeholder chat completion ids for streaming chunks', () => {
    const model = createTestChatModel()
    const firstRoleChunk = model.convertDelta({ role: 'assistant' }, createChunk('chatcmpl', 1))
    const firstToolChunk = model.convertDelta(
      {
        tool_calls: [
          {
            index: 0,
            id: 'call-1',
            type: 'function',
            function: {
              name: 'sandbox_shell',
              arguments: '{}'
            }
          }
        ]
      },
      createChunk('chatcmpl', 1),
      'assistant'
    )
    const secondRoleChunk = model.convertDelta({ role: 'assistant' }, createChunk('chatcmpl', 2))

    expect(firstRoleChunk.id).toMatch(/^chatcmpl-/)
    expect(firstRoleChunk.id).not.toBe('chatcmpl')
    expect(firstToolChunk.id).toBe(firstRoleChunk.id)
    expect(secondRoleChunk.id).toMatch(/^chatcmpl-/)
    expect(secondRoleChunk.id).not.toBe(firstRoleChunk.id)
  })

  it('should keep valid chat completion ids unchanged', () => {
    const model = createTestChatModel()
    const message = model.convertMessage(createAssistantMessage('call-1'), createCompletion('chatcmpl-valid-1'))

    expect(message.id).toBe('chatcmpl-valid-1')
  })

  it('should replace placeholder chat completion ids for non-streaming messages', () => {
    const model = createTestChatModel()
    const firstMessage = model.convertMessage(createAssistantMessage('call-1'), createCompletion('chatcmpl'))
    const secondMessage = model.convertMessage(createAssistantMessage('call-2'), createCompletion('chatcmpl'))

    expect(firstMessage.id).toMatch(/^chatcmpl-/)
    expect(firstMessage.id).not.toBe('chatcmpl')
    expect(secondMessage.id).toMatch(/^chatcmpl-/)
    expect(secondMessage.id).not.toBe(firstMessage.id)
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

function createTestChatModel() {
  return new TestableStableOpenAICompatibleChatModel({
    apiKey: 'test-key',
    model: 'test-model',
    configuration: {
      baseURL: 'http://test.com'
    }
  })
}

function createChunk(id: string, created: number): OpenAIClient.ChatCompletionChunk {
  return {
    id,
    object: 'chat.completion.chunk',
    created,
    model: 'test-model',
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: null
      }
    ]
  }
}

function createCompletion(id: string): OpenAIClient.ChatCompletion {
  const message = createAssistantMessage('call-1')

  return {
    id,
    object: 'chat.completion',
    created: 1,
    model: 'test-model',
    choices: [
      {
        index: 0,
        message,
        finish_reason: 'tool_calls',
        logprobs: null
      }
    ]
  }
}

function createAssistantMessage(toolCallId: string): OpenAIClient.ChatCompletionMessage {
  return {
    role: 'assistant',
    content: '',
    refusal: null,
    tool_calls: [
      {
        id: toolCallId,
        type: 'function',
        function: {
          name: 'sandbox_shell',
          arguments: '{}'
        }
      }
    ]
  }
}
