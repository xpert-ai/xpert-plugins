jest.mock('@xpert-ai/plugin-sdk', () => ({
  AIModelProviderStrategy: () => () => undefined,
  ChatOAICompatReasoningModel: class {
    constructor(
      readonly clientConfig: {
        temperature?: number
        topP?: number
        maxTokens?: number
        modelKwargs?: object
      }
    ) {}

    invocationParams() {
      return {
        ...(this.clientConfig.temperature === undefined ? {} : { temperature: this.clientConfig.temperature }),
        ...(this.clientConfig.topP === undefined ? {} : { top_p: this.clientConfig.topP }),
        ...(this.clientConfig.modelKwargs ?? {}),
        ...(this.clientConfig.maxTokens === undefined ? {} : { max_tokens: this.clientConfig.maxTokens })
      }
    }
  },
  CredentialsValidateFailedError: class extends Error {},
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  LargeLanguageModel: class {
    createHandleUsageCallbacks() {
      return []
    }

    createHandleLLMErrorCallbacks() {
      return {}
    }
  },
  ModelProvider: class {}
}))

jest.mock('lodash-es', () => ({
  isNil: (value: unknown) => value === null || value === undefined,
  omitBy: (value: object, predicate: (item: unknown) => boolean) =>
    Object.fromEntries(Object.entries(value).filter(([, item]) => !predicate(item)))
}))

import { AiProviderRole } from '@xpert-ai/contracts'
import { VolcengineProviderStrategy } from '../provider.strategy.js'
import { normalizeVolcengineToolSchema, VolcengineLargeLanguageModel } from './llm.js'

type VolcengineModelOptions = {
  temperature?: number
  top_p?: number
  max_tokens?: number
  thinking?: 'enabled' | 'disabled'
  reasoning_effort?: string
  response_format?: 'json_object' | 'json_schema'
  json_schema?: string | Record<string, unknown>
}

function createCopilotModel(
  options?: VolcengineModelOptions
): Parameters<VolcengineLargeLanguageModel['getChatModel']>[0] {
  return {
    model: 'doubao-seed-2-0-mini-260215',
    options,
    copilot: {
      role: AiProviderRole.Primary,
      modelProvider: {
        credentials: {
          ark_api_key: 'test-key'
        }
      }
    }
  }
}

describe('Volcengine model adapter', () => {
  const llm = new VolcengineLargeLanguageModel(new VolcengineProviderStrategy())

  it('converts the disabled thinking selector to the Ark request body', () => {
    const model = llm.getChatModel(createCopilotModel({ thinking: 'disabled' }))

    expect(model.invocationParams()).toEqual({
      thinking: {
        type: 'disabled'
      },
      reasoning_effort: 'minimal'
    })
  })

  it('passes the enabled thinking selector without overriding reasoning effort', () => {
    const model = llm.getChatModel(createCopilotModel({ thinking: 'enabled' }))

    expect(model.invocationParams()).toEqual({
      thinking: {
        type: 'enabled'
      }
    })
  })

  it('forwards an explicit reasoning effort value', () => {
    const model = llm.getChatModel(createCopilotModel({ thinking: 'disabled', reasoning_effort: 'high' }))

    expect(model.invocationParams()).toEqual({
      thinking: {
        type: 'disabled'
      },
      reasoning_effort: 'high'
    })
  })

  it('preserves the provider default when thinking is not configured', () => {
    const model = llm.getChatModel(createCopilotModel())

    expect(model.invocationParams()).toEqual({})
  })

  it('forwards the configured max tokens to the Ark request', () => {
    const model = llm.getChatModel(createCopilotModel({ max_tokens: 2048 }))

    expect(model.invocationParams()).toEqual({ max_tokens: 2048 })
  })

  it('forwards sampling and structured-output parameters to the Ark request', () => {
    const schema = {
      type: 'object',
      properties: {
        answer: { type: 'string' }
      },
      required: ['answer']
    }
    const model = llm.getChatModel(
      createCopilotModel({
        temperature: 0.4,
        top_p: 0.8,
        response_format: 'json_schema',
        json_schema: JSON.stringify(schema)
      })
    )

    expect(model.invocationParams()).toEqual({
      temperature: 0.4,
      top_p: 0.8,
      response_format: {
        type: 'json_schema',
        json_schema: schema
      }
    })
  })

  it('inlines local schema references that cross anyOf array members', () => {
    const schema = {
      type: 'object',
      properties: {
        createShapes: {
          type: 'array',
          items: {
            anyOf: [
              {
                type: 'object',
                properties: {
                  id: { type: 'string', pattern: '^shape:' },
                  width: { type: 'number' }
                }
              },
              {
                type: 'object',
                properties: {
                  id: { $ref: '#/properties/createShapes/items/anyOf/0/properties/id' },
                  height: {
                    $ref: '#/properties/createShapes/items/anyOf/0/properties/width',
                    description: 'Shape height.'
                  }
                }
              }
            ]
          }
        }
      }
    }

    const normalized = normalizeVolcengineToolSchema(schema) as typeof schema
    const secondProperties = normalized.properties.createShapes.items.anyOf[1].properties

    expect(secondProperties.id).toEqual({ type: 'string', pattern: '^shape:' })
    expect(secondProperties.height).toEqual({ type: 'number', description: 'Shape height.' })
    expect(schema.properties.createShapes.items.anyOf[1].properties.id).toEqual({
      $ref: '#/properties/createShapes/items/anyOf/0/properties/id'
    })
  })

  it('preserves named references that do not traverse arrays', () => {
    const schema = {
      type: 'object',
      $defs: {
        recursiveValue: {
          anyOf: [{ type: 'string' }, { $ref: '#/$defs/recursiveValue' }]
        }
      },
      properties: {
        value: { $ref: '#/$defs/recursiveValue' }
      }
    }

    expect(normalizeVolcengineToolSchema(schema)).toEqual(schema)
  })
})
