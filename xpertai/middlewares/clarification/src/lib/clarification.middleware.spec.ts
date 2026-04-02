jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => () => undefined
}))

import { AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { Command } from '@langchain/langgraph'
import { ClarificationMiddleware } from './clarification.middleware.js'
import { ClarificationService } from './clarification.service.js'
import { ClarificationPluginConfigFormSchema } from './clarification.types.js'

describe('ClarificationMiddleware', () => {
  function createSubject(options = {}) {
    const service = new ClarificationService()
    const strategy = new ClarificationMiddleware(service)
    const middleware = strategy.createMiddleware(options, {} as any)

    return {
      service,
      strategy,
      middleware
    }
  }

  it('exposes the clarification config schema on middleware meta', () => {
    const { strategy } = createSubject()

    expect(strategy.meta.configSchema).toEqual(ClarificationPluginConfigFormSchema)
  })

  it('registers the ask_clarification tool when enabled', () => {
    const { middleware } = createSubject()

    expect(middleware.tools).toHaveLength(1)
    expect(middleware.tools?.[0].name).toBe('ask_clarification')
  })

  it('does not register tools when disabled', () => {
    const { middleware } = createSubject({ enabled: false })

    expect(middleware.tools).toBeUndefined()
    expect(middleware.wrapModelCall).toBeUndefined()
    expect(middleware.wrapToolCall).toBeUndefined()
  })

  it('appends the clarification prompt in strict mode', async () => {
    const { middleware } = createSubject()
    const handler = jest.fn().mockResolvedValue(new AIMessage('ok'))

    await middleware.wrapModelCall?.(
      {
        model: {} as any,
        messages: [],
        tools: [],
        state: {},
        runtime: {} as any,
        systemMessage: new SystemMessage('base prompt')
      } as any,
      handler
    )

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].systemMessage).toEqual(
      new SystemMessage({
        content: expect.stringContaining('call `ask_clarification` before taking further action')
      })
    )
    expect(handler.mock.calls[0][0].systemMessage).toEqual(
      new SystemMessage({
        content: expect.stringContaining(
          'emit exactly one `ask_clarification` tool call and no other tool calls in the same response'
        )
      })
    )
  })

  it('does not append the prompt when disabled in config', async () => {
    const { middleware } = createSubject({ appendSystemPrompt: false })
    const request = {
      model: {} as any,
      messages: [],
      tools: [],
      state: {},
      runtime: {} as any,
      systemMessage: new SystemMessage('base prompt')
    }
    const handler = jest.fn().mockResolvedValue(new AIMessage('ok'))

    await middleware.wrapModelCall?.(request as any, handler)

    expect(handler).toHaveBeenCalledWith(request)
  })

  it('uses a softer prompt variant when configured', async () => {
    const { middleware } = createSubject({ promptMode: 'soft' })
    const handler = jest.fn().mockResolvedValue(new AIMessage('ok'))

    await middleware.wrapModelCall?.(
      {
        model: {} as any,
        messages: [],
        tools: [],
        state: {},
        runtime: {} as any,
        systemMessage: new SystemMessage('base prompt')
      } as any,
      handler
    )

    expect(handler.mock.calls[0][0].systemMessage).toEqual(
      new SystemMessage({
        content: expect.stringContaining('prefer calling `ask_clarification`')
      })
    )
    expect(handler.mock.calls[0][0].systemMessage).toEqual(
      new SystemMessage({
        content: expect.stringContaining('Calling `ask_clarification` ends the current run immediately')
      })
    )
  })

  it('appends the prompt without flattening array-based system content', async () => {
    const { middleware } = createSubject()
    const handler = jest.fn().mockResolvedValue(new AIMessage('ok'))

    await middleware.wrapModelCall?.(
      {
        model: {} as any,
        messages: [],
        tools: [],
        state: {},
        runtime: {} as any,
        systemMessage: new SystemMessage({
          content: [
            { type: 'text', text: 'base prompt' },
            { type: 'text', text: 'existing block' }
          ]
        })
      } as any,
      handler
    )

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].systemMessage.content).toEqual([
      { type: 'text', text: 'base prompt' },
      { type: 'text', text: 'existing block' },
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining('call `ask_clarification` before taking further action')
      })
    ])
  })

  it('passes through non-clarification tools untouched', async () => {
    const { middleware } = createSubject()
    const handler = jest.fn().mockResolvedValue({ ok: true })
    const request = {
      tool: { name: 'search' },
      toolCall: {
        id: 'tool-call-1',
        name: 'search',
        args: { query: 'latest report' }
      },
      state: {},
      runtime: {} as any
    }

    const result = await middleware.wrapToolCall?.(request as any, handler as any)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(request)
    expect(result).toEqual({ ok: true })
  })

  it('rewrites mixed tool batches to a single ask_clarification call before tools run', async () => {
    const { middleware } = createSubject()

    const result = await middleware.afterModel?.hook?.(
      {
        messages: [
          new AIMessage({
            content: '',
            tool_calls: [
              {
                id: 'tool-call-search',
                name: 'search',
                args: { query: 'latest report' },
                type: 'tool_call'
              },
              {
                id: 'tool-call-clarify',
                name: 'ask_clarification',
                args: {
                  question: 'Which year should I use?'
                },
                type: 'tool_call'
              }
            ]
          })
        ]
      } as any,
      {} as any
    )

    expect(result).toEqual({
      messages: [
        expect.objectContaining({
          tool_calls: [
            expect.objectContaining({
              id: 'tool-call-clarify',
              name: 'ask_clarification'
            })
          ]
        })
      ]
    })
  })

  it('leaves a single clarification tool call untouched in afterModel', async () => {
    const { middleware } = createSubject()

    const result = await middleware.afterModel?.hook?.(
      {
        messages: [
          new AIMessage({
            content: '',
            tool_calls: [
              {
                id: 'tool-call-clarify',
                name: 'ask_clarification',
                args: {
                  question: 'Which year should I use?'
                },
                type: 'tool_call'
              }
            ]
          })
        ]
      } as any,
      {} as any
    )

    expect(result).toBeUndefined()
  })

  it('intercepts ask_clarification and returns an end command', async () => {
    const { middleware } = createSubject()
    const handler = jest.fn().mockResolvedValue({ ok: true })

    const result = await middleware.wrapToolCall?.(
      {
        tool: { name: 'ask_clarification' },
        toolCall: {
          id: 'tool-call-2',
          name: 'ask_clarification',
          args: {
            question: 'Which year should I use?',
            context: 'Need to confirm report range.',
            options: ['2024', 'Last three years']
          }
        },
        state: {},
        runtime: {} as any
      } as any,
      handler as any
    )

    expect(handler).not.toHaveBeenCalled()
    expect((result as any).goto).toEqual(['end'])
    expect((result as any).update.messages).toHaveLength(1)
    expect((result as any).update.messages[0]).toBeInstanceOf(ToolMessage)
    expect((result as any).update.messages[0].status).toBe('success')
    expect((result as any).update.messages[0].metadata).toEqual({
      clarification: expect.objectContaining({
        version: 'v1',
        kind: 'clarification',
        question: 'Which year should I use?'
      })
    })
  })

  it('still returns an end command when the tool call marks clarification as optional', async () => {
    const { middleware } = createSubject()
    const handler = jest.fn().mockResolvedValue({ ok: true })

    const result = await middleware.wrapToolCall?.(
      {
        tool: { name: 'ask_clarification' },
        toolCall: {
          id: 'tool-call-optional',
          name: 'ask_clarification',
          args: {
            question: 'Should I continue with a default assumption?',
            required: false
          }
        },
        state: {},
        runtime: {} as any
      } as any,
      handler as any
    )

    expect(handler).not.toHaveBeenCalled()
    expect(result).toBeInstanceOf(Command)
    expect((result as any).goto).toEqual(['end'])
    expect((result as any).update.messages[0]).toBeInstanceOf(ToolMessage)
    expect((result as any).update.messages[0].metadata).toEqual({
      clarification: expect.objectContaining({
        required: true
      })
    })
  })

  it('returns an error tool message when clarification input is invalid', async () => {
    const { middleware } = createSubject()
    const handler = jest.fn().mockResolvedValue({ ok: true })

    const result = await middleware.wrapToolCall?.(
      {
        tool: { name: 'ask_clarification' },
        toolCall: {
          id: 'tool-call-3',
          name: 'ask_clarification',
          args: {
            context: 'missing question'
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
      'Invalid `ask_clarification` input. Provide a non-empty `question` field before asking the user to clarify.'
    )
  })

  it('returns a generic error message for other invalid clarification input', async () => {
    const { middleware } = createSubject()
    const handler = jest.fn().mockResolvedValue({ ok: true })

    const result = await middleware.wrapToolCall?.(
      {
        tool: { name: 'ask_clarification' },
        toolCall: {
          id: 'tool-call-4',
          name: 'ask_clarification',
          args: {
            question: 'Choose a path',
            clarificationType: 'not_supported'
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
      'Invalid `ask_clarification` input. Check the tool arguments and try again.'
    )
  })
})
