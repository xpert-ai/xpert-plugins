import { createHash } from 'node:crypto'
import {
  ConnectorRuntimeCapability,
  WorkspaceFilesRuntimeCapability,
  type AgentMiddleware,
  type ConnectorRuntimeApi,
  type IAgentMiddlewareContext,
  type WorkspaceFilesApi
} from '@xpert-ai/plugin-sdk'
import { QqMailMcpClient, QqMailMcpToolError } from '../mcp/qq-mail-mcp.client.js'
import type { QqMailAccount } from '../mcp/types.js'
import { QqMailProtocolService } from '../protocol/qq-mail-protocol.service.js'
import { QqMailConfirmationStore } from '../tools/confirmation-store.js'
import { QqMailConnectorRuntimeMiddleware } from './qq-mail-connector-runtime.middleware.js'

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

describe('QqMailConnectorRuntimeMiddleware', () => {
  const account = {
    scopes: ['alias:read', 'mail:read', 'mail:send'],
    aliases: [{ aliasId: 'alias-primary', email: 'user@qq.com', name: 'User', isPrimary: true }],
    rateLimits: { requestsPerMinute: 10 },
    constraints: {
      maxAttachmentSizeBytes: 1024,
      maxTotalAttachmentsSizeBytes: 2048,
      maxAttachmentCount: 3
    }
  }

  it('exposes only the bounded QQ Mail tool surface with strict schemas', async () => {
    const setup = createSetup(account)
    expect(setup.middleware.tools?.map((item) => item.name)).toEqual([
      'qq_mail_get_account',
      'qq_mail_list_messages',
      'qq_mail_get_message',
      'qq_mail_search_messages',
      'qq_mail_list_attachments',
      'qq_mail_download_attachment',
      'qq_mail_send_message',
      'qq_mail_reply_message',
      'qq_mail_forward_message'
    ])
    await expect(invoke(setup.middleware, 'qq_mail_list_messages', { unknown: true })).rejects.toThrow()
  })

  it('resolves the primary alias server-side and allowlists message summaries', async () => {
    const setup = createSetup(account)
    setup.callTool.mockResolvedValue({
      account,
      payload: {
        data: {
          messages: [{ message_id: 'msg-1', subject: 'Hello', from: { email: 'sender@example.com' }, secret: 'drop' }],
          next_cursor: 'next',
          internal: 'drop'
        }
      }
    })

    const result = await invoke(setup.middleware, 'qq_mail_list_messages', {})

    expect(setup.callTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ListMessages',
        arguments: expect.objectContaining({ alias_id: 'alias-primary', dir: 'inbox', limit: 10 })
      })
    )
    expect(result).toMatchObject({ items: [{ messageId: 'msg-1', subject: 'Hello' }], nextCursor: 'next' })
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('keeps provider confirmation tokens private and executes an identical confirmed operation once', async () => {
    const setup = createSetup(account)
    setup.callTool
      .mockRejectedValueOnce(
        new QqMailMcpToolError(
          {
            code: 42801,
            message: 'confirmation required',
            details: {
              confirmation_token: 'ctk-provider-secret',
              expires_at: '2099-01-01T00:00:00Z',
              operation_summary: {
                from: 'user@qq.com',
                to: ['alice@example.com'],
                subject: 'Hello',
                attachment_count: 0
              }
            }
          },
          {}
        )
      )
      .mockResolvedValueOnce({ account, payload: { data: { message_id: 'msg-sent' } } })

    const first = await invoke(setup.middleware, 'qq_mail_send_message', {
      to: [{ email: 'alice@example.com' }],
      subject: 'Hello',
      body: 'Body'
    })
    expect(first).toMatchObject({
      status: 'confirmation_required',
      errorCode: 'CONFIRMATION_REQUIRED',
      operationSummary: { from: 'user@qq.com', to: ['alice@example.com'], subject: 'Hello' }
    })
    expect(JSON.stringify(first)).not.toContain('ctk-provider-secret')

    const second = await invoke(setup.middleware, 'qq_mail_send_message', {
      to: [{ email: 'alice@example.com' }],
      subject: 'Hello',
      body: 'Body',
      confirmation_handle: String(first.confirmationHandle),
      confirmed: true
    })
    expect(second).toEqual({
      status: 'completed',
      operation: 'send',
      messageId: 'msg-sent',
      threadId: undefined,
      movedTo: undefined
    })
    expect(setup.callTool).toHaveBeenLastCalledWith(
      expect.objectContaining({
        arguments: expect.objectContaining({ confirmation_token: 'ctk-provider-secret' })
      })
    )

    await expect(
      invoke(setup.middleware, 'qq_mail_send_message', {
        to: [{ email: 'alice@example.com' }],
        subject: 'Hello',
        body: 'Body',
        confirmation_handle: String(first.confirmationHandle),
        confirmed: true
      })
    ).rejects.toThrow('expired')
  })

  it('reads outgoing attachment bytes from Workspace Files and sends Base64 only to QQ Mail', async () => {
    const setup = createSetup(account)
    setup.readRuntimeBuffer.mockResolvedValue({
      name: 'report.txt',
      filePath: 'report.txt',
      workspacePath: '/workspace/report.txt',
      mimeType: 'text/plain',
      size: 5,
      catalog: 'xperts',
      buffer: Buffer.from('hello'),
      reference: {
        source: 'platform.workspace.files',
        filePath: 'report.txt',
        workspacePath: '/workspace/report.txt'
      }
    })
    setup.callTool.mockRejectedValue(
      new QqMailMcpToolError(
        {
          code: 42801,
          message: 'confirmation required',
          details: { confirmation_token: 'ctk', operation_summary: { attachment_count: 1 } }
        },
        {}
      )
    )

    const result = await invoke(setup.middleware, 'qq_mail_send_message', {
      to: [{ email: 'alice@example.com' }],
      subject: 'Attachment',
      body: 'See attachment',
      attachments: [{ path: '/workspace/report.txt' }]
    })

    expect(setup.readRuntimeBuffer).toHaveBeenCalledWith('/workspace/report.txt')
    expect(setup.callTool).toHaveBeenCalledWith(
      expect.objectContaining({
        arguments: expect.objectContaining({
          attachments: [
            {
              filename: 'report.txt',
              content_type: 'text/plain',
              content: Buffer.from('hello').toString('base64'),
              size: 5,
              sha1: createSha1('hello')
            }
          ]
        })
      })
    )
    expect(JSON.stringify(result)).not.toContain(Buffer.from('hello').toString('base64'))
  })

  it('decodes a downloaded attachment into Workspace Files and returns no Base64', async () => {
    const setup = createSetup(account)
    const bytes = Buffer.from('downloaded')
    setup.callTool.mockResolvedValue({
      account,
      payload: {
        data: {
          attachment_id: 'att-1',
          filename: 'download.txt',
          content_type: 'text/plain',
          size: bytes.length,
          content: bytes.toString('base64'),
          sha1: createSha1('downloaded')
        }
      }
    })
    setup.writeRuntimeBuffer.mockResolvedValue({
      name: 'download.txt',
      filePath: 'downloads/qq-mail/download.txt',
      workspacePath: '/workspace/downloads/qq-mail/download.txt',
      mimeType: 'text/plain',
      size: bytes.length,
      catalog: 'xperts',
      reference: {
        source: 'platform.workspace.files',
        filePath: 'downloads/qq-mail/download.txt',
        workspacePath: '/workspace/downloads/qq-mail/download.txt'
      }
    })

    const result = await invoke(setup.middleware, 'qq_mail_download_attachment', {
      message_id: 'msg-1',
      attachment_id: 'att-1'
    })

    expect(setup.writeRuntimeBuffer).toHaveBeenCalledWith(
      expect.objectContaining({ buffer: bytes, mimeType: 'text/plain' })
    )
    expect(result).toMatchObject({ status: 'downloaded', fileName: 'download.txt', size: bytes.length })
    expect(JSON.stringify(result)).not.toContain(bytes.toString('base64'))
  })

  it('routes the same tools through IMAP/SMTP and confirms SMTP delivery locally', async () => {
    const setup = createProtocolSetup()

    const page = await invoke(setup.middleware, 'qq_mail_list_messages', {})
    expect(page).toMatchObject({ items: [{ messageId: 'message-ref-1', subject: 'IMAP message' }] })
    expect(setup.searchEmails).toHaveBeenCalledWith(
      { email: '123456@qq.com', authorizationCode: 'abcd1234efgh5678' },
      expect.objectContaining({ folder: 'INBOX', limit: 10 })
    )

    const first = await invoke(setup.middleware, 'qq_mail_send_message', {
      to: [{ email: 'alice@example.com' }],
      subject: 'SMTP message',
      body: 'Hello'
    })
    expect(first).toMatchObject({
      status: 'confirmation_required',
      operationSummary: { from: '123456@qq.com', to: ['alice@example.com'], subject: 'SMTP message' }
    })
    expect(setup.sendEmail).not.toHaveBeenCalled()

    const second = await invoke(setup.middleware, 'qq_mail_send_message', {
      to: [{ email: 'alice@example.com' }],
      subject: 'SMTP message',
      body: 'Hello',
      confirmation_handle: first.confirmationHandle,
      confirmed: true
    })
    expect(second).toMatchObject({ status: 'completed', deliveryState: 'accepted', messageId: '<sent@qq.com>' })
    expect(setup.sendEmail).toHaveBeenCalledTimes(1)
  })
})

function createSetup(account: QqMailAccount) {
  const mcp = new QqMailMcpClient()
  const getAccount = jest.spyOn(mcp, 'getAccount').mockResolvedValue(account)
  const callTool = jest.spyOn(mcp, 'callTool')
  const readRuntimeBuffer = jest.fn<
    ReturnType<WorkspaceFilesApi['readRuntimeBuffer']>,
    Parameters<WorkspaceFilesApi['readRuntimeBuffer']>
  >()
  const writeRuntimeBuffer = jest.fn<
    ReturnType<WorkspaceFilesApi['writeRuntimeBuffer']>,
    Parameters<WorkspaceFilesApi['writeRuntimeBuffer']>
  >()
  const connectorRuntime: ConnectorRuntimeApi = {
    getConnector: jest.fn(),
    getConnectorCredential: jest.fn().mockResolvedValue({
      connectorId: 'qq-connector-1',
      workspaceId: 'workspace-1',
      provider: 'qq-mail',
      authMethodId: 'oauth2-pkce',
      credentials: { accessToken: 'access-token', tokenType: 'Bearer', resource: 'https://api.mail.qq.com' }
    })
  }
  const workspaceFiles = { readRuntimeBuffer, writeRuntimeBuffer } as Pick<
    WorkspaceFilesApi,
    'readRuntimeBuffer' | 'writeRuntimeBuffer'
  >
  const context = runtimeContext(connectorRuntime, workspaceFiles)
  const middleware = new QqMailConnectorRuntimeMiddleware(
    mcp,
    new QqMailConfirmationStore(),
    {} as QqMailProtocolService
  ).createMiddleware({}, context)
  return { middleware, getAccount, callTool, readRuntimeBuffer, writeRuntimeBuffer }
}

function createProtocolSetup() {
  const mcp = new QqMailMcpClient()
  const searchEmails = jest.fn().mockResolvedValue({
    folder: 'INBOX',
    items: [
      {
        messageRef: 'message-ref-1',
        uid: 1,
        subject: 'IMAP message',
        from: [{ address: 'sender@example.com' }],
        to: [{ address: '123456@qq.com' }],
        receivedAt: '2026-08-25T00:00:00.000Z',
        read: false,
        starred: false,
        hasAttachments: false
      }
    ],
    hasMore: false
  })
  const sendEmail = jest.fn().mockResolvedValue({
    operationId: 'operation-1',
    messageId: '<sent@qq.com>',
    deliveryState: 'accepted',
    accepted: ['alice@example.com'],
    rejected: []
  })
  const protocol = {
    searchEmails,
    sendEmail,
    listFolders: jest.fn(),
    getEmail: jest.fn(),
    downloadAttachment: jest.fn()
  } as unknown as QqMailProtocolService
  const connectorRuntime: ConnectorRuntimeApi = {
    getConnector: jest.fn(),
    getConnectorCredential: jest.fn().mockResolvedValue({
      connectorId: 'qq-protocol-1',
      workspaceId: 'workspace-1',
      provider: 'qq-mail',
      authMethodId: 'imap-smtp-authorization-code',
      credentials: {
        protocol: 'imap-smtp',
        integrationId: 'integration-1',
        email: '123456@qq.com',
        authorizationCode: 'abcd1234efgh5678'
      }
    })
  }
  const workspaceFiles = {
    readRuntimeBuffer: jest.fn(),
    writeRuntimeBuffer: jest.fn()
  } as unknown as WorkspaceFilesApi
  const middleware = new QqMailConnectorRuntimeMiddleware(
    mcp,
    new QqMailConfirmationStore(),
    protocol
  ).createMiddleware({}, runtimeContext(connectorRuntime, workspaceFiles))
  return { middleware, searchEmails, sendEmail }
}

function runtimeContext(
  connectorRuntime: ConnectorRuntimeApi,
  workspaceFiles: Pick<WorkspaceFilesApi, 'readRuntimeBuffer' | 'writeRuntimeBuffer'>
) {
  return {
    tenantId: 'tenant-1',
    organizationId: 'organization-1',
    userId: 'user-1',
    workspaceId: 'workspace-1',
    node: {},
    tools: new Map(),
    runtime: {
      capabilities: {
        get: (capability: unknown) =>
          capability === ConnectorRuntimeCapability
            ? connectorRuntime
            : capability === WorkspaceFilesRuntimeCapability
            ? workspaceFiles
            : undefined
      }
    }
  } as unknown as IAgentMiddlewareContext
}

function requireTool(middleware: AgentMiddleware, name: string) {
  const selected = middleware.tools?.find((item) => item.name === name)
  if (!selected) throw new Error(`Missing tool ${name}`)
  return selected
}

async function invoke(middleware: AgentMiddleware, name: string, input: Record<string, unknown>) {
  const value = await requireTool(middleware, name).invoke(input)
  if (typeof value === 'string') return JSON.parse(value) as Record<string, unknown>
  if (isRecord(value)) return value
  throw new Error(`Tool ${name} returned a non-object value`)
}

function createSha1(value: string) {
  return createHash('sha1').update(value).digest('hex')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
