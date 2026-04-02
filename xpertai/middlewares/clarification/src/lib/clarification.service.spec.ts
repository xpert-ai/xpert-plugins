import { SystemMessage, ToolMessage } from '@langchain/core/messages'
import { Command } from '@langchain/langgraph'
import { ClarificationService } from './clarification.service.js'

describe('ClarificationService', () => {
  function createSubject() {
    return new ClarificationService()
  }

  it('resolves plugin config defaults', () => {
    const service = createSubject()

    expect(service.resolveConfig({})).toEqual({
      enabled: true,
      appendSystemPrompt: true,
      promptMode: 'strict'
    })
  })

  it('resolves input defaults and cleans invalid options', () => {
    const service = createSubject()

    expect(
      service.resolveInput({
        question: '  Which year should I use?  ',
        options: [' 2024 ', '', 123, 'Last three years'],
        context: '  Need to confirm report range. ',
        allowFreeText: false
      })
    ).toEqual({
      question: 'Which year should I use?',
      clarificationType: 'missing_info',
      context: 'Need to confirm report range.',
      options: ['2024', 'Last three years'],
      allowFreeText: false,
      required: true
    })
  })

  it('rejects missing question', () => {
    const service = createSubject()

    expect(() => service.resolveInput({ context: 'missing' })).toThrow('question')
  })

  it('formats a readable message', () => {
    const service = createSubject()
    const message = service.formatMessage({
      question: 'Which year should I use?',
      clarificationType: 'missing_info',
      context: 'Need to confirm report range.',
      options: ['2024', 'Last three years'],
      allowFreeText: true,
      required: true
    })

    expect(message).toContain('I need to confirm the following before continuing:')
    expect(message).toContain('Need to confirm report range.')
    expect(message).toContain('Which year should I use?')
    expect(message).toContain('Options:')
    expect(message).toContain('1. 2024')
    expect(message).toContain('You can also reply in your own words.')
  })

  it('formats a Chinese clarification when the prompt is Chinese', () => {
    const service = createSubject()
    const message = service.formatMessage({
      question: '你希望我基于哪个年份的数据继续？',
      clarificationType: 'missing_info',
      context: '为了按正确的数据范围继续处理，需要先确认年份。',
      options: ['2024 年', '最近三年'],
      allowFreeText: true,
      required: true
    })

    expect(message).toContain('需要先确认以下信息：')
    expect(message).toContain('为了按正确的数据范围继续处理，需要先确认年份。')
    expect(message).toContain('你希望我基于哪个年份的数据继续？')
    expect(message).toContain('可选项：')
    expect(message).toContain('1. 2024 年')
    expect(message).toContain('也可以直接回复你的具体想法。')
  })

  it('formats a non-blocking clarification differently when required is false', () => {
    const service = createSubject()
    const message = service.formatMessage({
      question: 'Would you like me to continue with a default assumption?',
      clarificationType: 'suggestion',
      context: undefined,
      options: [],
      allowFreeText: true,
      required: false
    })

    expect(message).toContain('It would help to confirm the following first:')
    expect(message).not.toContain('I need to confirm the following before continuing:')
  })

  it('normalizes optional clarifications into blocking input', () => {
    const service = createSubject()

    expect(
      service.resolveInput({
        question: 'Should I continue with a default assumption?',
        required: false
      })
    ).toEqual({
      question: 'Should I continue with a default assumption?',
      clarificationType: 'missing_info',
      context: undefined,
      options: [],
      allowFreeText: true,
      required: true
    })
  })

  it('builds a success tool message with clarification metadata', () => {
    const service = createSubject()
    const message = service.buildToolMessage(
      {
        question: 'Which year should I use?',
        clarificationType: 'approach_choice',
        context: 'Need to confirm report range.',
        options: ['2024', 'Last three years'],
        allowFreeText: true,
        required: true
      },
      'tool-call-1'
    )

    expect(message).toBeInstanceOf(ToolMessage)
    expect(message.name).toBe('ask_clarification')
    expect(message.tool_call_id).toBe('tool-call-1')
    expect(message.status).toBe('success')
    expect(message.metadata).toEqual({
      clarification: {
        version: 'v1',
        kind: 'clarification',
        question: 'Which year should I use?',
        clarificationType: 'approach_choice',
        context: 'Need to confirm report range.',
        options: ['2024', 'Last three years'],
        allowFreeText: true,
        required: true
      }
    })
  })

  it('builds an error tool message for invalid input', () => {
    const service = createSubject()
    const message = service.buildInvalidToolMessage(undefined, 'question is required')

    expect(message.status).toBe('error')
    expect(message.tool_call_id).toBe('')
    expect(message.content).toBe('question is required')
    expect(message.metadata).toEqual({
      clarification: {
        invalid: true,
        reason: 'question is required'
      }
    })
  })

  it('builds an end command with the generated tool message', () => {
    const service = createSubject()
    const toolMessage = service.buildInvalidToolMessage('tool-call-1', 'question is required')
    const command = service.buildEndCommand(toolMessage)

    expect(command).toBeInstanceOf(Command)
    expect((command as any).lg_name).toBe('Command')
    expect((command as any).goto).toEqual(['end'])
    expect((command as any).update).toEqual({
      messages: [toolMessage]
    })
  })

  it('returns an end command even when the raw request marked clarification as optional', () => {
    const service = createSubject()
    const result = service.buildToolResponse(
      {
        question: 'Proceed with the default time range?',
        clarificationType: 'suggestion',
        context: undefined,
        options: [],
        allowFreeText: true,
        required: true
      },
      'tool-call-optional'
    )

    expect(result).toBeInstanceOf(Command)
    expect((result as any).goto).toEqual(['end'])
  })

  it('returns an end command when required is true', () => {
    const service = createSubject()
    const result = service.buildToolResponse(
      {
        question: 'Which year should I use?',
        clarificationType: 'missing_info',
        context: 'Need to confirm report range.',
        options: ['2024', 'Last three years'],
        allowFreeText: true,
        required: true
      },
      'tool-call-required'
    )

    expect(result).toBeInstanceOf(Command)
    expect((result as any).goto).toEqual(['end'])
  })

  it('normalizes question validation errors into a stable message', () => {
    const service = createSubject()
    expect.assertions(1)

    try {
      service.resolveInput({ context: 'missing' })
    } catch (error) {
      expect(service.resolveInvalidReason(error)).toBe(
        'Invalid `ask_clarification` input. Provide a non-empty `question` field before asking the user to clarify.'
      )
    }
  })

  it('normalizes non-question validation errors into a generic message', () => {
    const service = createSubject()
    expect.assertions(1)

    try {
      service.resolveInput({
        question: 'Pick one',
        clarificationType: 'invalid_type'
      })
    } catch (error) {
      expect(service.resolveInvalidReason(error)).toBe(
        'Invalid `ask_clarification` input. Check the tool arguments and try again.'
      )
    }
  })

  it('builds prompt variants for strict and soft modes', () => {
    const service = createSubject()

    expect(
      service.buildSystemPrompt({
        enabled: true,
        appendSystemPrompt: true,
        promptMode: 'strict'
      })
    ).toContain('<ask_clarification>')
    expect(
      service.buildSystemPrompt({
        enabled: true,
        appendSystemPrompt: true,
        promptMode: 'strict'
      })
    ).toContain('</ask_clarification>')
    expect(
      service.buildSystemPrompt({
        enabled: true,
        appendSystemPrompt: true,
        promptMode: 'strict'
      })
    ).toContain('call `ask_clarification` before taking further action')
    expect(
      service.buildSystemPrompt({
        enabled: true,
        appendSystemPrompt: true,
        promptMode: 'strict'
      })
    ).toContain('emit exactly one `ask_clarification` tool call and no other tool calls in the same response')
    expect(
      service.buildSystemPrompt({
        enabled: true,
        appendSystemPrompt: true,
        promptMode: 'soft'
      })
    ).toContain('prefer calling `ask_clarification`')
    expect(
      service.buildSystemPrompt({
        enabled: true,
        appendSystemPrompt: true,
        promptMode: 'soft'
      })
    ).toContain('Calling `ask_clarification` ends the current run immediately')
  })

  it('appends the prompt to string system content without dropping the base text', () => {
    const service = createSubject()
    const message = service.buildSystemMessage('base prompt', {
      enabled: true,
      appendSystemPrompt: true,
      promptMode: 'strict'
    })

    expect(message).toEqual(
      new SystemMessage({
        content: expect.stringContaining('base prompt')
      })
    )
    expect(message.content).toEqual(expect.stringContaining('<ask_clarification>'))
  })

  it('appends the prompt to array system content without flattening existing blocks', () => {
    const service = createSubject()
    const message = service.buildSystemMessage(
      [
        { type: 'text', text: 'base prompt' },
        { type: 'text', text: 'existing structured block' }
      ] as any,
      {
        enabled: true,
        appendSystemPrompt: true,
        promptMode: 'strict'
      }
    )

    expect(Array.isArray(message.content)).toBe(true)
    expect(message.content).toEqual([
      { type: 'text', text: 'base prompt' },
      { type: 'text', text: 'existing structured block' },
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining('call `ask_clarification` before taking further action')
      })
    ])
  })
})
