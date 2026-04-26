jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => () => undefined,
}))

jest.mock('@xpert-ai/contracts', () => ({
  AiModelTypeEnum: {
    LLM: 'LLM'
  }
}))

jest.mock('@langchain/core/callbacks/dispatch', () => ({
  dispatchCustomEvent: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('@xpert-ai/chatkit-types', () => ({
  ChatMessageEventTypeEnum: {
    ON_TOOL_MESSAGE: 'on_tool_message'
  },
  ChatMessageStepCategory: {
    List: 'list'
  }
}))

import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { Command } from '@langchain/langgraph'
import { ChatMessageEventTypeEnum } from '@xpert-ai/chatkit-types'
import { AdvisorMiddleware } from './advisor.middleware.js'
import { AdvisorPluginConfigFormSchema } from './advisor.types.js'

describe('AdvisorMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  function createRuntimeApi() {
    return {
      createModelClient: jest.fn(),
      wrapWorkflowNodeExecution: jest.fn()
    }
  }

  function createSubject(options: Record<string, unknown> = {}) {
    const runtimeApi = createRuntimeApi()
    const strategy = new AdvisorMiddleware()
    const middleware = strategy.createMiddleware(
      {
        advisorModel: {
          model: 'advisor-model'
        },
        ...options
      },
      {
        runtime: runtimeApi
      } as any
    )

    return {
      runtimeApi,
      strategy,
      middleware
    }
  }

  it('exposes the advisor config schema on middleware meta', () => {
    const { strategy } = createSubject()

    expect(strategy.meta.configSchema).toEqual(AdvisorPluginConfigFormSchema)
  })

  it('validates advisorModel when enabled', () => {
    const strategy = new AdvisorMiddleware()

    expect(() => strategy.createMiddleware({}, { runtime: createRuntimeApi() } as any)).toThrow(
      'advisorModel is required when advisor middleware is enabled'
    )
  })

  it('resets the run counter in beforeAgent', async () => {
    const { middleware } = createSubject()

    const result = await middleware.beforeAgent?.({ advisorRunUses: 9, advisorSessionUses: 4 } as any, {} as any)

    expect(result).toEqual({
      advisorRunUses: 0
    })
  })

  it('appends the advisor executor prompt to the model call', async () => {
    const { middleware } = createSubject()
    const handler = jest.fn().mockResolvedValue(new AIMessage('ok'))

    await middleware.wrapModelCall?.(
      {
        model: {} as any,
        messages: [],
        tools: [{ name: 'advisor' }],
        state: {
          advisorRunUses: 0,
          advisorSessionUses: 0
        },
        runtime: {} as any,
        systemMessage: new SystemMessage('base prompt')
      } as any,
      handler
    )

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].systemMessage).toEqual(
      new SystemMessage({
        content: expect.stringContaining('Use `advisor` sparingly for hard debugging')
      })
    )
  })

  it('removes the advisor tool when quota is exhausted', async () => {
    const { middleware } = createSubject({ maxUsesPerRun: 1 })
    const handler = jest.fn().mockResolvedValue(new AIMessage('ok'))

    await middleware.wrapModelCall?.(
      {
        model: {} as any,
        messages: [],
        tools: [{ name: 'advisor' }, { name: 'search' }],
        state: {
          advisorRunUses: 1,
          advisorSessionUses: 0
        },
        runtime: {} as any
      } as any,
      handler
    )

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].tools).toEqual([{ name: 'search' }])
  })

  it('passes through non-advisor tools untouched', async () => {
    const { middleware } = createSubject()
    const handler = jest.fn().mockResolvedValue({ ok: true })
    const request = {
      tool: { name: 'search' },
      toolCall: {
        id: 'tool-call-1',
        name: 'search',
        args: {
          query: 'latest logs'
        }
      },
      state: {},
      runtime: {} as any
    }

    const result = await middleware.wrapToolCall?.(request as any, handler as any)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(request)
    expect(result).toEqual({ ok: true })
  })

  it('returns an error tool message for invalid advisor input', async () => {
    const { middleware } = createSubject()
    const handler = jest.fn()

    const result = await middleware.wrapToolCall?.(
      {
        tool: { name: 'advisor' },
        toolCall: {
          id: 'tool-call-2',
          name: 'advisor',
          args: {
            question: '   '
          }
        },
        state: {},
        runtime: {} as any
      } as any,
      handler as any
    )

    expect(handler).not.toHaveBeenCalled()
    expect(result).toBeInstanceOf(ToolMessage)
    expect((result as ToolMessage).status).toBe('error')
    expect((result as ToolMessage).content).toBe(
      'Invalid `advisor` input. Provide a non-empty `question` field before calling the advisor.'
    )
  })

  it('returns an error tool message when quota is exhausted at tool time', async () => {
    const { middleware } = createSubject({ maxUsesPerSession: 2 })
    const handler = jest.fn()

    const result = await middleware.wrapToolCall?.(
      {
        tool: { name: 'advisor' },
        toolCall: {
          id: 'tool-call-3',
          name: 'advisor',
          args: {
            question: 'Should I fallback to another parser?'
          }
        },
        state: {
          advisorRunUses: 0,
          advisorSessionUses: 2
        },
        runtime: {} as any
      } as any,
      handler as any
    )

    expect(handler).not.toHaveBeenCalled()
    expect(result).toBeInstanceOf(ToolMessage)
    expect((result as ToolMessage).status).toBe('error')
    expect((result as ToolMessage).content).toContain('Advisor quota reached for this session')
  })

  it('returns a command with updated usage counters after advisor execution', async () => {
    const { runtimeApi, middleware } = createSubject()
    const invoke = jest.fn().mockResolvedValue(
      new AIMessage({
        content: 'Check the parser branch first, then add a fallback.'
      })
    )
    runtimeApi.createModelClient.mockResolvedValue({
      invoke
    })

    const result = await middleware.wrapToolCall?.(
      {
        tool: { name: 'advisor' },
        toolCall: {
          id: 'tool-call-4',
          name: 'advisor',
          args: {
            question: 'What is the safest fix path?'
          }
        },
        state: {
          advisorRunUses: 1,
          advisorSessionUses: 5,
          messages: [new HumanMessage('The plugin crashes after tool execution.')]
        },
        runtime: {} as any
      } as any,
      jest.fn() as any
    )

    expect(runtimeApi.createModelClient).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        tags: ['advisor/internal-eval'],
        metadata: expect.objectContaining({
          internal: true
        })
      })
    )
    expect(result).toBeInstanceOf(Command)
    expect((result as any).update.advisorRunUses).toBe(2)
    expect((result as any).update.advisorSessionUses).toBe(6)
    expect((result as any).update.messages[0]).toBeInstanceOf(ToolMessage)
    expect((result as any).update.messages[0].content).toContain('Check the parser branch first')
    expect(dispatchCustomEvent).toHaveBeenCalledWith(
      ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
      expect.objectContaining({
        id: 'tool-call-4',
        category: 'Tool',
        toolset: 'AdvisorMiddleware',
        tool: 'advisor',
        title: 'Advisor',
        message: 'What is the safest fix path?',
        status: 'success',
        input: {
          question: 'What is the safest fix path?'
        },
        output: 'Check the parser branch first, then add a fallback.'
      })
    )
  })

  it('emits a fail event when the advisor model call throws', async () => {
    const { runtimeApi, middleware } = createSubject()
    const invoke = jest.fn().mockRejectedValue(new Error('network unavailable'))
    runtimeApi.createModelClient.mockResolvedValue({
      invoke
    })

    const result = await middleware.wrapToolCall?.(
      {
        tool: { name: 'advisor' },
        toolCall: {
          id: 'tool-call-8',
          name: 'advisor',
          args: {
            question: 'Why did the advisor request fail?'
          }
        },
        state: {
          advisorRunUses: 0,
          advisorSessionUses: 0,
          messages: []
        },
        runtime: {} as any
      } as any,
      jest.fn() as any
    )

    expect(result).toBeInstanceOf(ToolMessage)
    expect((result as ToolMessage).status).toBe('error')
    expect((result as ToolMessage).content).toBe('Advisor model call failed: network unavailable')
    expect(dispatchCustomEvent).toHaveBeenCalledWith(
      ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
      expect.objectContaining({
        id: 'tool-call-8',
        category: 'Tool',
        toolset: 'AdvisorMiddleware',
        tool: 'advisor',
        title: 'Advisor',
        message: 'Why did the advisor request fail?',
        status: 'fail',
        input: {
          question: 'Why did the advisor request fail?'
        },
        error: 'Advisor model call failed: network unavailable'
      })
    )
  })

  it('curates forwarded context and strips advisor tool calls and tool results when configured', async () => {
    const { runtimeApi, middleware } = createSubject({
      context: {
        includeSystemPrompt: false,
        includeToolResults: false,
        maxContextMessages: 5,
        maxContextChars: 1000
      }
    })
    const invoke = jest.fn().mockResolvedValue(new AIMessage('Use the generic adapter boundary.'))
    runtimeApi.createModelClient.mockResolvedValue({
      invoke
    })

    await middleware.wrapToolCall?.(
      {
        tool: { name: 'advisor' },
        toolCall: {
          id: 'tool-call-5',
          name: 'advisor',
          args: {
            question: 'Should I keep provider logic outside the middleware core?'
          }
        },
        state: {
          advisorRunUses: 0,
          advisorSessionUses: 0,
          messages: [
            new SystemMessage('executor system prompt'),
            new HumanMessage('We need a generic middleware.'),
            new ToolMessage({
              name: 'search',
              tool_call_id: 'search-1',
              content: 'anthropic docs'
            }),
            new AIMessage({
              content: 'I think we need an adapter layer.',
              tool_calls: [
                {
                  id: 'call-advisor-1',
                  name: 'advisor',
                  args: {
                    question: 'Help'
                  },
                  type: 'tool_call'
                }
              ]
            })
          ]
        },
        runtime: {} as any
      } as any,
      jest.fn() as any
    )

    expect(invoke).toHaveBeenCalledTimes(1)
    const forwardedMessages = invoke.mock.calls[0][0]
    expect(forwardedMessages[0]).toBeInstanceOf(SystemMessage)
    expect(forwardedMessages.some((message: unknown) => message instanceof ToolMessage)).toBe(false)
    expect(
      forwardedMessages.some(
        (message: unknown) => message instanceof HumanMessage && message.content === 'We need a generic middleware.'
      )
    ).toBe(true)
    const sanitizedAiMessage = forwardedMessages.find((message: unknown) => message instanceof AIMessage) as AIMessage
    expect(sanitizedAiMessage.tool_calls).toEqual([])
    expect(sanitizedAiMessage.content).toBe('I think we need an adapter layer.')
    expect(forwardedMessages[forwardedMessages.length - 1]).toEqual(
      new HumanMessage({
        content:
          'The executor agent needs advice on the following question:\n\nShould I keep provider logic outside the middleware core?'
      })
    )
  })

  it('keeps only tool results that still match the sanitized AI tool calls', async () => {
    const { runtimeApi, middleware } = createSubject({
      context: {
        includeSystemPrompt: false,
        includeToolResults: true,
        maxContextMessages: 12,
        maxContextChars: 4000
      }
    })
    const invoke = jest.fn().mockResolvedValue(new AIMessage('Keep the valid search context only.'))
    runtimeApi.createModelClient.mockResolvedValue({
      invoke
    })

    await middleware.wrapToolCall?.(
      {
        tool: { name: 'advisor' },
        toolCall: {
          id: 'tool-call-6',
          name: 'advisor',
          args: {
            question: 'Which context should remain after sanitization?'
          }
        },
        state: {
          advisorRunUses: 0,
          advisorSessionUses: 0,
          messages: [
            new HumanMessage('The executor needs more evidence.'),
            new AIMessage({
              content: 'I will inspect logs and maybe ask advisor.',
              tool_calls: [
                {
                  id: 'search-1',
                  name: 'search',
                  args: {
                    query: 'error logs'
                  },
                  type: 'tool_call'
                },
                {
                  id: 'advisor-1',
                  name: 'advisor',
                  args: {
                    question: 'Help'
                  },
                  type: 'tool_call'
                }
              ]
            }),
            new ToolMessage({
              name: 'search',
              tool_call_id: 'search-1',
              content: 'Matched stack trace'
            }),
            new ToolMessage({
              name: 'advisor',
              tool_call_id: 'advisor-1',
              content: 'Old advisor response that should not be forwarded'
            }),
            new AIMessage('I saw enough to continue.')
          ]
        },
        runtime: {} as any
      } as any,
      jest.fn() as any
    )

    const forwardedMessages = invoke.mock.calls[0][0]
    const sanitizedAiMessage = forwardedMessages.find((message: unknown) => message instanceof AIMessage) as AIMessage
    const forwardedToolMessages = forwardedMessages.filter(
      (message: unknown) => message instanceof ToolMessage
    ) as ToolMessage[]

    expect(sanitizedAiMessage.tool_calls).toEqual([
      {
        id: 'search-1',
        name: 'search',
        args: {
          query: 'error logs'
        },
        type: 'tool_call'
      }
    ])
    expect(forwardedToolMessages).toHaveLength(1)
    expect(forwardedToolMessages[0].tool_call_id).toBe('search-1')
    expect(forwardedToolMessages[0].content).toBe('Matched stack trace')
  })

  it('drops orphan tool results after tail truncation', async () => {
    const { runtimeApi, middleware } = createSubject({
      context: {
        includeSystemPrompt: false,
        includeToolResults: true,
        maxContextMessages: 1,
        maxContextChars: 50
      }
    })
    const invoke = jest.fn().mockResolvedValue(new AIMessage('No invalid tool history was forwarded.'))
    runtimeApi.createModelClient.mockResolvedValue({
      invoke
    })

    await middleware.wrapToolCall?.(
      {
        tool: { name: 'advisor' },
        toolCall: {
          id: 'tool-call-7',
          name: 'advisor',
          args: {
            question: 'Did truncation leave any broken tool messages?'
          }
        },
        state: {
          advisorRunUses: 0,
          advisorSessionUses: 0,
          messages: [
            new AIMessage({
              content: 'Calling search now.',
              tool_calls: [
                {
                  id: 'search-2',
                  name: 'search',
                  args: {
                    query: 'build failure'
                  },
                  type: 'tool_call'
                }
              ]
            }),
            new ToolMessage({
              name: 'search',
              tool_call_id: 'search-2',
              content: 'stack trace'
            })
          ]
        },
        runtime: {} as any
      } as any,
      jest.fn() as any
    )

    const forwardedMessages = invoke.mock.calls[0][0]
    expect(forwardedMessages.some((message: unknown) => message instanceof ToolMessage)).toBe(false)
    expect(
      forwardedMessages.some(
        (message: unknown) => message instanceof AIMessage && Array.isArray(message.tool_calls) && message.tool_calls.length
      )
    ).toBe(false)
  })
})
