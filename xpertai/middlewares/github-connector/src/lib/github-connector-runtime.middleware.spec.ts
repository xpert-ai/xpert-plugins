import { AIMessage, SystemMessage } from '@langchain/core/messages'
import {
  type AgentBuiltInState,
  ConnectorRuntimeCapability,
  type ConnectorRuntimeApi,
  type IAgentMiddlewareContext,
  type ToolCallRequest
} from '@xpert-ai/plugin-sdk'
import { GitHubConnectorRuntimeMiddleware } from './github-connector-runtime.middleware.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => () => undefined,
  ConnectorStrategyKey: () => () => undefined,
  ConnectorRuntimeCapability: { id: 'platform.connector' }
}))

describe('GitHubConnectorRuntimeMiddleware', () => {
  it('does not expose direct GitHub API tools', () => {
    const connectorRuntime = connectorApi()
    const middleware = new GitHubConnectorRuntimeMiddleware().createMiddleware({}, runtimeContext(connectorRuntime))

    expect(middleware.tools).toEqual([])
  })

  it('teaches the agent to use gh through sandbox_shell without exposing credentials', async () => {
    const middleware = new GitHubConnectorRuntimeMiddleware().createMiddleware({}, runtimeContext(connectorApi()))
    const handler = jest.fn().mockResolvedValue(new AIMessage('ok'))

    await middleware.wrapModelCall?.(
      {
        model: {} as never,
        messages: [],
        tools: [],
        state: {} as never,
        runtime: {
          configurable: { sandbox: { backend: sandboxBackend() } }
        } as never,
        systemMessage: new SystemMessage('base prompt')
      },
      handler
    )

    const content = `${handler.mock.calls[0][0].systemMessage.content}`
    expect(content).toContain('base prompt')
    expect(content).toContain('`sandbox_shell`')
    expect(content).toContain('`gh auth status`')
    expect(content).toContain('do not search the filesystem')
    expect(content).toContain('Never print, inspect, or return `GH_TOKEN`')
  })

  it('does not add the GitHub CLI prompt without SandboxShell', async () => {
    const middleware = new GitHubConnectorRuntimeMiddleware().createMiddleware({}, runtimeContext(connectorApi()))
    const request = {
      model: {} as never,
      messages: [],
      tools: [],
      state: {} as never,
      runtime: { configurable: { sandbox: {} } } as never,
      systemMessage: new SystemMessage('base prompt')
    }
    const handler = jest.fn().mockResolvedValue(new AIMessage('ok'))

    await middleware.wrapModelCall?.(request, handler)

    expect(handler).toHaveBeenCalledWith(request)
  })

  it.each(['gh repo view xpert-ai/xpert', 'git push origin main'])(
    'injects the workspace connector credential for sandbox command: %s',
    async (command) => {
      const connectorRuntime = connectorApi()
      const backend = sandboxBackend()
      const middleware = new GitHubConnectorRuntimeMiddleware().createMiddleware({}, runtimeContext(connectorRuntime))
      const handler = jest.fn().mockResolvedValue('handled')

      await expect(middleware.wrapToolCall?.(shellRequest(command, backend), handler)).resolves.toBe('handled')

      expect(connectorRuntime.getConnectorCredential).toHaveBeenCalledWith({
        workspaceId: 'workspace-1',
        provider: 'github'
      })
      expect(backend.uploadFiles).toHaveBeenCalledTimes(1)
      const uploadedPath = backend.uploadFiles.mock.calls[0][0][0][0] as string
      const uploaded = backend.uploadFiles.mock.calls[0][0][0][1] as Buffer
      expect(uploadedPath).toMatch(/^\.xpert\/secrets\/github-connectors\/github-1\/env-/)
      expect(uploaded.toString('utf8')).toContain("export GH_TOKEN='connector-token'")
      expect(uploaded.toString('utf8')).toContain("export GITHUB_TOKEN='connector-token'")
      expect(uploaded.toString('utf8')).toContain(
        "export GH_CONFIG_DIR='/workspace/.xpert/secrets/github-connectors/github-1/config'"
      )
      expect(uploaded.toString('utf8')).toContain('export GIT_SSH_COMMAND=false')
      expect(uploaded.toString('utf8')).toContain("export GIT_CONFIG_VALUE_0=''")
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          toolCall: expect.objectContaining({
            args: expect.objectContaining({
              command: `. '/workspace/${uploadedPath}' && ${command}`
            })
          })
        })
      )
      expect(backend.execute).toHaveBeenLastCalledWith(`rm -f '/workspace/${uploadedPath}'`)
    }
  )

  it('uses a unique credential file for each concurrent sandbox command', async () => {
    const backend = sandboxBackend()
    const middleware = new GitHubConnectorRuntimeMiddleware().createMiddleware({}, runtimeContext(connectorApi()))
    const handler = jest.fn().mockResolvedValue('handled')

    await Promise.all([
      middleware.wrapToolCall?.(shellRequest('gh api user', backend), handler),
      middleware.wrapToolCall?.(shellRequest('git fetch origin', backend), handler)
    ])

    const uploadedPaths = backend.uploadFiles.mock.calls.map((call) => call[0][0][0] as string)
    expect(uploadedPaths).toHaveLength(2)
    expect(new Set(uploadedPaths).size).toBe(2)
    for (const uploadedPath of uploadedPaths) {
      expect(backend.execute).toHaveBeenCalledWith(`rm -f '/workspace/${uploadedPath}'`)
    }
  })

  it('removes the credential file when protecting it fails', async () => {
    const backend = sandboxBackend()
    backend.execute
      .mockResolvedValueOnce(commandResult())
      .mockResolvedValueOnce(commandResult(1, 'chmod failed'))
      .mockResolvedValueOnce(commandResult())
    const middleware = new GitHubConnectorRuntimeMiddleware().createMiddleware({}, runtimeContext(connectorApi()))
    const handler = jest.fn().mockResolvedValue('handled')

    await expect(middleware.wrapToolCall?.(shellRequest('gh auth status', backend), handler)).rejects.toThrow(
      'Failed to protect GitHub connector credential file: chmod failed'
    )

    const uploadedPath = backend.uploadFiles.mock.calls[0][0][0][0] as string
    expect(backend.execute).toHaveBeenLastCalledWith(`rm -f '/workspace/${uploadedPath}'`)
    expect(handler).not.toHaveBeenCalled()
  })

  it('reports a credential cleanup failure', async () => {
    const backend = sandboxBackend()
    backend.execute
      .mockResolvedValueOnce(commandResult())
      .mockResolvedValueOnce(commandResult())
      .mockResolvedValueOnce(commandResult(1, 'remove failed'))
    const middleware = new GitHubConnectorRuntimeMiddleware().createMiddleware({}, runtimeContext(connectorApi()))
    const handler = jest.fn().mockResolvedValue('handled')

    await expect(middleware.wrapToolCall?.(shellRequest('gh auth status', backend), handler)).rejects.toThrow(
      'Failed to remove GitHub connector credential file: remove failed'
    )
  })

  it('leaves unrelated sandbox commands unchanged', async () => {
    const connectorRuntime = connectorApi()
    const backend = sandboxBackend()
    const middleware = new GitHubConnectorRuntimeMiddleware().createMiddleware({}, runtimeContext(connectorRuntime))
    const request = shellRequest('ls -la', backend)
    const handler = jest.fn().mockResolvedValue('handled')

    await expect(middleware.wrapToolCall?.(request, handler)).resolves.toBe('handled')

    expect(handler).toHaveBeenCalledWith(request)
    expect(connectorRuntime.getConnectorCredential).not.toHaveBeenCalled()
    expect(backend.uploadFiles).not.toHaveBeenCalled()
  })

  it('rejects GitHub CLI commands without a sandbox backend', async () => {
    const connectorRuntime = connectorApi()
    const middleware = new GitHubConnectorRuntimeMiddleware().createMiddleware({}, runtimeContext(connectorRuntime))
    const handler = jest.fn().mockResolvedValue('handled')

    await expect(middleware.wrapToolCall?.(shellRequest('gh auth status'), handler)).rejects.toThrow(
      'GitHub connector CLI mode requires SandboxShell'
    )

    expect(handler).not.toHaveBeenCalled()
    expect(connectorRuntime.getConnectorCredential).not.toHaveBeenCalled()
  })
})

function connectorApi(): ConnectorRuntimeApi {
  return {
    getConnector: jest.fn(),
    getConnectorCredential: jest.fn().mockResolvedValue({
      connectorId: 'github-1',
      workspaceId: 'workspace-1',
      provider: 'github',
      authMethodId: 'pat',
      credentials: { accessToken: 'connector-token', tokenType: 'bearer' }
    })
  }
}

function sandboxBackend() {
  return {
    workingDirectory: '/workspace',
    execute: jest.fn().mockResolvedValue(commandResult()),
    uploadFiles: jest.fn().mockResolvedValue([
      {
        path: '.xpert/secrets/github-connectors/github-1/env-uploaded',
        error: null
      }
    ])
  }
}

function commandResult(exitCode = 0, output = '') {
  return { output, exitCode, truncated: false }
}

function shellRequest(
  command: string,
  backend?: ReturnType<typeof sandboxBackend>
): ToolCallRequest<AgentBuiltInState> {
  return {
    tool: { name: 'sandbox_shell' },
    toolCall: {
      args: { command }
    },
    runtime: {
      configurable: {
        sandbox: {
          workspaceRoot: '/workspace',
          ...(backend ? { backend } : {})
        }
      }
    },
    state: {
      messages: []
    }
  } as unknown as ToolCallRequest<AgentBuiltInState>
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
