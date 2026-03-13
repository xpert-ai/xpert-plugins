/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => () => null,
}))

import { ToolMessage } from '@langchain/core/messages'
import { calculateRetryDelay } from './retry'
const { ToolRetryMiddleware } = require('./toolRetry')

describe('ToolRetryMiddleware', () => {
  const createContext = () => ({
    tenantId: 'tenant-1',
    userId: 'user-1',
    xpertId: 'xpert-1',
    node: { key: 'node-1', title: 'Tool Retry', type: 'middleware', entity: { type: 'middleware' } },
    tools: new Map(),
  })

  const createRequest = (toolName = 'query_data') => ({
    toolCall: {
      id: 'tc-1',
      name: toolName,
      args: {},
      type: 'tool_call',
    },
    tool: { name: toolName },
    state: { messages: [] },
    runtime: { configurable: { thread_id: 'thread-1' } },
  })

  async function createMiddleware(config: any) {
    const strategy = new ToolRetryMiddleware()
    const middleware = await strategy.createMiddleware(config, createContext())
    return { strategy, middleware }
  }

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('passes through non-targeted tools without retry logic', async () => {
    const { middleware } = await createMiddleware({
      toolNames: ['search_database'],
      initialDelayMs: 0,
      jitter: false,
    })
    const handler = jest.fn().mockResolvedValue(
      new ToolMessage({
        content: 'ok',
        tool_call_id: 'tc-1',
        name: 'query_data',
      })
    )

    const result = await middleware.wrapToolCall?.(createRequest('query_data'), handler as any)

    expect(handler).toHaveBeenCalledTimes(1)
    expect((result as ToolMessage).content).toBe('ok')
  })

  it('retries matching tool failures and succeeds on the next attempt', async () => {
    const { middleware } = await createMiddleware({
      maxRetries: 2,
      initialDelayMs: 0,
      jitter: false,
    })
    const handler = jest
      .fn()
      .mockRejectedValueOnce(new Error('temporary issue'))
      .mockResolvedValueOnce(
        new ToolMessage({
          content: 'done',
          tool_call_id: 'tc-1',
          name: 'query_data',
        })
      )

    const result = await middleware.wrapToolCall?.(createRequest(), handler as any)

    expect(handler).toHaveBeenCalledTimes(2)
    expect((result as ToolMessage).content).toBe('done')
  })

  it('returns a ToolMessage for exhausted retries in continue mode', async () => {
    const timeoutError = Object.assign(new Error('deadline exceeded'), { name: 'TimeoutError' })
    const { middleware } = await createMiddleware({
      maxRetries: 1,
      retryAllErrors: false,
      retryableErrorNames: ['TimeoutError'],
      initialDelayMs: 0,
      jitter: false,
    })
    const handler = jest.fn().mockRejectedValue(timeoutError)

    const result = await middleware.wrapToolCall?.(createRequest('query_data'), handler as any)

    expect(handler).toHaveBeenCalledTimes(2)
    expect(result).toBeInstanceOf(ToolMessage)
    expect((result as ToolMessage).tool_call_id).toBe('tc-1')
    expect((result as ToolMessage).name).toBe('query_data')
    expect((result as any).status).toBe('error')
    expect((result as ToolMessage).content).toContain("Tool 'query_data' failed after 2 attempts")
  })

  it('rethrows when onFailure is error', async () => {
    const { middleware } = await createMiddleware({
      maxRetries: 0,
      onFailure: 'error',
    })
    const handler = jest.fn().mockRejectedValue(new Error('fatal tool'))

    await expect(middleware.wrapToolCall?.(createRequest(), handler as any)).rejects.toThrow(
      'fatal tool'
    )
  })

  it('matches retry conditions by status code and message fragment', async () => {
    const { middleware } = await createMiddleware({
      maxRetries: 1,
      retryAllErrors: false,
      retryableStatusCodes: [503],
      retryableMessageIncludes: ['temporarily unavailable'],
      initialDelayMs: 0,
      jitter: false,
    })

    const statusError = Object.assign(new Error('service temporarily unavailable'), {
      statusCode: 503,
    })
    const handler = jest
      .fn()
      .mockRejectedValueOnce(statusError)
      .mockResolvedValueOnce(
        new ToolMessage({
          content: 'ok',
          tool_call_id: 'tc-1',
          name: 'query_data',
        })
      )

    const result = await middleware.wrapToolCall?.(createRequest(), handler as any)

    expect(handler).toHaveBeenCalledTimes(2)
    expect((result as ToolMessage).content).toBe('ok')
  })

  it('validates matcher configuration when retryAllErrors is false', async () => {
    const strategy = new ToolRetryMiddleware()

    await expect(
      strategy.createMiddleware(
        {
          retryAllErrors: false,
        },
        createContext()
      )
    ).rejects.toThrow('at least one retry matcher')
  })

  it('calculates bounded delay with jitter', () => {
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(1)

    expect(
      calculateRetryDelay(
        {
          initialDelayMs: 2000,
          backoffFactor: 2,
          maxDelayMs: 5000,
          jitter: true,
        },
        1
      )
    ).toBe(5000)

    randomSpy.mockRestore()
  })
})
