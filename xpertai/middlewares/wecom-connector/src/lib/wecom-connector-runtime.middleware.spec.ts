import {
  ConnectorRuntimeCapability,
  WorkspaceFilesRuntimeCapability,
  type AgentMiddleware,
  type ConnectorRuntimeApi,
  type IAgentMiddlewareContext
} from '@xpert-ai/plugin-sdk'
import { WeComApiClient } from './api/wecom-api.client.js'
import { WeComConfirmationStore } from './tools/confirmation-store.js'
import { WeComConnectorRuntimeMiddleware } from './wecom-connector-runtime.middleware.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => (target: object) => target,
  ConnectorRuntimeCapability: { id: 'platform.connector' },
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' }
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

describe('WeComConnectorRuntimeMiddleware', () => {
  it('exposes only the bounded WeCom tools with localized names and no shell interception', async () => {
    const setup = createSetup()

    expect(setup.middleware.tools?.map((tool) => tool.name)).toEqual([
      'wecom_get_context',
      'wecom_list_departments',
      'wecom_get_department',
      'wecom_list_department_members',
      'wecom_get_member',
      'wecom_list_tags',
      'wecom_get_tag_members',
      'wecom_send_text_message',
      'wecom_send_markdown_message',
      'wecom_send_file_message',
      'wecom_recall_message'
    ])
    expect(setup.middleware.tools?.every((tool) => tool.metadata?.toolName)).toBe(true)
    expect(setup.middleware.wrapModelCall).toBeUndefined()
    expect(setup.middleware.wrapToolCall).toBeUndefined()
    await expect(invoke(setup.middleware, 'wecom_list_tags', { unknown: true })).rejects.toThrow()
  })

  it('returns allowlisted connected context without raw credentials or provider fields', async () => {
    const setup = createSetup()
    setup.api.getAgent.mockResolvedValue({
      errcode: 0,
      agentid: 1000002,
      name: 'Assistant',
      description: 'Internal app',
      allow_userinfos: { user: [{ userid: 'user-1' }] },
      allow_partys: { partyid: [1, 2] },
      allow_tags: { tagid: [3] },
      mobile: 'drop',
      secret: 'drop'
    })

    const result = await invoke(setup.middleware, 'wecom_get_context', {})

    expect(result).toMatchObject({
      connectorId: 'wecom-1',
      connectedIdentity: { userId: 'user-1', name: 'User One' },
      application: {
        agentId: '1000002',
        name: 'Assistant',
        visibleScope: { userCount: 1, departmentCount: 2, tagCount: 1 }
      }
    })
    expect(JSON.stringify(result)).not.toContain('access-token-1')
    expect(JSON.stringify(result)).not.toContain('drop')
  })

  it('requires one-time confirmation and sends an identical text message once', async () => {
    const setup = createSetup()
    setup.api.sendMessage.mockResolvedValue({ errcode: 0, msgid: 'message-1' })
    const base = { to_user_ids: ['user-1'], content: 'Hello from Xpert' }

    const first = await invoke(setup.middleware, 'wecom_send_text_message', base)
    expect(first).toMatchObject({
      status: 'confirmation_required',
      errorCode: 'CONFIRMATION_REQUIRED',
      operationSummary: { recipients: ['user-1'], messageType: 'text', content: 'Hello from Xpert' }
    })
    expect(setup.api.sendMessage).not.toHaveBeenCalled()

    const second = await invoke(setup.middleware, 'wecom_send_text_message', {
      ...base,
      confirmation_handle: String(first.confirmationHandle),
      confirmed: true
    })
    expect(second).toMatchObject({ status: 'completed', operation: 'send_text_message', messageId: 'message-1' })
    expect(setup.api.sendMessage).toHaveBeenCalledTimes(1)
    expect(setup.api.sendMessage).toHaveBeenCalledWith({
      accessToken: 'access-token-1',
      agentId: '1000002',
      userIds: ['user-1'],
      message: { type: 'text', content: 'Hello from Xpert' }
    })

    await expect(
      invoke(setup.middleware, 'wecom_send_text_message', {
        ...base,
        confirmation_handle: String(first.confirmationHandle),
        confirmed: true
      })
    ).rejects.toThrow('expired')
  })

  it('consumes a confirmation when the message arguments are changed', async () => {
    const setup = createSetup()
    const first = await invoke(setup.middleware, 'wecom_send_markdown_message', {
      to_user_ids: ['user-1'],
      content: '**Original**'
    })

    await expect(
      invoke(setup.middleware, 'wecom_send_markdown_message', {
        to_user_ids: ['user-1'],
        content: '**Changed**',
        confirmation_handle: String(first.confirmationHandle),
        confirmed: true
      })
    ).rejects.toThrow('does not match')
    expect(setup.api.sendMessage).not.toHaveBeenCalled()
  })

  it('binds file confirmation to Workspace Files bytes, then uploads and sends without Base64 output', async () => {
    const setup = createSetup()
    setup.readRuntimeBuffer.mockResolvedValue(workspaceFile('hello'))
    setup.api.uploadFile.mockResolvedValue({ errcode: 0, media_id: 'media-1', type: 'file' })
    setup.api.sendMessage.mockResolvedValue({ errcode: 0, msgid: 'message-file-1' })
    const base = { to_user_ids: ['user-1'], file: { path: '/workspace/report.txt' } }

    const first = await invoke(setup.middleware, 'wecom_send_file_message', base)
    expect(first).toMatchObject({
      status: 'confirmation_required',
      operationSummary: {
        messageType: 'file',
        file: { name: 'report.txt', size: 5, workspacePath: '/workspace/report.txt' }
      }
    })
    expect(setup.api.uploadFile).not.toHaveBeenCalled()

    const second = await invoke(setup.middleware, 'wecom_send_file_message', {
      ...base,
      confirmation_handle: String(first.confirmationHandle),
      confirmed: true
    })
    expect(setup.readRuntimeBuffer).toHaveBeenCalledWith('/workspace/report.txt')
    expect(setup.api.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'report.txt', buffer: Buffer.from('hello') })
    )
    expect(setup.api.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: { type: 'file', mediaId: 'media-1' } })
    )
    expect(JSON.stringify(second)).not.toContain(Buffer.from('hello').toString('base64'))
  })
})

function createSetup() {
  const api = {
    getAgent: jest.fn(),
    listDepartments: jest.fn(),
    getDepartment: jest.fn(),
    listDepartmentMembers: jest.fn(),
    getMember: jest.fn(),
    listTags: jest.fn(),
    getTagMembers: jest.fn(),
    uploadFile: jest.fn(),
    sendMessage: jest.fn(),
    recallMessage: jest.fn()
  }
  const readRuntimeBuffer = jest.fn()
  const connectorRuntime: ConnectorRuntimeApi = {
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
      profile: { userId: 'user-1', openId: 'open-1', unionId: 'union-1', name: 'User One' }
    })
  }
  const context = {
    workspaceId: 'workspace-1',
    runtime: {
      capabilities: new Map<unknown, unknown>([
        [ConnectorRuntimeCapability, connectorRuntime],
        [WorkspaceFilesRuntimeCapability, { readRuntimeBuffer }]
      ])
    }
  } as unknown as IAgentMiddlewareContext
  const strategy = new WeComConnectorRuntimeMiddleware(api as unknown as WeComApiClient, new WeComConfirmationStore())
  return { api, readRuntimeBuffer, middleware: strategy.createMiddleware({}, context) }
}

async function invoke(middleware: AgentMiddleware, name: string, input: Record<string, unknown>) {
  const tool = middleware.tools?.find((item) => item.name === name)
  if (!tool) throw new Error(`Missing tool ${name}`)
  return (await tool.invoke(input)) as Record<string, unknown>
}

function workspaceFile(content: string) {
  const buffer = Buffer.from(content)
  return {
    name: 'report.txt',
    filePath: 'report.txt',
    workspacePath: '/workspace/report.txt',
    mimeType: 'text/plain',
    size: buffer.length,
    catalog: 'xperts',
    buffer,
    reference: {
      source: 'platform.workspace.files',
      filePath: 'report.txt',
      workspacePath: '/workspace/report.txt'
    }
  }
}
