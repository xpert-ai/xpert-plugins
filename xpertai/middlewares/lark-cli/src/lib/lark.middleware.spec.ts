jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => () => undefined,
  ConnectorRuntimeCapability: { id: 'platform.connector' }
}))

jest.mock('@langchain/core/messages', () => ({
  SystemMessage: class SystemMessage {
    constructor(readonly input: unknown) {}
  }
}))

jest.mock('@langchain/core/tools', () => ({
  tool: (handler: unknown, options: Record<string, unknown>) => ({
    ...options,
    handler
  })
}))

jest.mock('@langchain/core/runnables', () => ({}))

import { LarkCLISkillMiddleware } from './lark.middleware.js'
import { LarkAuthMode } from './lark-cli.types.js'

describe('LarkCLISkillMiddleware', () => {
  it('does not bootstrap lark-cli before normal agent turns', () => {
    const bootstrapService = {
      resolveConfig: jest.fn().mockReturnValue({
        authMode: LarkAuthMode.CONNECTOR
      }),
      resolveRuntimePaths: jest.fn().mockReturnValue({
        workspaceRoot: '/workspace',
        skillsDir: '/workspace/.xpert/skills/lark-cli',
        secretsDir: '/workspace/.xpert/secrets',
        stampPath: '/workspace/.xpert/.lark-cli-bootstrap.json',
        connectorEnvDir: '/workspace/.xpert/secrets/lark-cli-connectors',
        appIdPath: '/workspace/.xpert/secrets/lark_app_id',
        appSecretPath: '/workspace/.xpert/secrets/lark_app_secret'
      }),
      ensureBootstrap: jest.fn(),
      syncConnectorCredential: jest.fn(),
      buildSystemPrompt: jest.fn().mockReturnValue('prompt')
    }

    const middleware = new LarkCLISkillMiddleware(bootstrapService as any).createMiddleware(
      {},
      {
        workspaceId: 'workspace-1',
        runtime: {
          capabilities: {
            get: jest.fn()
          }
        }
      } as any
    )

    expect(middleware.beforeAgent).toBeUndefined()
    expect(bootstrapService.ensureBootstrap).not.toHaveBeenCalled()
  })

  it('injects connector environment for lark-cli sandbox commands', async () => {
    const runtimePaths = {
      workspaceRoot: '/workspace',
      skillsDir: '/workspace/.xpert/skills/lark-cli',
      secretsDir: '/workspace/.xpert/secrets',
      stampPath: '/workspace/.xpert/.lark-cli-bootstrap.json',
      connectorEnvDir: '/workspace/.xpert/secrets/lark-cli-connectors',
      appIdPath: '/workspace/.xpert/secrets/lark_app_id',
      appSecretPath: '/workspace/.xpert/secrets/lark_app_secret'
    }
    const credential = {
      connectorId: 'connector-1',
      workspaceId: 'workspace-1',
      provider: 'lark',
      appId: 'cli_app_id',
      brand: 'feishu',
      accessToken: 'user_access_token'
    }
    const connectorApi = {
      getConnector: jest.fn().mockResolvedValue(credential)
    }
    const bootstrapService = {
      resolveConfig: jest.fn().mockReturnValue({
        authMode: LarkAuthMode.CONNECTOR
      }),
      resolveRuntimePaths: jest.fn().mockReturnValue(runtimePaths),
      isLarkCliCommand: jest.fn().mockReturnValue(true),
      ensureBootstrap: jest.fn().mockResolvedValue({ output: '', exitCode: 0, truncated: false }),
      syncConnectorCredential: jest.fn().mockResolvedValue({ output: '', exitCode: 0, truncated: false }),
      buildConnectorCommand: jest.fn().mockReturnValue(". '/workspace/.xpert/secrets/lark-cli-connectors/connector-1/env' && lark-cli calendar +agenda"),
      buildSystemPrompt: jest.fn().mockReturnValue('prompt')
    }
    const middleware = new LarkCLISkillMiddleware(bootstrapService as any).createMiddleware(
      {},
      {
        workspaceId: 'workspace-1',
        runtime: {
          capabilities: {
            get: jest.fn().mockReturnValue(connectorApi)
          }
        }
      } as any
    )
    const backend = {
      execute: jest.fn()
    }
    const handler = jest.fn().mockResolvedValue('handled')

    await middleware.wrapToolCall?.(
      {
        tool: { name: 'sandbox_shell' },
        toolCall: {
          args: {
            command: 'lark-cli calendar +agenda'
          }
        },
        runtime: {
          configurable: {
            sandbox: {
              backend
            }
          }
        },
        state: {
          messages: []
        }
      } as any,
      handler
    )

    expect(connectorApi.getConnector).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      provider: 'lark'
    })
    expect(bootstrapService.ensureBootstrap).toHaveBeenCalledWith(backend, { authMode: LarkAuthMode.CONNECTOR }, runtimePaths)
    expect(bootstrapService.syncConnectorCredential).toHaveBeenCalledWith(backend, credential, runtimePaths)
    expect(bootstrapService.buildConnectorCommand).toHaveBeenCalledWith(
      'lark-cli calendar +agenda',
      'connector-1',
      runtimePaths
    )
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCall: expect.objectContaining({
          args: expect.objectContaining({
            command: ". '/workspace/.xpert/secrets/lark-cli-connectors/connector-1/env' && lark-cli calendar +agenda"
          })
        })
      })
    )
  })

  it('rejects connector-mode lark-cli commands without SandboxShell backend', async () => {
    const connectorApi = {
      getConnector: jest.fn()
    }
    const bootstrapService = {
      resolveConfig: jest.fn().mockReturnValue({
        authMode: LarkAuthMode.CONNECTOR
      }),
      isLarkCliCommand: jest.fn().mockReturnValue(true),
      buildSystemPrompt: jest.fn().mockReturnValue('prompt')
    }
    const middleware = new LarkCLISkillMiddleware(bootstrapService as any).createMiddleware(
      {},
      {
        workspaceId: 'workspace-1',
        runtime: {
          capabilities: {
            get: jest.fn().mockReturnValue(connectorApi)
          }
        }
      } as any
    )
    const handler = jest.fn().mockResolvedValue('handled')

    await expect(
      middleware.wrapToolCall?.(
        {
          tool: { name: 'sandbox_shell' },
          toolCall: {
            args: {
              command: 'lark-cli calendar +agenda'
            }
          },
          runtime: {
            configurable: {}
          },
          state: {
            messages: []
          }
        } as any,
        handler
      )
    ).rejects.toThrow('Lark CLI connector mode requires SandboxShell.')

    expect(handler).not.toHaveBeenCalled()
    expect(connectorApi.getConnector).not.toHaveBeenCalled()
  })
})
