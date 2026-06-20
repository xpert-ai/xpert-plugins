/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => () => null,
}))

jest.mock('@xpert-ai/contracts', () => ({
  AiModelTypeEnum: {
    LLM: 'llm',
  },
}))

import { AIMessage } from '@langchain/core/messages'
const { ModelFallbackMiddleware } = require('./modelFallback')

describe('ModelFallbackMiddleware', () => {
  const fallbackClient = { model: 'fallback-client' }

  const createRuntimeApi = () => ({
    createModelClient: jest.fn().mockResolvedValue(fallbackClient),
    wrapWorkflowNodeExecution: jest.fn(),
    emitMiddlewareEvent: jest.fn().mockResolvedValue(undefined),
  })

  const createContext = (runtime = createRuntimeApi()) => ({
    tenantId: 'tenant-1',
    userId: 'user-1',
    xpertId: 'xpert-1',
    node: { key: 'node-1', title: 'Model Fallback', type: 'middleware', entity: { type: 'middleware' } },
    tools: new Map(),
    runtime,
  })

  const createRequest = () => ({
    model: { model: 'primary-model' },
    messages: [],
    tools: [],
    state: { messages: [] },
    runtime: {
      configurable: {
        thread_id: 'thread-1',
        executionId: 'exec-1',
      },
    },
  })

  async function createMiddleware(config: any) {
    const strategy = new ModelFallbackMiddleware()
    const runtimeApi = createRuntimeApi()
    const middleware = await strategy.createMiddleware(config, createContext(runtimeApi))
    return { middleware, runtimeApi }
  }

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('passes through when the primary model succeeds', async () => {
    const { middleware, runtimeApi } = await createMiddleware({
      fallbackModels: [{ provider: 'openai', model: 'fallback-model' }],
    })
    const handler = jest.fn().mockResolvedValue(new AIMessage('primary ok'))

    const result = await middleware.wrapModelCall?.(createRequest(), handler as any)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(runtimeApi.createModelClient).not.toHaveBeenCalled()
    expect(runtimeApi.wrapWorkflowNodeExecution).not.toHaveBeenCalled()
    expect(runtimeApi.emitMiddlewareEvent).not.toHaveBeenCalled()
    expect(result?.content).toBe('primary ok')
  })

  it('uses fallback models and emits middleware events without child execution', async () => {
    const fallbackModel = { provider: 'openai', model: 'fallback-model' }
    const { middleware, runtimeApi } = await createMiddleware({
      fallbackModels: [fallbackModel],
    })
    const handler = jest
      .fn()
      .mockRejectedValueOnce(new Error('primary down'))
      .mockResolvedValueOnce(new AIMessage('fallback ok'))

    const result = await middleware.wrapModelCall?.(createRequest(), handler as any)

    expect(runtimeApi.createModelClient).toHaveBeenCalledWith(
      fallbackModel,
      expect.objectContaining({
        usageCallback: expect.any(Function),
      })
    )
    expect(handler).toHaveBeenCalledTimes(2)
    expect(handler).toHaveBeenLastCalledWith(
      expect.objectContaining({
        model: fallbackClient,
      })
    )
    expect(runtimeApi.wrapWorkflowNodeExecution).not.toHaveBeenCalled()
    expect(runtimeApi.emitMiddlewareEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        middlewareName: 'ModelFallbackMiddleware',
        middlewareKey: 'node-1',
        title: 'Model fallback',
        phase: 'fallback_started',
        status: 'running',
        executionId: 'exec-1',
        threadId: 'thread-1',
      })
    )
    expect(runtimeApi.emitMiddlewareEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'fallback_succeeded',
        status: 'success',
      })
    )
    expect(runtimeApi.emitMiddlewareEvent.mock.calls.some(([event]) => 'agentKey' in event)).toBe(false)
    expect(result?.content).toBe('fallback ok')
  })

  it('emits fallback failure events and throws the last error when all models fail', async () => {
    const { middleware, runtimeApi } = await createMiddleware({
      fallbackModels: [{ provider: 'openai', model: 'fallback-a' }],
    })
    const handler = jest
      .fn()
      .mockRejectedValueOnce(new Error('primary down'))
      .mockRejectedValueOnce(new Error('fallback down'))

    await expect(middleware.wrapModelCall?.(createRequest(), handler as any)).rejects.toThrow('fallback down')

    expect(runtimeApi.wrapWorkflowNodeExecution).not.toHaveBeenCalled()
    expect(runtimeApi.emitMiddlewareEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'fallback_failed',
        status: 'fail',
        error: expect.objectContaining({
          message: 'fallback down',
        }),
      })
    )
  })
})
