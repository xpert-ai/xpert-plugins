import { AIMessage, SystemMessage } from '@langchain/core/messages'
import {
  type AgentBuiltInState,
  ConnectorRuntimeCapability,
  type AgentMiddleware,
  type ConnectorRuntimeApi,
  type IAgentMiddlewareContext,
  type ToolCallRequest
} from '@xpert-ai/plugin-sdk'
import { DingTalkConnectorApiClient } from '../api/dingtalk-connector-api.client.js'
import { DingTalkConfirmationStore } from '../tools/confirmation-store.js'
import { DingTalkConnectorRuntimeMiddleware } from './dingtalk-connector-runtime.middleware.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => () => undefined,
  ConnectorStrategyKey: () => () => undefined,
  ConnectorRuntimeCapability: { id: 'platform.connector' }
}))
jest.mock('@langchain/core/tools', () => ({
  tool: (
    handler: (input: unknown) => Promise<unknown>,
    config: { schema: { parse(value: unknown): unknown }; name: string; description: string }
  ) => ({
    ...config,
    invoke: (input: unknown) => handler(config.schema.parse(input))
  })
}))

describe('DingTalkConnectorRuntimeMiddleware', () => {
  it('teaches the agent to use workspace DingTalk credentials inside sandbox_shell', async () => {
    const middleware = runtimeMiddleware(connectorApi())
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
    const middleware = runtimeMiddleware(connectorApi())
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
    const middleware = runtimeMiddleware(connectorRuntime)
    const handler = jest.fn().mockResolvedValue('handled')

    await expect(
      middleware.wrapToolCall?.(shellRequest('curl https://api.dingtalk.com/v1.0/contact/users/me', backend), handler)
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

  it('removes the temporary credential when the wrapped command fails', async () => {
    const backend = sandboxBackend()
    const middleware = runtimeMiddleware(connectorApi())
    const handler = jest.fn().mockRejectedValue(new Error('command failed'))

    await expect(
      middleware.wrapToolCall?.(shellRequest('curl https://api.dingtalk.com/v1.0/contact/users/me', backend), handler)
    ).rejects.toThrow('command failed')

    expect(backend.execute).toHaveBeenCalledWith(expect.stringMatching(/^rm -f /))
  })

  it('preserves both the command and cleanup failures', async () => {
    const backend = sandboxBackend()
    backend.execute.mockImplementation(async (command: string) => {
      if (command.startsWith('rm -f ')) {
        throw new Error('cleanup failed')
      }
      return { output: '', exitCode: 0, truncated: false }
    })
    const middleware = runtimeMiddleware(connectorApi())
    const handler = jest.fn().mockRejectedValue(new Error('command failed'))

    let caught: unknown
    try {
      await middleware.wrapToolCall?.(
        shellRequest('curl https://api.dingtalk.com/v1.0/contact/users/me', backend),
        handler
      )
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(AggregateError)
    expect((caught as AggregateError).errors).toEqual([
      expect.objectContaining({ message: 'command failed' }),
      expect.objectContaining({ message: 'cleanup failed' })
    ])
  })

  it('leaves unrelated commands unchanged', async () => {
    const connectorRuntime = connectorApi()
    const middleware = runtimeMiddleware(connectorRuntime)
    const request = shellRequest('ls -la')
    const handler = jest.fn().mockResolvedValue('handled')

    await expect(middleware.wrapToolCall?.(request, handler)).resolves.toBe('handled')

    expect(handler).toHaveBeenCalledWith(request)
    expect(connectorRuntime.getConnector).not.toHaveBeenCalled()
  })

  it('exposes bounded account, directory, conversation, and message tools', async () => {
    const setup = createSetup()

    expect(setup.middleware.tools?.map((item) => item.name)).toEqual([
      'dingtalk_get_account',
      'dingtalk_list_departments',
      'dingtalk_list_department_members',
      'dingtalk_get_user',
      'dingtalk_list_conversations',
      'dingtalk_send_message'
    ])
    expect(setup.middleware.tools?.every((item) => !!item.metadata?.['toolName'])).toBe(true)
    await expect(invoke(setup.middleware, 'dingtalk_list_departments', { unknown: true })).rejects.toThrow()
  })

  it('returns an allowlisted account without exposing either access token', async () => {
    const setup = createSetup()
    setup.getCurrentUser.mockResolvedValue({
      name: 'Ding User',
      openId: 'open-1',
      unionId: 'union-1',
      corpId: 'corp-1'
    })

    const result = await invoke(setup.middleware, 'dingtalk_get_account', {})

    expect(result).toMatchObject({
      provider: 'dingtalk',
      profile: { name: 'Ding User', openId: 'open-1', unionId: 'union-1', corpId: 'corp-1' },
      capabilities: { account: true, organizationContacts: true, robotMessaging: true }
    })
    expect(JSON.stringify(result)).not.toContain('connector-token')
    expect(JSON.stringify(result)).not.toContain('app-token')
  })

  it('uses the app token server-side for paginated department members', async () => {
    const setup = createSetup()
    setup.listDepartmentMembers.mockResolvedValue({
      items: [{ userId: 'user-1', name: 'User One', departmentIds: [2] }],
      hasMore: true,
      nextCursor: 20
    })

    const result = await invoke(setup.middleware, 'dingtalk_list_department_members', { department_id: 2 })

    expect(setup.listDepartmentMembers).toHaveBeenCalledWith({
      appAccessToken: 'app-token',
      departmentId: 2,
      cursor: 0,
      limit: 20,
      language: 'zh_CN'
    })
    expect(result).toMatchObject({ items: [{ userId: 'user-1' }], hasMore: true, nextCursor: 20 })
  })

  it('requires a one-time confirmation before sending a message', async () => {
    const setup = createSetup()
    setup.sendMessage.mockResolvedValue({ messageId: 'message-1' })
    const message = {
      recipient_type: 'user_id',
      recipient_id: 'user-1',
      format: 'text',
      content: 'Hello from Xpert'
    }

    const first = await invoke(setup.middleware, 'dingtalk_send_message', message)
    expect(first).toMatchObject({ status: 'confirmation_required', errorCode: 'CONFIRMATION_REQUIRED' })
    expect(setup.sendMessage).not.toHaveBeenCalled()

    const second = await invoke(setup.middleware, 'dingtalk_send_message', {
      ...message,
      confirmation_handle: String((first as Record<string, unknown>)['confirmationHandle']),
      confirmed: true
    })
    expect(second).toEqual({
      status: 'completed',
      recipientType: 'user_id',
      recipientId: 'user-1',
      messageId: 'message-1'
    })
    expect(setup.sendMessage).toHaveBeenCalledWith({
      appAccessToken: 'app-token',
      robotCode: 'robot-code',
      recipientType: 'user_id',
      recipientId: 'user-1',
      format: 'text',
      title: undefined,
      content: 'Hello from Xpert'
    })
  })
})

function createSetup() {
  const api = {
    getCurrentUser: jest.fn(),
    listDepartments: jest.fn(),
    listDepartmentMembers: jest.fn(),
    getUser: jest.fn(),
    listConversations: jest.fn(),
    sendMessage: jest.fn()
  }
  const middleware = new DingTalkConnectorRuntimeMiddleware(
    api as unknown as DingTalkConnectorApiClient,
    new DingTalkConfirmationStore()
  ).createMiddleware({}, runtimeContext(connectorApi()))
  return { middleware, ...api }
}

function runtimeMiddleware(connectorRuntime: ConnectorRuntimeApi) {
  return new DingTalkConnectorRuntimeMiddleware(
    new DingTalkConnectorApiClient(),
    new DingTalkConfirmationStore()
  ).createMiddleware({}, runtimeContext(connectorRuntime))
}

async function invoke(middleware: AgentMiddleware, name: string, input: Record<string, unknown>) {
  const selected = middleware.tools?.find((item) => item.name === name)
  if (!selected) throw new Error(`Missing tool ${name}`)
  return selected.invoke(input)
}

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
        accessToken: 'connector-token',
        appAccessToken: 'app-token',
        robotCode: 'robot-code'
      },
      scopes: ['openid', 'corpid'],
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

function shellRequest(command: string, backend?: ReturnType<typeof sandboxBackend>): ToolCallRequest<AgentBuiltInState> {
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
  } as ToolCallRequest<AgentBuiltInState>
}
