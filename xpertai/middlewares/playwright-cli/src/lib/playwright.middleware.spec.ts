import { AIMessage, SystemMessage } from '@langchain/core/messages'

jest.mock('@metad/contracts', () => ({}))
jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => () => undefined
}))

import { PlaywrightCLISkillMiddleware } from './playwright.middleware.js'
import {
  DEFAULT_PLAYWRIGHT_CLI_VERSION,
  DEFAULT_PLAYWRIGHT_OPEN_TIMEOUT_SEC,
  DEFAULT_PLAYWRIGHT_SKILLS_DIR,
  PlaywrightConfigFormSchema
} from './playwright.types.js'

describe('PlaywrightCLISkillMiddleware', () => {
  const defaultConfig = {
    cliVersion: DEFAULT_PLAYWRIGHT_CLI_VERSION,
    skillsDir: DEFAULT_PLAYWRIGHT_SKILLS_DIR
  }

  function createSubject(options = {}) {
    const playwrightBootstrapService = {
      resolveConfig: jest.fn().mockImplementation((config: Record<string, unknown> | undefined) => ({
        ...defaultConfig,
        ...(config ?? {})
      })),
      ensureBootstrap: jest.fn().mockResolvedValue(undefined),
      buildSystemPrompt: jest.fn().mockReturnValue('playwright prompt'),
      isPlaywrightCommand: jest.fn().mockReturnValue(true),
      isPlaywrightOpenCommand: jest.fn().mockReturnValue(false),
      injectManagedConfig: jest.fn().mockImplementation((command: string) => command)
    }

    const strategy = new PlaywrightCLISkillMiddleware(playwrightBootstrapService as any)
    const middleware = strategy.createMiddleware(options, {} as any)

    return {
      strategy,
      middleware,
      playwrightBootstrapService
    }
  }

  it('exposes the Playwright config schema on middleware meta', () => {
    const { strategy } = createSubject()

    expect(strategy.meta.configSchema).toEqual(PlaywrightConfigFormSchema)
  })

  it('bootstraps the sandbox in beforeAgent when a backend is available', async () => {
    const backend = { execute: jest.fn() }
    const { middleware, playwrightBootstrapService } = createSubject()

    await middleware.beforeAgent?.({} as any, {
      configurable: {
        sandbox: {
          backend
        }
      }
    } as any)

    expect(playwrightBootstrapService.ensureBootstrap).toHaveBeenCalledWith(backend, defaultConfig)
  })

  it('appends the Playwright prompt to the system message when sandbox is enabled', async () => {
    const backend = { execute: jest.fn() }
    const { middleware, playwrightBootstrapService } = createSubject()
    const handler = jest.fn().mockResolvedValue(new AIMessage('ok'))

    await middleware.wrapModelCall?.(
      {
        model: {} as any,
        messages: [],
        tools: [],
        state: {} as any,
        runtime: {
          configurable: {
            sandbox: {
              backend
            }
          }
        } as any,
        systemMessage: new SystemMessage('base prompt')
      },
      handler
    )

    expect(playwrightBootstrapService.buildSystemPrompt).toHaveBeenCalledWith(defaultConfig)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].systemMessage).toEqual(
      new SystemMessage({
        content: 'base prompt\n\nplaywright prompt'
      })
    )
  })

  it('re-checks bootstrap only for sandbox_shell Playwright commands', async () => {
    const backend = { execute: jest.fn() }
    const { middleware, playwrightBootstrapService } = createSubject()
    const handler = jest.fn().mockResolvedValue({} as any)

    await middleware.wrapToolCall?.(
      {
        tool: { name: 'sandbox_shell' },
        toolCall: {
          id: 'tool-call-1',
          name: 'sandbox_shell',
          args: {
            command: './.xpert/playwright-runtime/bin/playwright --version'
          }
        },
        state: {} as any,
        runtime: {
          configurable: {
            sandbox: {
              backend
            }
          }
        } as any
      },
      handler
    )

    expect(playwrightBootstrapService.isPlaywrightCommand).toHaveBeenCalledWith(
      './.xpert/playwright-runtime/bin/playwright --version'
    )
    expect(playwrightBootstrapService.ensureBootstrap).toHaveBeenCalledWith(backend, defaultConfig)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('passes middleware options through to the bootstrap service', async () => {
    const backend = { execute: jest.fn() }
    const middlewareConfig = {
      cliVersion: '0.2.0',
      skillsDir: '/custom/skills'
    }
    const { middleware, playwrightBootstrapService } = createSubject(middlewareConfig)
    const handler = jest.fn().mockResolvedValue(new AIMessage('ok'))

    await middleware.beforeAgent?.({} as any, {
      configurable: { sandbox: { backend } }
    } as any)

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

    expect(playwrightBootstrapService.resolveConfig).toHaveBeenCalledWith(middlewareConfig)
    expect(playwrightBootstrapService.ensureBootstrap).toHaveBeenCalledWith(backend, middlewareConfig)
    expect(playwrightBootstrapService.buildSystemPrompt).toHaveBeenCalledWith(middlewareConfig)
  })

  it('leaves non-Playwright sandbox commands untouched', async () => {
    const backend = { execute: jest.fn() }
    const { middleware, playwrightBootstrapService } = createSubject()
    const handler = jest.fn().mockResolvedValue({} as any)
    playwrightBootstrapService.isPlaywrightCommand.mockReturnValue(false)

    await middleware.wrapToolCall?.(
      {
        tool: { name: 'sandbox_shell' },
        toolCall: {
          id: 'tool-call-2',
          name: 'sandbox_shell',
          args: {
            command: 'ls -la'
          }
        },
        state: {} as any,
        runtime: {
          configurable: {
            sandbox: {
              backend
            }
          }
        } as any
      },
      handler
    )

    expect(playwrightBootstrapService.ensureBootstrap).not.toHaveBeenCalled()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('enforces timeout_sec for playwright-cli open commands when not set', async () => {
    const backend = { execute: jest.fn() }
    const { middleware, playwrightBootstrapService } = createSubject()
    playwrightBootstrapService.isPlaywrightOpenCommand.mockReturnValue(true)
    const handler = jest.fn().mockResolvedValue({} as any)

    await middleware.wrapToolCall?.(
      {
        tool: { name: 'sandbox_shell' },
        toolCall: {
          id: 'tool-call-open',
          name: 'sandbox_shell',
          args: {
            command: 'playwright-cli open https://example.com'
          }
        },
        state: {} as any,
        runtime: {
          configurable: { sandbox: { backend } }
        } as any
      },
      handler
    )

    expect(handler).toHaveBeenCalledTimes(1)
    const passedRequest = handler.mock.calls[0][0]
    expect(passedRequest.toolCall.args.timeout_sec).toBe(DEFAULT_PLAYWRIGHT_OPEN_TIMEOUT_SEC)
  })

  it('injects the managed config into playwright-cli open commands before execution', async () => {
    const backend = { execute: jest.fn() }
    const { middleware, playwrightBootstrapService } = createSubject()
    playwrightBootstrapService.isPlaywrightOpenCommand.mockReturnValue(true)
    playwrightBootstrapService.injectManagedConfig.mockReturnValue(
      "playwright-cli open https://example.com --config='/workspace/.xpert/playwright-cli/cli.config.json'"
    )
    const handler = jest.fn().mockResolvedValue({} as any)

    await middleware.wrapToolCall?.(
      {
        tool: { name: 'sandbox_shell' },
        toolCall: {
          id: 'tool-call-open-config',
          name: 'sandbox_shell',
          args: {
            command: 'playwright-cli open https://example.com'
          }
        },
        state: {} as any,
        runtime: {
          configurable: { sandbox: { backend } }
        } as any
      },
      handler
    )

    expect(playwrightBootstrapService.injectManagedConfig).toHaveBeenCalledWith(
      'playwright-cli open https://example.com'
    )

    const passedRequest = handler.mock.calls[0][0]
    expect(passedRequest.toolCall.args.command).toBe(
      "playwright-cli open https://example.com --config='/workspace/.xpert/playwright-cli/cli.config.json'"
    )
    expect(passedRequest.toolCall.args.timeout_sec).toBe(DEFAULT_PLAYWRIGHT_OPEN_TIMEOUT_SEC)
  })

  it('caps timeout_sec for playwright-cli open when LLM sets a large value', async () => {
    const backend = { execute: jest.fn() }
    const { middleware, playwrightBootstrapService } = createSubject()
    playwrightBootstrapService.isPlaywrightOpenCommand.mockReturnValue(true)
    const handler = jest.fn().mockResolvedValue({} as any)

    await middleware.wrapToolCall?.(
      {
        tool: { name: 'sandbox_shell' },
        toolCall: {
          id: 'tool-call-open-2',
          name: 'sandbox_shell',
          args: {
            command: 'playwright-cli open https://example.com',
            timeout_sec: 2000
          }
        },
        state: {} as any,
        runtime: {
          configurable: { sandbox: { backend } }
        } as any
      },
      handler
    )

    const passedRequest = handler.mock.calls[0][0]
    expect(passedRequest.toolCall.args.timeout_sec).toBe(DEFAULT_PLAYWRIGHT_OPEN_TIMEOUT_SEC)
  })

  it('preserves timeout_sec when LLM sets a value within the open cap', async () => {
    const backend = { execute: jest.fn() }
    const { middleware, playwrightBootstrapService } = createSubject()
    playwrightBootstrapService.isPlaywrightOpenCommand.mockReturnValue(true)
    const handler = jest.fn().mockResolvedValue({} as any)

    await middleware.wrapToolCall?.(
      {
        tool: { name: 'sandbox_shell' },
        toolCall: {
          id: 'tool-call-open-3',
          name: 'sandbox_shell',
          args: {
            command: 'playwright-cli open https://example.com',
            timeout_sec: 5
          }
        },
        state: {} as any,
        runtime: {
          configurable: { sandbox: { backend } }
        } as any
      },
      handler
    )

    const passedRequest = handler.mock.calls[0][0]
    expect(passedRequest.toolCall.args.timeout_sec).toBe(5)
  })

  it('does not modify timeout_sec for non-open playwright-cli commands', async () => {
    const backend = { execute: jest.fn() }
    const { middleware, playwrightBootstrapService } = createSubject()
    playwrightBootstrapService.isPlaywrightOpenCommand.mockReturnValue(false)
    const handler = jest.fn().mockResolvedValue({} as any)

    await middleware.wrapToolCall?.(
      {
        tool: { name: 'sandbox_shell' },
        toolCall: {
          id: 'tool-call-goto',
          name: 'sandbox_shell',
          args: {
            command: 'playwright-cli goto https://example.com'
          }
        },
        state: {} as any,
        runtime: {
          configurable: { sandbox: { backend } }
        } as any
      },
      handler
    )

    const passedRequest = handler.mock.calls[0][0]
    expect(passedRequest.toolCall.args.timeout_sec).toBeUndefined()
  })
})
