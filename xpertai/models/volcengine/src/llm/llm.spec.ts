jest.mock('@xpert-ai/plugin-sdk', () => ({
  AIModelProviderStrategy: () => () => undefined,
  ChatOAICompatReasoningModel: class {
    constructor(readonly clientConfig: { maxTokens?: number; modelKwargs?: object }) {}

    invocationParams() {
      return {
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
  max_tokens?: number
  thinking?: 'enabled' | 'disabled'
}

function createCopilotModel(options?: VolcengineModelOptions): Parameters<VolcengineLargeLanguageModel['getChatModel']>[0] {
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

  it('preserves the provider default when thinking is not configured', () => {
    const model = llm.getChatModel(createCopilotModel())

    expect(model.invocationParams()).toEqual({})
  })

  it('forwards the configured max tokens to the Ark request', () => {
    const model = llm.getChatModel(createCopilotModel({ max_tokens: 2048 }))

    expect(model.invocationParams()).toEqual({ max_tokens: 2048 })
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
