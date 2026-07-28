jest.mock('@xpert-ai/plugin-sdk', () => ({
  AIModelProviderStrategy: () => () => undefined,
  ChatOAICompatReasoningModel: class {
    constructor(readonly clientConfig: { modelKwargs?: object }) {}

    invocationParams() {
      return this.clientConfig.modelKwargs ?? {}
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
import { VolcengineLargeLanguageModel } from './llm.js'

function createCopilotModel(
  thinking?: 'enabled' | 'disabled'
): Parameters<VolcengineLargeLanguageModel['getChatModel']>[0] {
  return {
    model: 'doubao-seed-2-0-mini-260215',
    options: thinking ? { thinking } : undefined,
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
    const model = llm.getChatModel(createCopilotModel('disabled'))

    expect(model.invocationParams()).toEqual({
      thinking: {
        type: 'disabled'
      },
      reasoning_effort: 'minimal'
    })
  })

  it('passes the enabled thinking selector without overriding reasoning effort', () => {
    const model = llm.getChatModel(createCopilotModel('enabled'))

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
})
