jest.mock('@xpert-ai/plugin-sdk', () => ({
  AIModelProviderStrategy: () => () => undefined,
  ChatOAICompatReasoningModel: class {
    constructor(readonly clientConfig: { modelKwargs?: object }) {}

    invocationParams() {
      return this.clientConfig.modelKwargs ?? {}
    }
  },
  LargeLanguageModel: class {
    getParameterRules() {
      return []
    }

    getModelProfile() {
      return {}
    }

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
import { ZhipuAILargeLanguageModel } from './llm.js'

function createCopilotModel(options: Record<string, unknown>) {
  return {
    model: 'glm-5.3-flash',
    options,
    copilot: {
      role: AiProviderRole.Primary,
      modelProvider: {
        credentials: {
          api_key: 'test-key'
        }
      }
    }
  } as Parameters<ZhipuAILargeLanguageModel['getChatModel']>[0]
}

describe('ZhipuAI model adapter', () => {
  it('forwards the configured reasoning effort', () => {
    const llm = new ZhipuAILargeLanguageModel({} as ConstructorParameters<typeof ZhipuAILargeLanguageModel>[0])

    const model = llm.getChatModel(createCopilotModel({ reasoning_effort: 'low' }))

    expect(model.invocationParams()).toEqual({
      reasoning_effort: 'low'
    })
  })
})
