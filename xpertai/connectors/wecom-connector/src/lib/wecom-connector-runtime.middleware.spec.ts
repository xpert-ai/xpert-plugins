import { AIMessage } from '@langchain/core/messages'
import {
  ConnectorRuntimeCapability,
  type ConnectorRuntimeApi,
  type IAgentMiddlewareContext
} from '@xpert-ai/plugin-sdk'
import { WeComCliBootstrapService } from './wecom-cli-bootstrap.service.js'
import { WeComConnectorRuntimeMiddleware } from './wecom-connector-runtime.middleware.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => () => undefined,
  ConnectorRuntimeCapability: { id: 'platform.connector' }
}))

describe('WeComConnectorRuntimeMiddleware', () => {
  it('adds official CLI usage instructions and exposes only the auth tool', () => {
    const middleware = new WeComConnectorRuntimeMiddleware(new WeComCliBootstrapService()).createMiddleware(
      {},
      runtimeContext(connectorApi())
    )
    expect(middleware.tools).toHaveLength(1)
    expect(middleware.tools?.[0].name).toBe('wecom_cli_auth_ensure')
  })

  it('bootstraps and rewrites a direct WeCom CLI command with connector-scoped config', async () => {
    const connectorRuntime = connectorApi()
    const sandboxBackend = createBackend()
    const bootstrap = new WeComCliBootstrapService()
    jest.spyOn(bootstrap, 'ensureAuthorized').mockResolvedValue({
      status: 'authorized',
      cliVersion: '1.2.0',
      skillsVersion: 'skills-ref',
      identityType: 'bot',
      message: 'authorized'
    })
    const middleware = new WeComConnectorRuntimeMiddleware(bootstrap).createMiddleware(
      {},
      runtimeContext(connectorRuntime)
    )
    const handler = jest.fn().mockResolvedValue('handled')
    const request = shellRequest('wecom-cli message list', sandboxBackend)

    await expect(middleware.wrapToolCall?.(request, handler)).resolves.toBe('handled')
    expect(bootstrap.ensureAuthorized).toHaveBeenCalled()
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCall: expect.objectContaining({
          args: expect.objectContaining({
            command: expect.stringContaining(
              "WECOM_CLI_CONFIG_DIR='/workspace/.xpert/secrets/wecom-cli/connector-1/config'"
            )
          })
        })
      })
    )
    expect(handler.mock.calls[0][0].toolCall.args.command).toContain(
      "'/workspace/.xpert/tools/wecom-cli/bin/wecom-cli' message list"
    )
  })

  it('bootstraps before allowing the model to read official Skills', async () => {
    const sandboxBackend = createBackend()
    const bootstrap = new WeComCliBootstrapService()
    const ensureBootstrap = jest.spyOn(bootstrap, 'ensureBootstrap').mockResolvedValue()
    const middleware = new WeComConnectorRuntimeMiddleware(bootstrap).createMiddleware(
      {},
      runtimeContext(connectorApi())
    )
    const request = shellRequest('cat /workspace/.xpert/skills/wecom-cli/wecomcli-message/SKILL.md', sandboxBackend)
    const handler = jest.fn().mockResolvedValue('read')

    await expect(middleware.wrapToolCall?.(request, handler)).resolves.toBe('read')
    expect(ensureBootstrap).toHaveBeenCalled()
    expect(handler).toHaveBeenCalledWith(request)
  })

  it('leaves unrelated sandbox commands unchanged', async () => {
    const connectorRuntime = connectorApi()
    const middleware = new WeComConnectorRuntimeMiddleware(new WeComCliBootstrapService()).createMiddleware(
      {},
      runtimeContext(connectorRuntime)
    )
    const request = shellRequest('ls -la', createBackend())
    const handler = jest.fn().mockResolvedValue(new AIMessage('handled'))

    await expect(middleware.wrapToolCall?.(request, handler)).resolves.toEqual(expect.any(AIMessage))
    expect(handler).toHaveBeenCalledWith(request)
    expect(connectorRuntime.getConnectorCredential).not.toHaveBeenCalled()
  })

  it('rejects shell wrappers instead of allowing a CLI auth bypass', async () => {
    const middleware = new WeComConnectorRuntimeMiddleware(new WeComCliBootstrapService()).createMiddleware(
      {},
      runtimeContext(connectorApi())
    )
    const handler = jest.fn()
    await expect(
      middleware.wrapToolCall?.(shellRequest("sh -c 'wecom-cli message list'", createBackend()), handler)
    ).rejects.toThrow('direct `wecom-cli` command')
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not let a Skill-file read bypass the CLI command policy', async () => {
    const middleware = new WeComConnectorRuntimeMiddleware(new WeComCliBootstrapService()).createMiddleware(
      {},
      runtimeContext(connectorApi())
    )
    const handler = jest.fn()
    await expect(
      middleware.wrapToolCall?.(
        shellRequest(
          "sh -c 'cat /workspace/.xpert/skills/wecom-cli/wecomcli-message/SKILL.md; wecom-cli auth show'",
          createBackend()
        ),
        handler
      )
    ).rejects.toThrow()
    expect(handler).not.toHaveBeenCalled()
  })
})

function connectorApi(): ConnectorRuntimeApi {
  return {
    getConnector: jest.fn(),
    getConnectorCredential: jest.fn().mockResolvedValue({
      connectorId: 'connector-1',
      workspaceId: 'workspace-1',
      provider: 'wecom',
      authMethodId: 'wecom-cli-qr',
      credentials: { botId: 'bot-1', botSecret: 'secret-1' },
      profile: { name: 'WeCom AI Bot', identityType: 'bot' }
    })
  } as never
}

function createBackend() {
  return {
    workingDirectory: '/workspace',
    execute: jest.fn().mockResolvedValue({ output: '', exitCode: 0, truncated: false }),
    uploadFiles: jest.fn().mockResolvedValue([])
  } as never
}

function shellRequest(command: string, sandboxBackend: unknown) {
  return {
    tool: { name: 'sandbox_shell' },
    toolCall: { args: { command } },
    runtime: { configurable: { sandbox: { backend: sandboxBackend } } }
  } as never
}

function runtimeContext(connectorRuntime: ConnectorRuntimeApi): IAgentMiddlewareContext {
  return {
    workspaceId: 'workspace-1',
    runtime: { capabilities: new Map([[ConnectorRuntimeCapability, connectorRuntime]]) }
  } as never
}
