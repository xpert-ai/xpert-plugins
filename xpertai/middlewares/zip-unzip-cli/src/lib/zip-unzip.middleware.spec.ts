import { AIMessage, SystemMessage } from '@langchain/core/messages'

jest.mock('@metad/contracts', () => ({}))
jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => () => undefined
}))

import { ZipUnzipCLISkillMiddleware } from './zip-unzip.middleware.js'
import { ZipUnzipConfigFormSchema } from './zip-unzip.types.js'

describe('ZipUnzipCLISkillMiddleware', () => {
  const defaultConfig = {}

  function createSubject(options = {}) {
    const zipUnzipBootstrapService = {
      resolveConfig: jest.fn().mockImplementation((config: Record<string, unknown> | undefined) => ({
        ...defaultConfig,
        ...(config ?? {})
      })),
      ensureBootstrap: jest.fn().mockResolvedValue(undefined),
      buildSystemPrompt: jest.fn().mockReturnValue('zip/unzip prompt'),
      isZipUnzipCommand: jest.fn().mockReturnValue(true),
      assertSupportedCommand: jest.fn()
    }

    const strategy = new ZipUnzipCLISkillMiddleware(zipUnzipBootstrapService as any)
    const middleware = strategy.createMiddleware(options, {} as any)

    return {
      strategy,
      middleware,
      zipUnzipBootstrapService
    }
  }

  it('exposes the Zip/Unzip config schema on middleware meta', () => {
    const { strategy } = createSubject()

    expect(strategy.meta.configSchema).toEqual(ZipUnzipConfigFormSchema)
  })

  it('bootstraps the sandbox in beforeAgent when a backend is available', async () => {
    const backend = { execute: jest.fn() }
    const { middleware, zipUnzipBootstrapService } = createSubject()

    await middleware.beforeAgent?.({} as any, {
      configurable: {
        sandbox: {
          backend
        }
      }
    } as any)

    expect(zipUnzipBootstrapService.ensureBootstrap).toHaveBeenCalledWith(backend, defaultConfig)
  })

  it('appends the Zip/Unzip prompt when sandbox is enabled', async () => {
    const backend = { execute: jest.fn() }
    const { middleware, zipUnzipBootstrapService } = createSubject()
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

    expect(zipUnzipBootstrapService.buildSystemPrompt).toHaveBeenCalledWith(defaultConfig)
    expect(handler.mock.calls[0][0].systemMessage).toEqual(
      new SystemMessage({
        content: 'base prompt\n\nzip/unzip prompt'
      })
    )
  })

  it('does not append prompt when sandbox is unavailable', async () => {
    const { middleware, zipUnzipBootstrapService } = createSubject()
    const handler = jest.fn().mockResolvedValue(new AIMessage('ok'))

    await middleware.wrapModelCall?.(
      {
        model: {} as any,
        messages: [],
        tools: [],
        state: {} as any,
        runtime: {} as any,
        systemMessage: new SystemMessage('base prompt')
      },
      handler
    )

    expect(zipUnzipBootstrapService.buildSystemPrompt).not.toHaveBeenCalled()
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        systemMessage: new SystemMessage('base prompt')
      })
    )
  })

  it('does not intercept non-sandbox_shell tools', async () => {
    const backend = { execute: jest.fn() }
    const { middleware, zipUnzipBootstrapService } = createSubject()
    const handler = jest.fn().mockResolvedValue({} as any)

    await middleware.wrapToolCall?.(
      {
        tool: { name: 'other_tool' },
        toolCall: {
          id: 'tool-call-1',
          name: 'other_tool',
          args: {
            command: 'zip archive.zip file.txt'
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

    expect(zipUnzipBootstrapService.ensureBootstrap).not.toHaveBeenCalled()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('passes through non zip/unzip sandbox commands untouched', async () => {
    const backend = { execute: jest.fn() }
    const { middleware, zipUnzipBootstrapService } = createSubject()
    zipUnzipBootstrapService.isZipUnzipCommand.mockReturnValue(false)
    const handler = jest.fn().mockResolvedValue({} as any)

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

    expect(zipUnzipBootstrapService.ensureBootstrap).not.toHaveBeenCalled()
    expect(zipUnzipBootstrapService.assertSupportedCommand).not.toHaveBeenCalled()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('bootstraps before running zip/unzip sandbox commands', async () => {
    const backend = { execute: jest.fn() }
    const { middleware, zipUnzipBootstrapService } = createSubject()
    const handler = jest.fn().mockResolvedValue({} as any)

    await middleware.wrapToolCall?.(
      {
        tool: { name: 'sandbox_shell' },
        toolCall: {
          id: 'tool-call-3',
          name: 'sandbox_shell',
          args: {
            command: 'zip -r archive.zip folder/'
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

    expect(zipUnzipBootstrapService.ensureBootstrap).toHaveBeenCalledWith(backend, defaultConfig)
    expect(zipUnzipBootstrapService.assertSupportedCommand).toHaveBeenCalledWith(
      'zip -r archive.zip folder/'
    )
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('blocks interactive zip -e commands in middleware', async () => {
    const backend = { execute: jest.fn() }
    const { middleware, zipUnzipBootstrapService } = createSubject()
    zipUnzipBootstrapService.assertSupportedCommand.mockImplementation(() => {
      throw new Error('Interactive `zip -e` password prompts are not supported')
    })
    const handler = jest.fn().mockResolvedValue({} as any)

    await expect(
      middleware.wrapToolCall?.(
        {
          tool: { name: 'sandbox_shell' },
          toolCall: {
            id: 'tool-call-4',
            name: 'sandbox_shell',
            args: {
              command: 'zip -e secure.zip file.txt'
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
    ).rejects.toThrow('Interactive `zip -e` password prompts are not supported')

    expect(zipUnzipBootstrapService.ensureBootstrap).toHaveBeenCalledWith(backend, defaultConfig)
    expect(handler).not.toHaveBeenCalled()
  })
})
