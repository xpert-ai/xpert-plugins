import { AIMessage, SystemMessage } from '@langchain/core/messages'

jest.mock('@metad/contracts', () => ({}))
jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => () => undefined
}))

import { MinerUSkillMiddleware } from './mineru.middleware.js'
import {
  DEFAULT_MINERU_BATCH_TIMEOUT_SEC,
  DEFAULT_MINERU_FILE_TIMEOUT_SEC,
  DEFAULT_MINERU_SKILLS_DIR,
  DEFAULT_MINERU_WRAPPER_PATH,
  MinerUConfigFormSchema
} from './mineru.types.js'

describe('MinerUSkillMiddleware', () => {
  const defaultConfig = {
    apiKey: 'secret-token',
    skillsDir: DEFAULT_MINERU_SKILLS_DIR,
    wrapperPath: DEFAULT_MINERU_WRAPPER_PATH
  }

  function createSubject(options = {}) {
    const mineruBootstrapService = {
      resolveConfig: jest.fn().mockImplementation((config: Record<string, unknown> | undefined) => ({
        ...defaultConfig,
        ...(config ?? {})
      })),
      ensureBootstrap: jest.fn().mockResolvedValue(undefined),
      buildSystemPrompt: jest.fn().mockReturnValue('mineru prompt'),
      isMinerUCommand: jest.fn().mockImplementation((command: string) => /\bmineru\b/.test(command)),
      rewriteCommand: jest
        .fn()
        .mockImplementation((command: string, wrapperPath: string) =>
          command.replace(/^(\s*)\S+/, `$1${wrapperPath}`)
        )
    }

    const strategy = new MinerUSkillMiddleware(mineruBootstrapService as any)
    const middleware = strategy.createMiddleware(options, {} as any)

    return {
      strategy,
      middleware,
      mineruBootstrapService
    }
  }

  it('exposes the MinerU config schema on middleware meta', () => {
    const { strategy } = createSubject()
    expect(strategy.meta.configSchema).toEqual(MinerUConfigFormSchema)
  })

  it('bootstraps the sandbox in beforeAgent when a backend is available', async () => {
    const backend = { execute: jest.fn() }
    const { middleware, mineruBootstrapService } = createSubject()

    await middleware.beforeAgent?.({} as any, {
      configurable: {
        sandbox: {
          backend
        }
      }
    } as any)

    expect(mineruBootstrapService.ensureBootstrap).toHaveBeenCalledWith(backend, defaultConfig)
  })

  it('appends the MinerU prompt to the system message when sandbox is enabled', async () => {
    const backend = { execute: jest.fn() }
    const { middleware, mineruBootstrapService } = createSubject()
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

    expect(mineruBootstrapService.buildSystemPrompt).toHaveBeenCalledWith(defaultConfig)
    expect(handler.mock.calls[0][0].systemMessage).toEqual(
      new SystemMessage({
        content: 'base prompt\n\nmineru prompt'
      })
    )
  })

  it('passes through non-sandbox-shell tool calls', async () => {
    const { middleware, mineruBootstrapService } = createSubject()
    const handler = jest.fn().mockResolvedValue({ ok: true })

    await middleware.wrapToolCall?.(
      {
        tool: { name: 'calculator' },
        toolCall: { id: '1', name: 'calculator', args: {} },
        state: {} as any,
        runtime: {} as any
      } as any,
      handler
    )

    expect(mineruBootstrapService.ensureBootstrap).not.toHaveBeenCalled()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('passes through non-mineru sandbox commands', async () => {
    const backend = { execute: jest.fn() }
    const { middleware, mineruBootstrapService } = createSubject()
    mineruBootstrapService.isMinerUCommand.mockReturnValue(false)
    const handler = jest.fn().mockResolvedValue({ ok: true })

    await middleware.wrapToolCall?.(
      {
        tool: { name: 'sandbox_shell' },
        toolCall: { id: '1', name: 'sandbox_shell', args: { command: 'ls -la' } },
        state: {} as any,
        runtime: { configurable: { sandbox: { backend } } } as any
      } as any,
      handler
    )

    expect(mineruBootstrapService.ensureBootstrap).not.toHaveBeenCalled()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('rewrites mineru commands to the wrapper path and bootstraps first', async () => {
    const backend = { execute: jest.fn() }
    const { middleware, mineruBootstrapService } = createSubject()
    const handler = jest.fn().mockResolvedValue({ ok: true })

    await middleware.wrapToolCall?.(
      {
        tool: { name: 'sandbox_shell' },
        toolCall: {
          id: '1',
          name: 'sandbox_shell',
          args: { command: 'mineru --file ./report.pdf --output ./output/' }
        },
        state: {} as any,
        runtime: { configurable: { sandbox: { backend } } } as any
      } as any,
      handler
    )

    expect(mineruBootstrapService.ensureBootstrap).toHaveBeenCalledWith(backend, defaultConfig)
    expect(mineruBootstrapService.rewriteCommand).toHaveBeenCalledWith(
      'mineru --file ./report.pdf --output ./output/',
      DEFAULT_MINERU_WRAPPER_PATH
    )
    expect(handler.mock.calls[0][0].toolCall.args.command).toBe(
      '/workspace/.xpert/bin/mineru --file ./report.pdf --output ./output/'
    )
  })

  it('rewrites non-wrapper absolute mineru paths back to the managed wrapper', async () => {
    const backend = { execute: jest.fn() }
    const { middleware, mineruBootstrapService } = createSubject()
    const handler = jest.fn().mockResolvedValue({ ok: true })

    await middleware.wrapToolCall?.(
      {
        tool: { name: 'sandbox_shell' },
        toolCall: {
          id: 'absolute-path',
          name: 'sandbox_shell',
          args: { command: '/tmp/mineru --file ./report.pdf --output ./output/' }
        },
        state: {} as any,
        runtime: { configurable: { sandbox: { backend } } } as any
      } as any,
      handler
    )

    expect(mineruBootstrapService.rewriteCommand).toHaveBeenCalledWith(
      '/tmp/mineru --file ./report.pdf --output ./output/',
      DEFAULT_MINERU_WRAPPER_PATH
    )
    expect(handler.mock.calls[0][0].toolCall.args.command).toBe(
      '/workspace/.xpert/bin/mineru --file ./report.pdf --output ./output/'
    )
  })

  it('raises timeout for --file commands', async () => {
    const backend = { execute: jest.fn() }
    const { middleware } = createSubject()
    const handler = jest.fn().mockResolvedValue({ ok: true })

    await middleware.wrapToolCall?.(
      {
        tool: { name: 'sandbox_shell' },
        toolCall: {
          id: '2',
          name: 'sandbox_shell',
          args: { command: 'mineru --file ./report.pdf --output ./output/' }
        },
        state: {} as any,
        runtime: { configurable: { sandbox: { backend } } } as any
      } as any,
      handler
    )

    expect(handler.mock.calls[0][0].toolCall.args.timeout_sec).toBe(DEFAULT_MINERU_FILE_TIMEOUT_SEC)
  })

  it('raises timeout for --dir commands but keeps larger explicit values', async () => {
    const backend = { execute: jest.fn() }
    const { middleware } = createSubject()
    const handler = jest.fn().mockResolvedValue({ ok: true })

    await middleware.wrapToolCall?.(
      {
        tool: { name: 'sandbox_shell' },
        toolCall: {
          id: '3',
          name: 'sandbox_shell',
          args: {
            command: 'mineru --dir ./docs --output ./output/',
            timeout_sec: 3600
          }
        },
        state: {} as any,
        runtime: { configurable: { sandbox: { backend } } } as any
      } as any,
      handler
    )

    expect(handler.mock.calls[0][0].toolCall.args.timeout_sec).toBe(3600)
    expect(handler.mock.calls[0][0].toolCall.args.command).toBe(
      '/workspace/.xpert/bin/mineru --dir ./docs --output ./output/'
    )
    expect(DEFAULT_MINERU_BATCH_TIMEOUT_SEC).toBeLessThan(3600)
  })
})
