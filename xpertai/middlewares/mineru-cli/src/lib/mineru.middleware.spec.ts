import { AIMessage, SystemMessage } from '@langchain/core/messages'

jest.mock('@metad/contracts', () => ({}))
jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => () => undefined
}))

import { MinerUCLISkillMiddleware } from './mineru.middleware.js'
import {
  MINERU_CLI_SKILL_MIDDLEWARE_NAME,
  MinerUCliConfigFormSchema
} from './mineru-cli.types.js'

describe('MinerUCLISkillMiddleware', () => {
  const defaultConfig = {
    apiToken: undefined
  }

  function createSubject(options = {}) {
    const mineruBootstrapService = {
      resolveConfig: jest.fn().mockImplementation((config: Record<string, unknown> | undefined) => ({
        ...defaultConfig,
        ...(config ?? {})
      })),
      ensureBootstrap: jest.fn().mockResolvedValue(undefined),
      syncApiTokenSecret: jest.fn().mockResolvedValue(undefined),
      buildSystemPrompt: jest.fn().mockReturnValue('mineru prompt'),
      isMinerUCommand: jest.fn().mockReturnValue(true)
    }

    const strategy = new MinerUCLISkillMiddleware(mineruBootstrapService as any)
    const middleware = strategy.createMiddleware(options, {} as any)

    return {
      strategy,
      middleware,
      mineruBootstrapService
    }
  }

  it('has correct metadata', () => {
    const { strategy } = createSubject()
    expect(strategy.meta.name).toBe(MINERU_CLI_SKILL_MIDDLEWARE_NAME)
    expect(strategy.meta.label.en_US).toBe('MinerU CLI Skill')
    expect(strategy.meta.configSchema).toEqual(MinerUCliConfigFormSchema)
    expect((MinerUCliConfigFormSchema.properties.apiToken as any)['x-ui'].span).toBe(2)
  })

  it('bootstraps the sandbox and syncs the token in beforeAgent when a backend is available', async () => {
    const backend = { execute: jest.fn() }
    const { middleware, mineruBootstrapService } = createSubject({ apiToken: 'token-123' })

    await middleware.beforeAgent?.({} as any, {
      configurable: { sandbox: { backend } }
    } as any)

    expect(mineruBootstrapService.ensureBootstrap).toHaveBeenCalledWith(backend)
    expect(mineruBootstrapService.syncApiTokenSecret).toHaveBeenCalledWith(backend, { apiToken: 'token-123' })
  })

  it('appends the MinerU prompt to the system message when sandbox is enabled', async () => {
    const backend = { execute: jest.fn() }
    const { middleware } = createSubject()
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

    expect(handler.mock.calls[0][0].systemMessage).toEqual(
      new SystemMessage({ content: 'base prompt\n\nmineru prompt' })
    )
  })

  it('re-checks bootstrap and syncs the token for sandbox_shell mineru commands without rewriting the command', async () => {
    const backend = { execute: jest.fn() }
    const { middleware, mineruBootstrapService } = createSubject({ apiToken: 'token-123' })
    const handler = jest.fn().mockResolvedValue({} as any)
    const command = 'python3 /workspace/.xpert/skills/mineru-cli/scripts/mineru.py --file ./a.pdf'

    await middleware.wrapToolCall?.(
      {
        tool: { name: 'sandbox_shell' },
        toolCall: {
          id: 'tool-call-1',
          name: 'sandbox_shell',
          args: { command }
        },
        state: {} as any,
        runtime: {
          configurable: { sandbox: { backend } }
        } as any
      },
      handler
    )

    expect(mineruBootstrapService.isMinerUCommand).toHaveBeenCalledWith(command)
    expect(mineruBootstrapService.ensureBootstrap).toHaveBeenCalledWith(backend)
    expect(mineruBootstrapService.syncApiTokenSecret).toHaveBeenCalledWith(backend, { apiToken: 'token-123' })
    expect(handler.mock.calls[0][0].toolCall.args.command).toBe(command)
  })

  it('passes through non-mineru sandbox commands untouched', async () => {
    const backend = { execute: jest.fn() }
    const { middleware, mineruBootstrapService } = createSubject()
    const handler = jest.fn().mockResolvedValue({} as any)
    mineruBootstrapService.isMinerUCommand.mockReturnValue(false)
    const request = {
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
    } as any

    await middleware.wrapToolCall?.(request, handler)

    expect(mineruBootstrapService.ensureBootstrap).not.toHaveBeenCalled()
    expect(mineruBootstrapService.syncApiTokenSecret).not.toHaveBeenCalled()
    expect(handler).toHaveBeenCalledWith(request)
  })

  it('syncs secret cleanup even when no api token is configured', async () => {
    const backend = { execute: jest.fn() }
    const { middleware, mineruBootstrapService } = createSubject()
    const handler = jest.fn().mockResolvedValue({} as any)

    await middleware.wrapToolCall?.(
      {
        tool: { name: 'sandbox_shell' },
        toolCall: {
          id: 'tool-call-3',
          name: 'sandbox_shell',
          args: { command: 'python3 /workspace/.xpert/skills/mineru-cli/scripts/mineru.py --file ./a.pdf' }
        },
        state: {} as any,
        runtime: {
          configurable: { sandbox: { backend } }
        } as any
      },
      handler
    )

    expect(mineruBootstrapService.syncApiTokenSecret).toHaveBeenCalledWith(backend, { apiToken: undefined })
    expect(handler.mock.calls[0][0].toolCall.args.command).toBe(
      'python3 /workspace/.xpert/skills/mineru-cli/scripts/mineru.py --file ./a.pdf'
    )
  })

  it('passes through non-sandbox_shell tools', async () => {
    const { middleware } = createSubject()
    const handler = jest.fn().mockResolvedValue({} as any)
    const request = {
      tool: { name: 'other_tool' },
      toolCall: { args: { command: 'python3 /workspace/.xpert/skills/mineru-cli/scripts/mineru.py --file ./a.pdf' } },
      runtime: undefined
    } as any

    await middleware.wrapToolCall?.(request, handler)
    expect(handler).toHaveBeenCalledWith(request)
  })
})
