import {
  ConnectorRuntimeCapability,
  WorkspaceFilesRuntimeCapability,
  type AgentMiddleware,
  type ConnectorRuntimeApi,
  type IAgentMiddlewareContext,
  type WorkspaceFilesApi
} from '@xpert-ai/plugin-sdk'
import { NeteaseMailConfirmationStore } from './confirmation-store.js'
import { NeteaseMailRuntimeMiddleware } from './netease-mail-runtime.middleware.js'
import { NeteaseMailService } from './netease-mail.service.js'

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

describe('NeteaseMailRuntimeMiddleware', () => {
  it('exposes only the bounded NetEase Mail tool surface with strict schemas', async () => {
    const setup = createSetup()
    expect(setup.middleware.tools?.map((item) => item.name)).toEqual([
      'list_netease_mail_folders',
      'search_netease_emails',
      'get_netease_email',
      'download_netease_email_attachment',
      'send_netease_email',
      'reply_netease_email',
      'set_netease_email_flags'
    ])
    await expect(invoke(setup.middleware, 'list_netease_mail_folders', { unknown: true })).rejects.toThrow()
  })

  it('resolves credentials server-side without returning the authorization code', async () => {
    const setup = createSetup()
    setup.listFolders.mockResolvedValue({ items: [], truncated: false })

    const result = await invoke(setup.middleware, 'list_netease_mail_folders', {})

    expect(setup.getConnectorCredential).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      provider: 'netease-mail'
    })
    expect(setup.listFolders).toHaveBeenCalledWith(
      { email: 'user@163.com', authorizationCode: 'server-secret', providerPreset: '163' },
      { limit: 100 }
    )
    expect(JSON.stringify(result)).not.toContain('server-secret')
  })

  it('requires a one-use exact confirmation before external delivery', async () => {
    const setup = createSetup()
    setup.sendEmail.mockResolvedValue({
      operationId: '63bb27ac-8a33-4ca1-baa5-0b309af8215c',
      messageId: '<sent@163.com>',
      deliveryState: 'accepted',
      accepted: ['alice@example.com'],
      rejected: []
    })
    const input = {
      operationId: '63bb27ac-8a33-4ca1-baa5-0b309af8215c',
      to: ['alice@example.com'],
      subject: 'Hello',
      text: 'Body'
    }

    const first = await invoke(setup.middleware, 'send_netease_email', input)
    expect(first).toMatchObject({
      status: 'confirmation_required',
      preview: { from: 'user@163.com', to: ['alice@example.com'], subject: 'Hello' }
    })
    expect(setup.sendEmail).not.toHaveBeenCalled()
    expect(JSON.stringify(first)).not.toContain('server-secret')

    const confirmedInput = {
      ...input,
      confirmation_handle: String(first.confirmationHandle),
      confirmed: true
    }
    const second = await invoke(setup.middleware, 'send_netease_email', confirmedInput)
    expect(second).toMatchObject({ deliveryState: 'accepted', messageId: '<sent@163.com>' })
    expect(setup.sendEmail).toHaveBeenCalledTimes(1)

    await expect(invoke(setup.middleware, 'send_netease_email', confirmedInput)).rejects.toThrow(
      'MAIL_CONFIRMATION_EXPIRED'
    )
    expect(setup.sendEmail).toHaveBeenCalledTimes(1)
  })

  it('consumes and rejects confirmation when external-send arguments change', async () => {
    const setup = createSetup()
    const input = {
      operationId: '63bb27ac-8a33-4ca1-baa5-0b309af8215c',
      to: ['alice@example.com'],
      subject: 'Original',
      text: 'Body'
    }
    const first = await invoke(setup.middleware, 'send_netease_email', input)

    await expect(
      invoke(setup.middleware, 'send_netease_email', {
        ...input,
        subject: 'Changed',
        confirmation_handle: String(first.confirmationHandle),
        confirmed: true
      })
    ).rejects.toThrow('MAIL_CONFIRMATION_INVALID')
    expect(setup.sendEmail).not.toHaveBeenCalled()
  })
})

function createSetup() {
  const service = Object.create(NeteaseMailService.prototype) as NeteaseMailService
  const listFolders = jest.spyOn(service, 'listFolders')
  const sendEmail = jest.spyOn(service, 'sendEmail')
  const getConnectorCredential = jest.fn().mockResolvedValue({
    connectorId: 'netease-connector-1',
    workspaceId: 'workspace-1',
    provider: 'netease-mail',
    authMethodId: 'authorization-code',
    credentials: { email: 'user@163.com', authorizationCode: 'server-secret' }
  })
  const connectorRuntime: ConnectorRuntimeApi = {
    getConnector: jest.fn(),
    getConnectorCredential
  }
  const readRuntimeBuffer = jest.fn<
    ReturnType<WorkspaceFilesApi['readRuntimeBuffer']>,
    Parameters<WorkspaceFilesApi['readRuntimeBuffer']>
  >()
  const writeRuntimeBuffer = jest.fn<
    ReturnType<WorkspaceFilesApi['writeRuntimeBuffer']>,
    Parameters<WorkspaceFilesApi['writeRuntimeBuffer']>
  >()
  const workspaceFiles = { readRuntimeBuffer, writeRuntimeBuffer } as Pick<
    WorkspaceFilesApi,
    'readRuntimeBuffer' | 'writeRuntimeBuffer'
  >
  const middleware = new NeteaseMailRuntimeMiddleware(service, new NeteaseMailConfirmationStore()).createMiddleware(
    {},
    runtimeContext(connectorRuntime, workspaceFiles)
  )
  return { middleware, getConnectorCredential, listFolders, sendEmail }
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
  if (!selected) {
    throw new Error(`Missing tool ${name}`)
  }
  return selected
}

async function invoke(middleware: AgentMiddleware, name: string, input: Record<string, unknown>) {
  const value = await requireTool(middleware, name).invoke(input)
  if (typeof value === 'string') {
    return JSON.parse(value) as Record<string, unknown>
  }
  if (isRecord(value)) {
    return value
  }
  throw new Error(`Tool ${name} returned a non-object value`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
