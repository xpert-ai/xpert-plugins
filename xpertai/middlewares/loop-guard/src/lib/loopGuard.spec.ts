/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => () => null,
}))

import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { messagesStateReducer } from '@langchain/langgraph'
const { LoopGuardMiddleware, LoopGuardTriggeredError } = require('./loopGuard')

describe('LoopGuardMiddleware', () => {
  const createContext = () => ({
    tenantId: 'tenant-1',
    userId: 'user-1',
    xpertId: 'xpert-1',
    node: { key: 'node-1', title: 'Loop Guard', type: 'middleware', entity: { type: 'middleware' } },
    tools: new Map(),
  })

  const createToolCall = (id: string, name: string, args: Record<string, unknown>) => ({
    id,
    name,
    args,
    type: 'tool_call' as const,
  })

  const createToolResult = (id: string, name: string, content: string) =>
    new ToolMessage({
      tool_call_id: id,
      name,
      content,
    })

  const createBatch = (
    aiId: string,
    calls: Array<{ id: string; name: string; args: Record<string, unknown> }>
  ) =>
    new AIMessage({
      id: aiId,
      content: '',
      tool_calls: calls.map((call) => createToolCall(call.id, call.name, call.args)),
    })

  async function createMiddleware(config: any = {}) {
    const strategy = new LoopGuardMiddleware()
    const middleware = await strategy.createMiddleware(config, createContext())
    return { strategy, middleware }
  }

  it('injects a warning on the next model call after the warn threshold is reached', async () => {
    const { middleware } = await createMiddleware({
      warnThreshold: 2,
      hardLimit: 4,
      windowSize: 4,
    })

    const batch1 = createBatch('ai-1', [{ id: 'call-1', name: 'search', args: { query: 'alpha' } }])
    const first = await middleware.afterModel?.hook?.({
      messages: [batch1],
      loopDetectionWindow: [],
      loopDetectionWarned: [],
    })

    expect(first?.loopDetectionWindow).toHaveLength(1)
    expect(first?.loopDetectionPendingWarning).toBeUndefined()

    const batch2 = createBatch('ai-2', [{ id: 'call-2', name: 'search', args: { query: 'alpha' } }])
    const second = await middleware.afterModel?.hook?.({
      ...first,
      messages: [batch1, createToolResult('call-1', 'search', 'ok'), batch2],
    })

    expect(second?.jumpTo).toBeUndefined()
    expect(second?.messages).toBeUndefined()
    expect(second?.loopDetectionPendingWarning?.count).toBe(2)

    const before = await middleware.beforeModel?.hook?.({
      ...second,
      messages: [batch1, createToolResult('call-1', 'search', 'ok'), batch2, createToolResult('call-2', 'search', 'ok')],
    })

    expect(before?.loopDetectionPendingWarning).toBeUndefined()
    expect(before?.messages).toHaveLength(1)
    expect(before?.messages?.[0]).toBeInstanceOf(HumanMessage)
    expect((before?.messages?.[0] as HumanMessage).content).toContain('Loop guard warning')
  })

  it('treats repeated multi-tool batches as a single normalized pattern regardless of order', async () => {
    const { middleware } = await createMiddleware({
      warnThreshold: 2,
      hardLimit: 4,
      windowSize: 4,
    })

    const batch1 = createBatch('ai-1', [
      { id: 'call-1', name: 'search', args: { query: 'alpha' } },
      { id: 'call-2', name: 'fetch', args: { url: 'https://example.com' } },
    ])
    const first = await middleware.afterModel?.hook?.({
      messages: [batch1],
      loopDetectionWindow: [],
      loopDetectionWarned: [],
    })

    const batch2 = createBatch('ai-2', [
      { id: 'call-4', name: 'fetch', args: { url: 'https://example.com' } },
      { id: 'call-3', name: 'search', args: { query: 'alpha' } },
    ])
    const second = await middleware.afterModel?.hook?.({
      ...first,
      messages: [
        batch1,
        createToolResult('call-1', 'search', 'ok'),
        createToolResult('call-2', 'fetch', 'ok'),
        batch2,
      ],
    })

    expect(second?.loopDetectionPendingWarning?.count).toBe(2)
    expect(second?.loopDetectionPendingWarning?.tools).toEqual(['fetch', 'search'])
  })

  it('hard stops by clearing the repeated batch and appending a final AI message', async () => {
    const { middleware } = await createMiddleware({
      warnThreshold: 2,
      hardLimit: 3,
      windowSize: 3,
      onLoop: 'end',
    })

    const batch1 = createBatch('ai-1', [{ id: 'call-1', name: 'search', args: { query: 'alpha' } }])
    const first = await middleware.afterModel?.hook?.({
      messages: [batch1],
      loopDetectionWindow: [],
      loopDetectionWarned: [],
    })

    const batch2 = createBatch('ai-2', [{ id: 'call-2', name: 'search', args: { query: 'alpha' } }])
    const second = await middleware.afterModel?.hook?.({
      ...first,
      messages: [batch1, createToolResult('call-1', 'search', 'ok'), batch2],
    })

    const batch3 = createBatch('ai-3', [{ id: 'call-3', name: 'search', args: { query: 'alpha' } }])
    const third = await middleware.afterModel?.hook?.({
      ...second,
      messages: [
        batch1,
        createToolResult('call-1', 'search', 'ok'),
        batch2,
        createToolResult('call-2', 'search', 'ok'),
        batch3,
      ],
    })

    expect(third?.jumpTo).toBe('end')
    expect(third?.messages).toHaveLength(2)
    expect((third?.messages?.[0] as AIMessage).tool_calls).toEqual([])
    expect((third?.messages?.[1] as AIMessage).content).toContain('Stopped because')

    const merged = messagesStateReducer(
      [
        batch1,
        createToolResult('call-1', 'search', 'ok'),
        batch2,
        createToolResult('call-2', 'search', 'ok'),
        batch3,
      ],
      third?.messages ?? []
    )

    const replacedBatch = merged.find((message) => message.id === 'ai-3') as AIMessage
    const lastMessage = merged[merged.length - 1] as AIMessage
    expect(replacedBatch.tool_calls).toEqual([])
    expect(lastMessage).toBeInstanceOf(AIMessage)
    expect(lastMessage.tool_calls ?? []).toEqual([])
  })

  it('keeps continue mode as warning-only even after the hard limit is reached', async () => {
    const { middleware } = await createMiddleware({
      warnThreshold: 2,
      hardLimit: 2,
      windowSize: 2,
      onLoop: 'continue',
    })

    const batch1 = createBatch('ai-1', [{ id: 'call-1', name: 'search', args: { query: 'alpha' } }])
    const first = await middleware.afterModel?.hook?.({
      messages: [batch1],
      loopDetectionWindow: [],
      loopDetectionWarned: [],
    })

    const batch2 = createBatch('ai-2', [{ id: 'call-2', name: 'search', args: { query: 'alpha' } }])
    const second = await middleware.afterModel?.hook?.({
      ...first,
      messages: [batch1, createToolResult('call-1', 'search', 'ok'), batch2],
    })

    expect(second?.jumpTo).toBeUndefined()
    expect(second?.messages).toBeUndefined()
    expect(second?.loopDetectionPendingWarning?.count).toBe(2)
  })

  it('still ignores built-in volatile arg keys when hashing repeated batches', async () => {
    const { middleware } = await createMiddleware({
      hardLimit: 2,
      windowSize: 2,
      onLoop: 'end',
    })

    const batch1 = createBatch('ai-1', [
      { id: 'call-1', name: 'search', args: { query: 'alpha', timestamp: 1 } },
    ])
    const first = await middleware.afterModel?.hook?.({
      messages: [batch1],
      loopDetectionWindow: [],
      loopDetectionWarned: [],
    })

    const batch2 = createBatch('ai-2', [
      { id: 'call-2', name: 'search', args: { query: 'alpha', timestamp: 2 } },
    ])
    const second = await middleware.afterModel?.hook?.({
      ...first,
      messages: [batch1, createToolResult('call-1', 'search', 'ok'), batch2],
    })

    expect(second?.jumpTo).toBe('end')
  })

  it('rejects removed legacy compatibility and debug fields', async () => {
    await expect(
      createMiddleware({
        maxRepeatedCalls: 2,
        maxRepeatedFailures: 2,
        detectSameResult: true,
        userMessage: 'stop',
        toolMessage: 'warn',
        debugState: true,
      })
    ).rejects.toThrow(/unrecognized key/i)
  })

  it('does not treat different arguments with identical tool results as a loop', async () => {
    const { middleware } = await createMiddleware({
      warnThreshold: 2,
      hardLimit: 2,
      windowSize: 2,
      onLoop: 'end',
    })

    const batch1 = createBatch('ai-1', [{ id: 'call-1', name: 'search', args: { query: 'alpha' } }])
    const first = await middleware.afterModel?.hook?.({
      messages: [batch1],
      loopDetectionWindow: [],
      loopDetectionWarned: [],
    })

    const batch2 = createBatch('ai-2', [{ id: 'call-2', name: 'search', args: { query: 'beta' } }])
    const second = await middleware.afterModel?.hook?.({
      ...first,
      messages: [batch1, createToolResult('call-1', 'search', '[]'), batch2],
    })

    expect(second?.jumpTo).toBeUndefined()
    expect(second?.loopDetectionPendingWarning).toBeUndefined()
  })

  it('throws a dedicated error when hard limit is reached in error mode', async () => {
    const { middleware } = await createMiddleware({
      warnThreshold: 2,
      hardLimit: 2,
      windowSize: 2,
      onLoop: 'error',
    })

    const batch1 = createBatch('ai-1', [{ id: 'call-1', name: 'search', args: { query: 'alpha' } }])
    const first = await middleware.afterModel?.hook?.({
      messages: [batch1],
      loopDetectionWindow: [],
      loopDetectionWarned: [],
    })

    const batch2 = createBatch('ai-2', [{ id: 'call-2', name: 'search', args: { query: 'alpha' } }])
    await expect(
      middleware.afterModel?.hook?.({
        ...first,
        messages: [batch1, createToolResult('call-1', 'search', 'ok'), batch2],
      })
    ).rejects.toBeInstanceOf(LoopGuardTriggeredError)
  })
})
