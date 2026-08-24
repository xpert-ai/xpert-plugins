import { AiModelTypeEnum, ModelFeature, ParameterType } from '@xpert-ai/contracts'
import { OpenRouterProviderStrategy } from '../provider.strategy.js'
import {
  buildOpenRouterRuntimeOptions,
  OpenRouterLargeLanguageModel
} from './llm.js'
import { OpenRouterAiBaseUrl, toCredentialKwargs } from '../types.js'

describe('OpenRouterLargeLanguageModel', () => {
  let llm: OpenRouterLargeLanguageModel

  beforeEach(() => {
    llm = new OpenRouterLargeLanguageModel(new OpenRouterProviderStrategy())
  })

  it('normalizes the endpoint and sends OpenRouter attribution headers', () => {
    expect(
      toCredentialKwargs({
        api_key: 'test-key',
        endpoint_url: ' https://router.example.com/api/v1/ '
      }, 'custom/model')
    ).toEqual({
      apiKey: 'test-key',
      model: 'custom/model',
      configuration: {
        baseURL: 'https://router.example.com/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://xpertai.cn/',
          'X-Title': 'XpertAI'
        }
      }
    })
    expect(toCredentialKwargs({ api_key: 'test-key' }).configuration.baseURL).toBe(OpenRouterAiBaseUrl)
  })

  it('maps Dify-compatible runtime controls to OpenRouter request parameters', () => {
    expect(
      buildOpenRouterRuntimeOptions(
        { api_key: 'test-key' },
        {
          enable_thinking: true,
          exclude_reasoning_tokens: 'true',
          reasoning_budget: '2048',
          reasoning_effort: 'high',
          verbosity: 'low',
          response_format: 'json_schema',
          json_schema: JSON.stringify({
            name: 'answer',
            schema: { type: 'object', properties: { answer: { type: 'string' } } },
            strict: true
          }),
          provider: { order: ['openai'] }
        }
      )
    ).toEqual({
      reasoning: {
        enabled: true,
        exclude: true,
        max_tokens: 2048,
        effort: 'high'
      },
      verbosity: 'low',
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'answer',
          schema: { type: 'object', properties: { answer: { type: 'string' } } },
          strict: true
        }
      },
      provider: { order: ['openai'], data_collection: 'allow' }
    })
  })

  it('declares dynamic model capabilities from explicit credentials', () => {
    const schema = llm.getCustomizableModelSchemaFromCredentials('custom/model', {
      display_name: 'Custom OpenRouter model',
      mode: 'chat',
      context_size: '128000',
      max_tokens_to_sample: '8192',
      function_calling_type: 'tool_call',
      vision_support: 'support',
      reasoning_support: 'support',
      structured_output_support: 'support'
    })

    expect(schema).toMatchObject({
      model: 'custom/model',
      label: { en_US: 'Custom OpenRouter model', zh_Hans: 'Custom OpenRouter model' },
      model_type: AiModelTypeEnum.LLM,
      model_properties: {
        mode: 'chat',
        context_size: 128000
      }
    })
    expect(schema?.features).toEqual(
      expect.arrayContaining([
        ModelFeature.TOOL_CALL,
        ModelFeature.VISION,
        ModelFeature.AGENT_THOUGHT,
        ModelFeature.STRUCTURED_OUTPUT
      ])
    )

    const rules = Object.fromEntries((schema?.parameter_rules ?? []).map((rule: any) => [rule.name, rule]))
    expect(rules.max_tokens).toMatchObject({ type: ParameterType.INT, max: 128000 })
    expect(rules.reasoning_effort.options).toContain('xhigh')
    expect(rules.response_format.options).toContain('json_schema')
  })

  it('passes runtime options to the OpenRouter chat model', () => {
    const model = llm.getChatModel({
      model: 'custom/model',
      options: {
        temperature: '0.2',
        top_p: '0.9',
        max_tokens: '1024',
        reasoning_effort: 'medium'
      },
      copilot: {
        modelProvider: {
          credentials: {
            api_key: 'test-key'
          }
        }
      }
    } as any)

    expect(model.invocationParams()).toEqual(
      expect.objectContaining({
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: 1024,
        reasoning: { effort: 'medium' },
        provider: { data_collection: 'allow' }
      })
    )
  })
})
