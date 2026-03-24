import { SystemMessage, AIMessage } from '@langchain/core/messages'

jest.mock('@metad/contracts', () => ({}))
jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => () => undefined
}))

import { MarkItDownSkillMiddleware } from './markitdown.middleware.js'
import {
  MARKITDOWN_SKILL_MIDDLEWARE_NAME,
  DEFAULT_MARKITDOWN_VERSION,
  DEFAULT_MARKITDOWN_SKILLS_DIR,
  MarkItDownConfigFormSchema
} from './markitdown.types.js'

describe('MarkItDownSkillMiddleware', () => {
  const defaultConfig = {
    version: DEFAULT_MARKITDOWN_VERSION,
    skillsDir: DEFAULT_MARKITDOWN_SKILLS_DIR,
    extras: 'all'
  }

  function createSubject(options = {}) {
    const markitdownBootstrapService = {
      resolveConfig: jest.fn().mockImplementation((config: Record<string, unknown> | undefined) => ({
        ...defaultConfig,
        ...(config ?? {})
      })),
      ensureBootstrap: jest.fn().mockResolvedValue(undefined),
      buildSystemPrompt: jest.fn().mockReturnValue('markitdown prompt'),
      isMarkItDownCommand: jest.fn().mockReturnValue(true)
    }

    const strategy = new MarkItDownSkillMiddleware(markitdownBootstrapService as any)
    const middleware = strategy.createMiddleware(options, {} as any)

    return {
      strategy,
      middleware,
      markitdownBootstrapService
    }
  }

  it('should have correct metadata', () => {
    const { strategy } = createSubject()
    expect(strategy.meta.name).toBe(MARKITDOWN_SKILL_MIDDLEWARE_NAME)
    expect(strategy.meta.label.en_US).toBe('MarkItDown Skill')
    expect(strategy.meta.label.zh_Hans).toBe('MarkItDown 技能')
    expect(strategy.meta.configSchema).toEqual(MarkItDownConfigFormSchema)
  })

  it('should return middleware with correct name', () => {
    const { middleware } = createSubject()
    expect(middleware.name).toBe(MARKITDOWN_SKILL_MIDDLEWARE_NAME)
    expect(middleware.tools).toEqual([])
  })

  it('bootstraps the sandbox in beforeAgent when a backend is available', async () => {
    const backend = { execute: jest.fn() }
    const { middleware, markitdownBootstrapService } = createSubject()

    await middleware.beforeAgent?.({} as any, {
      configurable: { sandbox: { backend } }
    } as any)

    expect(markitdownBootstrapService.ensureBootstrap).toHaveBeenCalledWith(backend, defaultConfig)
  })

  it('appends the MarkItDown prompt to the system message when sandbox is enabled', async () => {
    const backend = { execute: jest.fn() }
    const { middleware, markitdownBootstrapService } = createSubject()
    const handler = jest.fn().mockResolvedValue(new AIMessage('ok'))

    await middleware.wrapModelCall?.(
      {
        model: {} as any,
        messages: [],
        tools: [],
        state: {} as any,
        runtime: {
          configurable: { sandbox: { backend } }
        } as any,
        systemMessage: new SystemMessage('base prompt')
      },
      handler
    )

    expect(markitdownBootstrapService.buildSystemPrompt).toHaveBeenCalledWith(defaultConfig)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].systemMessage).toEqual(
      new SystemMessage({ content: 'base prompt\n\nmarkitdown prompt' })
    )
  })

  it('passes through when no sandbox backend for wrapModelCall', async () => {
    const { middleware } = createSubject()
    const handler = jest.fn().mockResolvedValue(new AIMessage('ok'))

    await middleware.wrapModelCall?.(
      {
        model: {} as any,
        messages: [],
        tools: [],
        state: {} as any,
        runtime: undefined as any,
        systemMessage: new SystemMessage('base prompt')
      },
      handler
    )

    const passedRequest = handler.mock.calls[0][0]
    expect(passedRequest.systemMessage).toEqual(new SystemMessage('base prompt'))
  })

  it('re-checks bootstrap for sandbox_shell markitdown commands', async () => {
    const backend = { execute: jest.fn() }
    const { middleware, markitdownBootstrapService } = createSubject()
    const handler = jest.fn().mockResolvedValue({} as any)

    await middleware.wrapToolCall?.(
      {
        tool: { name: 'sandbox_shell' },
        toolCall: {
          id: 'tool-call-1',
          name: 'sandbox_shell',
          args: { command: 'markitdown report.pdf' }
        },
        state: {} as any,
        runtime: {
          configurable: { sandbox: { backend } }
        } as any
      },
      handler
    )

    expect(markitdownBootstrapService.isMarkItDownCommand).toHaveBeenCalledWith('markitdown report.pdf')
    expect(markitdownBootstrapService.ensureBootstrap).toHaveBeenCalledWith(backend, defaultConfig)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('leaves non-markitdown sandbox commands untouched', async () => {
    const backend = { execute: jest.fn() }
    const { middleware, markitdownBootstrapService } = createSubject()
    const handler = jest.fn().mockResolvedValue({} as any)
    markitdownBootstrapService.isMarkItDownCommand.mockReturnValue(false)

    await middleware.wrapToolCall?.(
      {
        tool: { name: 'sandbox_shell' },
        toolCall: {
          id: 'tool-call-2',
          name: 'sandbox_shell',
          args: { command: 'ls -la' }
        },
        state: {} as any,
        runtime: {
          configurable: { sandbox: { backend } }
        } as any
      },
      handler
    )

    expect(markitdownBootstrapService.ensureBootstrap).not.toHaveBeenCalled()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('passes through non-sandbox_shell tools', async () => {
    const { middleware } = createSubject()
    const handler = jest.fn().mockResolvedValue({} as any)
    const request = {
      tool: { name: 'other_tool' },
      toolCall: { args: { command: 'markitdown file.pdf' } },
      runtime: undefined
    } as any

    await middleware.wrapToolCall?.(request, handler)
    expect(handler).toHaveBeenCalledWith(request)
  })
})
