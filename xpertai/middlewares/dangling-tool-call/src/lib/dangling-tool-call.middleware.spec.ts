/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => () => null,
}))

import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import {
  DANGLING_TOOL_CALL_MIDDLEWARE_NAME,
  DANGLING_TOOL_CALL_PLACEHOLDER_CONTENT,
} from './types.js'
import {
  DanglingToolCallMiddleware,
  DanglingToolCallTestUtils,
} from './dangling-tool-call.middleware.js'

const readFileToolCall = {
  id: 'call_read_file',
  name: 'read_file',
  args: { path: 'foo.txt' },
  type: 'tool_call' as const,
}

const searchToolCall = {
  id: 'call_search',
  name: 'search',
  args: { query: 'latest rate' },
  type: 'tool_call' as const,
}

describe('DanglingToolCallMiddleware', () => {
  const createContext = () =>
    ({
      tenantId: 'tenant-1',
      userId: 'user-1',
      xpertId: 'xpert-1',
      node: { key: 'node-1', title: 'Dangling Tool Call', type: 'middleware', entity: { type: 'middleware' } },
      tools: new Map(),
    }) as any

  const createRequest = (messages: any[]) =>
    ({
      model: { model: 'mock-model' },
      messages,
      tools: [],
      state: { messages: [] },
      runtime: { configurable: {} },
    }) as any

  async function createMiddleware() {
    const strategy = new DanglingToolCallMiddleware()
    const middleware = await strategy.createMiddleware({}, createContext())
    return { strategy, middleware }
  }

  it('exposes an empty config schema', async () => {
    const { strategy } = await createMiddleware()

    expect(strategy.meta.name).toBe(DANGLING_TOOL_CALL_MIDDLEWARE_NAME)
    expect(strategy.meta.configSchema).toEqual({
      type: 'object',
      properties: {},
    })
  })

  it('does not patch an empty message list', () => {
    expect(DanglingToolCallTestUtils.buildPatchedMessages([])).toBeNull()
  })

  it('does not patch when there is no AI message', () => {
    const messages = [new HumanMessage('hello')]

    expect(DanglingToolCallTestUtils.buildPatchedMessages(messages)).toBeNull()
  })

  it('does not patch when AI messages have no tool calls', () => {
    const messages = [new AIMessage('done')]

    expect(DanglingToolCallTestUtils.buildPatchedMessages(messages)).toBeNull()
  })

  it('does not patch when every tool call already has a tool message', () => {
    const messages = [
      new HumanMessage('read file'),
      new AIMessage({ content: '', tool_calls: [readFileToolCall] }),
      new ToolMessage({ content: 'ok', tool_call_id: readFileToolCall.id, name: readFileToolCall.name }),
    ]

    expect(DanglingToolCallTestUtils.buildPatchedMessages(messages)).toBeNull()
  })

  it('patches a single dangling tool call immediately after the source AI message', () => {
    const assistant = new AIMessage({ content: '', tool_calls: [readFileToolCall] })
    const trailing = new HumanMessage('continue')
    const messages = [new HumanMessage('read file'), assistant, trailing]

    const patched = DanglingToolCallTestUtils.buildPatchedMessages(messages)

    expect(patched).not.toBeNull()
    expect(patched).toHaveLength(4)
    expect(patched?.[0]).toBe(messages[0])
    expect(patched?.[1]).toBe(assistant)
    expect(patched?.[3]).toBe(trailing)

    const placeholder = patched?.[2] as ToolMessage
    expect(placeholder).toBeInstanceOf(ToolMessage)
    expect(placeholder.tool_call_id).toBe(readFileToolCall.id)
    expect(placeholder.name).toBe(readFileToolCall.name)
    expect(placeholder.status).toBe('error')
    expect(placeholder.content).toBe(DANGLING_TOOL_CALL_PLACEHOLDER_CONTENT)
    expect(placeholder.metadata).toEqual({
      synthetic: true,
      source: DANGLING_TOOL_CALL_MIDDLEWARE_NAME,
      reason: 'missing_tool_response',
    })
  })

  it('patches multiple dangling tool calls from the same AI message', () => {
    const messages = [new AIMessage({ content: '', tool_calls: [readFileToolCall, searchToolCall] })]

    const patched = DanglingToolCallTestUtils.buildPatchedMessages(messages)

    expect(patched).toHaveLength(3)
    expect((patched?.[1] as ToolMessage).tool_call_id).toBe(readFileToolCall.id)
    expect((patched?.[2] as ToolMessage).tool_call_id).toBe(searchToolCall.id)
  })

  it('only patches the missing subset when some tool calls already have responses', () => {
    const assistant = new AIMessage({ content: '', tool_calls: [readFileToolCall, searchToolCall] })
    const messages = [
      assistant,
      new ToolMessage({ content: 'file ready', tool_call_id: readFileToolCall.id, name: readFileToolCall.name }),
    ]

    const patched = DanglingToolCallTestUtils.buildPatchedMessages(messages)

    expect(patched).toHaveLength(3)
    expect((patched?.[1] as ToolMessage).tool_call_id).toBe(searchToolCall.id)
    expect(patched?.[2]).toBe(messages[1])
  })

  it('patches dangling calls across multiple AI messages', () => {
    const first = new AIMessage({ content: '', tool_calls: [readFileToolCall] })
    const second = new AIMessage({ content: '', tool_calls: [searchToolCall] })
    const messages = [first, new HumanMessage('next'), second]

    const patched = DanglingToolCallTestUtils.buildPatchedMessages(messages)

    expect(patched).toHaveLength(5)
    expect((patched?.[1] as ToolMessage).tool_call_id).toBe(readFileToolCall.id)
    expect(patched?.[2]).toBe(messages[1])
    expect((patched?.[4] as ToolMessage).tool_call_id).toBe(searchToolCall.id)
  })

  it('skips tool calls without ids', () => {
    const messages = [
      new AIMessage({
        content: '',
        tool_calls: [{ ...readFileToolCall, id: undefined as any }],
      }),
    ]

    expect(DanglingToolCallTestUtils.buildPatchedMessages(messages)).toBeNull()
  })

  it('does not patch the same tool call id twice in one pass', () => {
    const messages = [
      new AIMessage({ content: '', tool_calls: [readFileToolCall, { ...readFileToolCall }] }),
    ]

    const patched = DanglingToolCallTestUtils.buildPatchedMessages(messages)

    expect(patched).toHaveLength(2)
    expect((patched?.[1] as ToolMessage).tool_call_id).toBe(readFileToolCall.id)
  })

  it('wrapModelCall forwards the original request when no patch is needed', async () => {
    const { middleware } = await createMiddleware()
    const request = createRequest([new HumanMessage('hello')])
    const handler = jest.fn().mockResolvedValue(new AIMessage('ok'))

    const result = await middleware.wrapModelCall?.(request, handler)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(request)
    expect(result?.content).toBe('ok')
  })

  it('wrapModelCall forwards a patched request when dangling tool calls exist', async () => {
    const { middleware } = await createMiddleware()
    const request = createRequest([new AIMessage({ content: '', tool_calls: [readFileToolCall] })])
    const handler = jest.fn().mockResolvedValue(new AIMessage('ok'))

    await middleware.wrapModelCall?.(request, handler)

    expect(handler).toHaveBeenCalledTimes(1)
    const forwardedRequest = handler.mock.calls[0][0]
    expect(forwardedRequest).not.toBe(request)
    expect(forwardedRequest.messages).toHaveLength(2)
    expect(forwardedRequest.messages[0]).toBe(request.messages[0])
    expect(forwardedRequest.messages[1]).toBeInstanceOf(ToolMessage)
    expect(forwardedRequest.messages[1].content).toBe(DANGLING_TOOL_CALL_PLACEHOLDER_CONTENT)
  })
})
