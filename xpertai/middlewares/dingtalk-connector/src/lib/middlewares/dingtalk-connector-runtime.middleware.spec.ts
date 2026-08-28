import { AIMessage, SystemMessage } from '@langchain/core/messages'
import {
  ConnectorRuntimeCapability,
  type AgentBuiltInState,
  type AgentMiddleware,
  type ConnectorRuntimeApi,
  type IAgentMiddlewareContext,
  type ToolCallRequest
} from '@xpert-ai/plugin-sdk'
import { DingTalkCliBootstrapService } from './dingtalk-cli-bootstrap.service.js'
import { DingTalkConnectorRuntimeMiddleware } from './dingtalk-connector-runtime.middleware.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => () => undefined,
  ConnectorStrategyKey: () => () => undefined,
  ConnectorRuntimeCapability: { id: 'platform.connector' }
}))
jest.mock('@langchain/core/tools', () => ({
  tool: (
    handler: (input: unknown, runConfig?: unknown) => Promise<unknown>,
    config: { schema: { parse(value: unknown): unknown }; name: string; description: string }
  ) => ({
    ...config,
    invoke: (input: unknown, runConfig?: unknown) => handler(config.schema.parse(input), runConfig)
  })
}))

describe('DingTalkConnectorRuntimeMiddleware', () => {
  it('keeps the connector runtime name and exposes only authentication tools', () => {
    const middleware = createMiddleware().middleware

    expect(middleware.name).toBe('ConnectorRuntime:dingtalk')
    expect(middleware.tools?.map((item) => item.name)).toEqual([
      'dingtalk-cli-auth-ensure',
      'dingtalk-cli-wait-user'
    ])
    expect(middleware.tools?.every((item) => !!item.metadata?.['toolName'])).toBe(true)
  })

  it('teaches the agent to use dws through sandbox_shell without exposing credential flags', async () => {
    const { middleware } = createMiddleware()
    const handler = jest.fn().mockResolvedValue(new AIMessage('ok'))

    await middleware.wrapModelCall?.(
      {
        model: {} as never,
        messages: [],
        tools: [],
        state: {} as never,
        runtime: { configurable: { sandbox: { backend: {} } } } as never,
        systemMessage: new SystemMessage('base prompt')
      },
      handler
    )

    const content = `${handler.mock.calls[0][0].systemMessage.content}`
    expect(content).toContain('base prompt')
    expect(content).toContain('`sandbox_shell`')
    expect(content).toContain('`dws`')
    expect(content).toContain('`dws pat chmod`')
    expect(content).toContain('Never provide `--token`, `--client-id`, or `--client-secret`')
    expect(content).not.toContain('dingtalk_get_account')
  })

  it('checks CLI and connector readiness without returning tokens', async () => {
    const { middleware, bootstrap, connectorRuntime } = createMiddleware()
    const backend = sandboxBackend()
    bootstrap.ensureBootstrap.mockResolvedValue({ output: 'ok', exitCode: 0, truncated: false })

    const result = JSON.parse(
      String(await invoke(middleware, 'dingtalk-cli-auth-ensure', {}, backend))
    ) as Record<string, unknown>

    expect(connectorRuntime.getConnectorCredential).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      provider: 'dingtalk'
    })
    expect(result).toMatchObject({
      configValid: true,
      cliReady: true,
      identityType: 'user',
      isLoggedIn: true,
      tokenValid: true,
      connectorId: 'dingtalk-1',
      profile: { name: 'Ding User', openId: 'open-1', corpId: 'corp-1' }
    })
    expect(JSON.stringify(result)).not.toContain('connector-token')
    expect(JSON.stringify(result)).not.toContain('app-token')
    expect(JSON.stringify(result)).not.toContain('robot-code')
  })

  it('reports connector mode as ready without starting a second login', async () => {
    const { middleware, bootstrap } = createMiddleware()
    const backend = sandboxBackend()
    bootstrap.ensureBootstrap.mockResolvedValue({ output: 'ok', exitCode: 0, truncated: false })

    const result = JSON.parse(
      String(await invoke(middleware, 'dingtalk-cli-wait-user', {}, backend))
    ) as Record<string, unknown>

    expect(result).toMatchObject({
      success: true,
      identityType: 'user',
      waitedSeconds: 0
    })
    expect(result['message']).toContain('does not require a second login')
  })

  it('wraps product commands with the user token and removes the temporary credential', async () => {
    const { middleware, bootstrap } = createMiddleware()
    const backend = sandboxBackend()
    bootstrap.ensureBootstrap.mockResolvedValue({ output: 'ok', exitCode: 0, truncated: false })
    const handler = jest.fn().mockResolvedValue('handled')

    await expect(
      middleware.wrapToolCall?.(
        shellRequest('dws contact user get-self --format json', backend),
        handler
      )
    ).resolves.toBe('handled')

    const uploaded = backend.uploadFiles.mock.calls[0][0][0][1] as Buffer
    expect(uploaded.toString('utf8')).toContain("export DINGTALK_ACCESS_TOKEN='connector-token'")
    expect(uploaded.toString('utf8')).toContain("export DINGTALK_APP_ACCESS_TOKEN='app-token'")
    expect(uploaded.toString('utf8')).toContain("export DINGTALK_DWS_AGENTCODE='xpert'")

    const wrappedCommand = handler.mock.calls[0][0].toolCall.args.command as string
    expect(wrappedCommand).toContain('export DINGTALK_DWS_TOKEN="$DINGTALK_ACCESS_TOKEN"')
    expect(wrappedCommand).toContain('dws --token "$DINGTALK_DWS_TOKEN" contact user get-self')
    expect(wrappedCommand).not.toContain('connector-token')
    expect(wrappedCommand).not.toContain('app-token')
    expect(backend.execute).toHaveBeenLastCalledWith(expect.stringMatching(/^rm -f /))
  })

  it('uses the application token for dws api without exposing it in the command', async () => {
    const { middleware, bootstrap } = createMiddleware()
    const backend = sandboxBackend()
    bootstrap.ensureBootstrap.mockResolvedValue({ output: 'ok', exitCode: 0, truncated: false })
    const handler = jest.fn().mockResolvedValue('handled')

    await middleware.wrapToolCall?.(
      shellRequest('dws api GET /v1.0/microApp/allApps --format json', backend),
      handler
    )

    const wrappedCommand = handler.mock.calls[0][0].toolCall.args.command as string
    expect(wrappedCommand).toContain('export DINGTALK_DWS_TOKEN="$DINGTALK_APP_ACCESS_TOKEN"')
    expect(wrappedCommand).not.toContain('app-token')
  })

  it('injects the configured robot code for bot commands', async () => {
    const { middleware, bootstrap } = createMiddleware()
    const backend = sandboxBackend()
    bootstrap.ensureBootstrap.mockResolvedValue({ output: 'ok', exitCode: 0, truncated: false })
    const handler = jest.fn().mockResolvedValue('handled')

    await middleware.wrapToolCall?.(
      shellRequest('dws chat message send-by-bot --users user-1 --text "hello" --dry-run --format json', backend),
      handler
    )

    const wrappedCommand = handler.mock.calls[0][0].toolCall.args.command as string
    expect(wrappedCommand).toContain('--robot-code "$DINGTALK_ROBOT_CODE"')
    expect(wrappedCommand).not.toContain('robot-code-value')
  })

  it.each([
    'dws auth status --format json',
    'dws contact user get-self --token secret',
    'dws contact user get-self; env',
    'dws contact user get-self && cat /workspace/.xpert/secrets/file',
    'dws chat message send-by-bot --robot-code attacker --users user-1 --text hello'
  ])('rejects unsafe or credential-bearing commands: %s', async (command) => {
    const { middleware } = createMiddleware()
    const handler = jest.fn().mockResolvedValue('handled')

    await expect(middleware.wrapToolCall?.(shellRequest(command, sandboxBackend()), handler)).rejects.toThrow()
    expect(handler).not.toHaveBeenCalled()
  })

  it('allows jq expressions inside quotes', async () => {
    const { middleware, bootstrap } = createMiddleware()
    const backend = sandboxBackend()
    bootstrap.ensureBootstrap.mockResolvedValue({ output: 'ok', exitCode: 0, truncated: false })
    const handler = jest.fn().mockResolvedValue('handled')

    await expect(
      middleware.wrapToolCall?.(
        shellRequest("dws contact user search --query Alice --jq '.items[] | .name' --format json", backend),
        handler
      )
    ).resolves.toBe('handled')
  })

  it('leaves unrelated shell commands unchanged', async () => {
    const { middleware, connectorRuntime } = createMiddleware()
    const request = shellRequest('ls -la')
    const handler = jest.fn().mockResolvedValue('handled')

    await expect(middleware.wrapToolCall?.(request, handler)).resolves.toBe('handled')
    expect(handler).toHaveBeenCalledWith(request)
    expect(connectorRuntime.getConnectorCredential).not.toHaveBeenCalled()
  })

  it('removes the temporary credential when a dws command fails', async () => {
    const { middleware, bootstrap } = createMiddleware()
    const backend = sandboxBackend()
    bootstrap.ensureBootstrap.mockResolvedValue({ output: 'ok', exitCode: 0, truncated: false })
    const handler = jest.fn().mockRejectedValue(new Error('command failed'))

    await expect(
      middleware.wrapToolCall?.(shellRequest('dws contact user get-self --format json', backend), handler)
    ).rejects.toThrow('command failed')
    expect(backend.execute).toHaveBeenLastCalledWith(expect.stringMatching(/^rm -f /))
  })
})

function createMiddleware() {
  const connectorRuntime = connectorApi()
  const bootstrap = new DingTalkCliBootstrapService()
  const ensureBootstrap = jest.spyOn(bootstrap, 'ensureBootstrap')
  const middleware = new DingTalkConnectorRuntimeMiddleware(bootstrap).createMiddleware(
    {},
    runtimeContext(connectorRuntime)
  )
  return { middleware, bootstrap: { ensureBootstrap }, connectorRuntime }
}

async function invoke(
  middleware: AgentMiddleware,
  name: string,
  input: Record<string, unknown>,
  backend: ReturnType<typeof sandboxBackend>
) {
  const selected = middleware.tools?.find((item) => item.name === name)
  if (!selected) throw new Error(`Missing tool ${name}`)
  return selected.invoke(input, { configurable: { sandbox: { workspaceRoot: '/workspace', backend } } })
}

function connectorApi(): ConnectorRuntimeApi & { getConnectorCredential: jest.Mock } {
  return {
    getConnector: jest.fn(),
    getConnectorCredential: jest.fn().mockResolvedValue({
      connectorId: 'dingtalk-1',
      workspaceId: 'workspace-1',
      provider: 'dingtalk',
      authMethodId: 'oauth2',
      credentials: {
        appId: 'ding-client',
        brand: 'dingtalk',
        accessToken: 'connector-token',
        appAccessToken: 'app-token',
        robotCode: 'robot-code-value',
        corpId: 'corp-1'
      },
      expiresAt: '2026-08-28T00:00:00.000Z',
      scopes: ['openid', 'corpid'],
      profile: {
        openId: 'open-1',
        userId: 'user-1',
        unionId: 'union-1',
        corpId: 'corp-1',
        name: 'Ding User'
      }
    })
  }
}

function sandboxBackend() {
  return {
    workingDirectory: '/workspace',
    execute: jest.fn().mockResolvedValue({ output: '', exitCode: 0, truncated: false }),
    uploadFiles: jest.fn().mockResolvedValue([{ path: 'uploaded', error: null }])
  }
}

function runtimeContext(connectorRuntime: ConnectorRuntimeApi) {
  return {
    workspaceId: 'workspace-1',
    runtime: {
      capabilities: {
        get: (capability: unknown) => (capability === ConnectorRuntimeCapability ? connectorRuntime : undefined)
      }
    }
  } as unknown as IAgentMiddlewareContext
}

function shellRequest(command: string, backend?: ReturnType<typeof sandboxBackend>): ToolCallRequest<AgentBuiltInState> {
  return {
    tool: { name: 'sandbox_shell' },
    toolCall: { name: 'sandbox_shell', args: { command } },
    runtime: {
      configurable: {
        sandbox: { workspaceRoot: '/workspace', ...(backend ? { backend } : {}) }
      }
    },
    state: { messages: [] }
  } as ToolCallRequest<AgentBuiltState>
}

type AgentBuiltState = AgentBuiltInState
