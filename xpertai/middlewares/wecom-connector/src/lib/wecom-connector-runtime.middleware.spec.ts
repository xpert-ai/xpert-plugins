import { AIMessage, SystemMessage } from '@langchain/core/messages'
import {
  type AgentBuiltInState,
  ConnectorRuntimeCapability,
  type ConnectorRuntimeApi,
  type IAgentMiddlewareContext,
  type ToolCallRequest
} from '@xpert-ai/plugin-sdk'
import { WeComConnectorRuntimeMiddleware } from './wecom-connector-runtime.middleware.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => () => undefined,
  ConnectorStrategyKey: () => () => undefined,
  ConnectorRuntimeCapability: { id: 'platform.connector' }
}))

describe('WeComConnectorRuntimeMiddleware', () => {
  it('teaches the agent how to use WeCom from sandbox_shell', async () => {
    const middleware = new WeComConnectorRuntimeMiddleware().createMiddleware({}, runtimeContext(connectorApi()))
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
    expect(content).toContain('WECOM_ACCESS_TOKEN')
    expect(content).toContain('qyapi.weixin.qq.com')
  })

  it('injects a temporary env file for WeCom commands and cleans it up afterwards', async () => {
    const connectorRuntime = connectorApi()
    const backend = sandboxBackend()
    const middleware = new WeComConnectorRuntimeMiddleware().createMiddleware({}, runtimeContext(connectorRuntime))
    const handler = jest.fn().mockResolvedValue('handled')

    await expect(
      middleware.wrapToolCall?.(shellRequest('curl https://qyapi.weixin.qq.com/cgi-bin/gettoken', backend), handler)
    ).resolves.toBe('handled')

    expect(connectorRuntime.getConnectorCredential).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      provider: 'wecom'
    })
    expect(backend.uploadFiles).toHaveBeenCalledTimes(1)
    const uploadedPath = backend.uploadFiles.mock.calls[0][0][0][0] as string
    const uploaded = backend.uploadFiles.mock.calls[0][0][0][1] as Buffer
    expect(uploadedPath).toMatch(/^\.xpert\/secrets\/wecom-connectors\/wecom-1\/env-/)
    expect(uploaded.toString('utf8')).toContain("export WECOM_ACCESS_TOKEN='access-token-1'")
    expect(uploaded.toString('utf8')).toContain("export WECOM_CORP_ID='corp-1'")
    expect(uploaded.toString('utf8')).toContain("export WECOM_AGENT_ID='1000002'")
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCall: expect.objectContaining({
          args: expect.objectContaining({
            command: `. '/workspace/${uploadedPath}' && curl https://qyapi.weixin.qq.com/cgi-bin/gettoken`
          })
        })
      })
    )
    expect(backend.execute).toHaveBeenLastCalledWith(`rm -f '/workspace/${uploadedPath}'`)
  })

  it('leaves unrelated sandbox commands unchanged', async () => {
    const connectorRuntime = connectorApi()
    const backend = sandboxBackend()
    const middleware = new WeComConnectorRuntimeMiddleware().createMiddleware({}, runtimeContext(connectorRuntime))
    const request = shellRequest('ls -la', backend)
    const handler = jest.fn().mockResolvedValue('handled')

    await expect(middleware.wrapToolCall?.(request, handler)).resolves.toBe('handled')

    expect(handler).toHaveBeenCalledWith(request)
    expect(connectorRuntime.getConnectorCredential).not.toHaveBeenCalled()
  })
})

function connectorApi(): ConnectorRuntimeApi {
  return {
    getConnector: jest.fn(),
    getConnectorCredential: jest.fn().mockResolvedValue({
      connectorId: 'wecom-1',
      workspaceId: 'workspace-1',
      provider: 'wecom',
      authMethodId: 'wecom-qr',
      credentials: {
        corpId: 'corp-1',
        agentId: '1000002',
        accessToken: 'access-token-1'
      },
      profile: {
        userId: 'user-1',
        openId: 'open-1',
        unionId: 'union-1'
      }
    })
  }
}

function sandboxBackend() {
  return {
    workingDirectory: '/workspace',
    execute: jest.fn().mockResolvedValue(commandResult()),
    uploadFiles: jest.fn().mockResolvedValue([
      {
        path: '.xpert/secrets/wecom-connectors/wecom-1/env-uploaded',
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
      args: {
        command
      }
    },
    runtime: {
      configurable: {
        sandbox: {
          backend
        }
      }
    } as never
  } as ToolCallRequest<AgentBuiltInState>
}

function runtimeContext(connectorRuntime: ConnectorRuntimeApi): IAgentMiddlewareContext {
  return {
    workspaceId: 'workspace-1',
    runtime: {
      capabilities: new Map([[ConnectorRuntimeCapability, connectorRuntime]])
    }
  } as IAgentMiddlewareContext
}
