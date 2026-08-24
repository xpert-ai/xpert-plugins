import { AIMessage, SystemMessage } from '@langchain/core/messages'
import {
  ConnectorRuntimeCapability,
  type ConnectorRuntimeApi,
  type IAgentMiddlewareContext,
  type ToolCallRequest
} from '@xpert-ai/plugin-sdk'
import { DingTalkConnectorRuntimeMiddleware } from './dingtalk-connector-runtime.middleware.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => () => undefined,
  ConnectorStrategyKey: () => () => undefined,
  ConnectorRuntimeCapability: { id: 'platform.connector' }
}))

describe('DingTalkConnectorRuntimeMiddleware', () => {
  it('teaches the agent to use workspace DingTalk credentials inside sandbox_shell', async () => {
    const middleware = new DingTalkConnectorRuntimeMiddleware().createMiddleware({}, runtimeContext(connectorApi()))
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
    expect(content).toContain('`DINGTALK_ACCESS_TOKEN`')
  })

  it('keeps the runtime instructions when the model request has no sandbox backend yet', async () => {
    const middleware = new DingTalkConnectorRuntimeMiddleware().createMiddleware({}, runtimeContext(connectorApi()))
    const handler = jest.fn().mockResolvedValue(new AIMessage('ok'))

    await middleware.wrapModelCall?.(
      {
        model: {} as never,
        messages: [],
        tools: [],
        state: {} as never,
        systemMessage: new SystemMessage('base prompt')
      },
      handler
    )

    const content = `${handler.mock.calls[0][0].systemMessage.content}`
    expect(content).toContain('base prompt')
    expect(content).toContain('`sandbox_shell`')
    expect(content).toContain('`DINGTALK_ACCESS_TOKEN`')
  })

  it('provisions DingTalk credentials through a temporary file without putting secrets in the command', async () => {
    const connectorRuntime = connectorApi()
    const backend = sandboxBackend()
    const middleware = new DingTalkConnectorRuntimeMiddleware().createMiddleware({}, runtimeContext(connectorRuntime))
    const handler = jest.fn().mockResolvedValue('handled')

    await expect(
      middleware.wrapToolCall?.(
        shellRequest('curl https://api.dingtalk.com/v1.0/contact/users/me', backend),
        handler
      )
    ).resolves.toBe('handled')

    expect(connectorRuntime.getConnectorCredential).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      provider: 'dingtalk'
    })
    expect(backend.uploadFiles).toHaveBeenCalledTimes(1)
    const uploadedPath = backend.uploadFiles.mock.calls[0][0][0][0] as string
    const uploaded = backend.uploadFiles.mock.calls[0][0][0][1] as Buffer
    expect(uploadedPath).toMatch(/^\.xpert\/secrets\/dingtalk-connectors\/dingtalk-1\/env-/)
    expect(uploaded.toString('utf8')).toContain("export DINGTALK_ACCESS_TOKEN='connector-token'")
    expect(uploaded.toString('utf8')).toContain("export DINGTALK_APP_ID='ding-client'")
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCall: expect.objectContaining({
          args: expect.objectContaining({
            command: expect.stringMatching(
              /^\. '\/workspace\/\.xpert\/secrets\/dingtalk-connectors\/dingtalk-1\/env-[^']+' && \/bin\/bash -c /
            )
          })
        })
      })
    )
    const wrappedCommand = handler.mock.calls[0][0].toolCall.args.command as string
    expect(wrappedCommand).not.toContain('connector-token')
    expect(wrappedCommand).toContain('[REDACTED]')
    expect(wrappedCommand).toContain('do printf')
    expect(wrappedCommand).not.toContain('do;')
    expect(backend.execute).toHaveBeenLastCalledWith(`rm -f '/workspace/${uploadedPath}'`)
  })

  it('leaves unrelated commands unchanged', async () => {
    const connectorRuntime = connectorApi()
    const middleware = new DingTalkConnectorRuntimeMiddleware().createMiddleware({}, runtimeContext(connectorRuntime))
    const request = shellRequest('ls -la')
    const handler = jest.fn().mockResolvedValue('handled')

    await expect(middleware.wrapToolCall?.(request, handler)).resolves.toBe('handled')

    expect(handler).toHaveBeenCalledWith(request)
    expect(connectorRuntime.getConnector).not.toHaveBeenCalled()
  })
})

function connectorApi(): ConnectorRuntimeApi {
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
        accessToken: 'connector-token'
      },
      profile: {
        openId: 'open-1',
        userId: 'open-1',
        name: 'Ding User'
      }
    })
  }
}

function sandboxBackend() {
  return {
    workingDirectory: '/workspace',
    execute: jest.fn().mockResolvedValue({ output: '', exitCode: 0, truncated: false }),
    uploadFiles: jest.fn().mockResolvedValue([
      {
        path: '.xpert/secrets/dingtalk-connectors/dingtalk-1/env-uploaded',
        error: null
      }
    ])
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

function shellRequest(command: string, backend?: ReturnType<typeof sandboxBackend>): ToolCallRequest<any> {
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
  } as ToolCallRequest<any>
}
