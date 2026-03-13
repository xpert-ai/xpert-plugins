/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock('@xpert-ai/plugin-sdk', () => {
  class WrapWorkflowNodeExecutionCommand {
    fuc: any
    params: any

    constructor(fuc: any, params: any) {
      this.fuc = fuc
      this.params = params
    }
  }

  class CreateModelClientCommand {
    copilotModel: any
    options: any

    constructor(copilotModel: any, options: any) {
      this.copilotModel = copilotModel
      this.options = options
    }
  }

  return {
    AgentMiddlewareStrategy: () => () => null,
    WrapWorkflowNodeExecutionCommand,
    CreateModelClientCommand,
  }
})

jest.mock('@metad/contracts', () => ({
  WorkflowNodeTypeEnum: {
    MIDDLEWARE: 'middleware',
  },
}))

import { AIMessage } from '@langchain/core/messages'
import { calculateRetryDelay } from './retry'
const { ModelRetryMiddleware } = require('./modelRetry')

describe('ModelRetryMiddleware', () => {
  const createContext = () => ({
    tenantId: 'tenant-1',
    userId: 'user-1',
    xpertId: 'xpert-1',
    node: { key: 'node-1', title: 'Model Retry', type: 'middleware', entity: { type: 'middleware' } },
    tools: new Map(),
  })

  const createRuntime = () => ({
    configurable: {
      thread_id: 'thread-1',
      executionId: 'exec-1',
      checkpoint_ns: 'checkpoint-ns',
      checkpoint_id: 'checkpoint-1',
      subscriber: undefined,
    },
  })

  const createRequest = () => ({
    model: { model: 'mock-model' },
    messages: [],
    tools: [],
    state: { messages: [] },
    runtime: createRuntime(),
  })

  async function createMiddleware(config: any) {
    const strategy = new ModelRetryMiddleware()
    strategy.commandBus = {
      execute: jest.fn().mockImplementation(async (command: any) => {
        if (typeof command?.fuc === 'function') {
          return command.fuc({ id: 'retry-exec-1' })
        }
        return undefined
      }),
    }

    const middleware = await strategy.createMiddleware(config, createContext())
    return { strategy, middleware }
  }

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('passes through when the first model call succeeds', async () => {
    const { strategy, middleware } = await createMiddleware({})
    const handler = jest.fn().mockResolvedValue(new AIMessage('ok'))

    const result = await middleware.wrapModelCall?.(createRequest(), handler as any)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(strategy.commandBus.execute).not.toHaveBeenCalled()
    expect(result?.content).toBe('ok')
  })

  it('retries a failed model call and tracks the retry attempt', async () => {
    const { strategy, middleware } = await createMiddleware({
      maxRetries: 2,
      initialDelayMs: 0,
      jitter: false,
    })
    const handler = jest
      .fn()
      .mockRejectedValueOnce(new Error('temporary outage'))
      .mockResolvedValueOnce(new AIMessage('recovered'))

    const result = await middleware.wrapModelCall?.(createRequest(), handler as any)

    expect(handler).toHaveBeenCalledTimes(2)
    expect(strategy.commandBus.execute).toHaveBeenCalledTimes(1)
    expect(result?.content).toBe('recovered')
  })

  it('retries when the model returns finish_reason network_error', async () => {
    const { strategy, middleware } = await createMiddleware({
      maxRetries: 2,
      initialDelayMs: 0,
      jitter: false,
    })
    const handler = jest
      .fn()
      .mockResolvedValueOnce(
        new AIMessage({
          content: '',
          response_metadata: {
            finish_reason: 'network_error',
            model_name: 'glm-5',
          },
        })
      )
      .mockResolvedValueOnce(new AIMessage('recovered after network error'))

    const result = await middleware.wrapModelCall?.(createRequest(), handler as any)

    expect(handler).toHaveBeenCalledTimes(2)
    expect(strategy.commandBus.execute).toHaveBeenCalledTimes(1)
    expect(result?.content).toBe('recovered after network error')
  })

  it('returns an AIMessage immediately for non-retryable errors in continue mode', async () => {
    const { strategy, middleware } = await createMiddleware({
      retryAllErrors: false,
      retryableErrorNames: ['RateLimitError'],
      initialDelayMs: 0,
      jitter: false,
    })
    const handler = jest.fn().mockRejectedValue(new Error('boom'))

    const result = await middleware.wrapModelCall?.(createRequest(), handler as any)

    expect(strategy.commandBus.execute).not.toHaveBeenCalled()
    expect(result).toBeInstanceOf(AIMessage)
    expect(result?.content).toContain('failed after 1 attempt')
  })

  it('returns an AIMessage after retries are exhausted', async () => {
    const rateLimitError = Object.assign(new Error('429 again'), { name: 'RateLimitError' })
    const { middleware } = await createMiddleware({
      maxRetries: 2,
      retryAllErrors: false,
      retryableErrorNames: ['RateLimitError'],
      initialDelayMs: 0,
      jitter: false,
      onFailure: 'continue',
    })
    const handler = jest.fn().mockRejectedValue(rateLimitError)

    const result = await middleware.wrapModelCall?.(createRequest(), handler as any)

    expect(handler).toHaveBeenCalledTimes(3)
    expect(result).toBeInstanceOf(AIMessage)
    expect(result?.content).toContain('failed after 3 attempts')
    expect(result?.content).toContain('429 again')
  })

  it('returns an AIMessage after network_error retries are exhausted', async () => {
    const { middleware } = await createMiddleware({
      maxRetries: 1,
      initialDelayMs: 0,
      jitter: false,
      onFailure: 'continue',
    })
    const handler = jest.fn().mockResolvedValue(
      new AIMessage({
        content: '',
        response_metadata: {
          finish_reason: 'network_error',
          model_name: 'glm-5',
        },
      })
    )

    const result = await middleware.wrapModelCall?.(createRequest(), handler as any)

    expect(handler).toHaveBeenCalledTimes(2)
    expect(result).toBeInstanceOf(AIMessage)
    expect(result?.content).toContain('ModelNetworkError')
    expect(result?.content).toContain('finish_reason "network_error"')
  })

  it('rethrows after retries are exhausted when onFailure is error', async () => {
    const { middleware } = await createMiddleware({
      maxRetries: 0,
      onFailure: 'error',
    })
    const handler = jest.fn().mockRejectedValue(new Error('fatal'))

    await expect(middleware.wrapModelCall?.(createRequest(), handler as any)).rejects.toThrow(
      'fatal'
    )
  })

  it('validates matcher configuration when retryAllErrors is false', async () => {
    const strategy = new ModelRetryMiddleware()

    await expect(
      strategy.createMiddleware(
        {
          retryAllErrors: false,
        },
        createContext()
      )
    ).rejects.toThrow('at least one retry matcher')
  })

  it('calculates exponential delay without jitter and caps max delay', () => {
    expect(
      calculateRetryDelay(
        {
          initialDelayMs: 1000,
          backoffFactor: 2,
          maxDelayMs: 2500,
          jitter: false,
        },
        2
      )
    ).toBe(2500)
  })

  it('applies bounded jitter and keeps constant delay when backoffFactor is zero', () => {
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(1)

    expect(
      calculateRetryDelay(
        {
          initialDelayMs: 1000,
          backoffFactor: 0,
          maxDelayMs: 5000,
          jitter: true,
        },
        3
      )
    ).toBe(1250)

    randomSpy.mockRestore()
  })
})
