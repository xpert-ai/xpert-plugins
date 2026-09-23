import {
  ConnectorRuntimeCapability,
  type AgentMiddleware,
  type ConnectorRuntimeApi,
  type IAgentMiddlewareContext
} from '@xpert-ai/plugin-sdk'
import { ZsxqConnectorRuntimeMiddleware } from './zsxq-connector-runtime.middleware.js'
import type { ZsxqCliService } from '../cli/zsxq-cli.service.js'
import { ZsxqConfirmationStore } from '../tools/confirmation-store.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => (target: object) => target,
  ConnectorRuntimeCapability: { id: 'platform.connector' },
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' }
}))
jest.mock('@langchain/core/tools', () => ({
  tool: (
    handler: (input: unknown) => Promise<unknown>,
    config: object & { schema: { parse(value: unknown): unknown } }
  ) => ({
    ...config,
    invoke: (input: unknown) => handler(config.schema.parse(input))
  })
}))

describe('ZsxqConnectorRuntimeMiddleware', () => {
  it('exposes bounded read tools and keeps writes absent by default', async () => {
    const cli = Object.create(null) as ZsxqCliService
    cli.runJson = jest.fn().mockResolvedValue({ user: { user_id: '42', name: 'Alice' }, groups: [] })
    const runtime = connectorRuntime()
    const middleware = new ZsxqConnectorRuntimeMiddleware(cli, new ZsxqConfirmationStore(), {
      enableWrites: false
    }).createMiddleware({}, runtime)
    expect(middleware.tools?.map((tool) => tool.name)).toEqual([
      'zsxq_connection_status',
      'zsxq_get_account',
      'zsxq_list_groups',
      'zsxq_search_groups',
      'zsxq_search_group_members',
      'zsxq_list_group_topics',
      'zsxq_search_topics',
      'zsxq_get_topic',
      'zsxq_list_topic_comments',
      'zsxq_list_group_hashtags',
      'zsxq_list_scheduled_topics',
      'zsxq_list_notes',
      'zsxq_get_note',
      'zsxq_list_user_footprints'
    ])
    expect(middleware.tools?.some((tool) => tool.name === 'zsxq_create_topic')).toBe(false)
    await expect(invoke(middleware, 'zsxq_get_account', {})).resolves.toEqual({ id: '42', name: 'Alice' })
    expect(cli.runJson).toHaveBeenCalledWith('opaque-handle', ['user', '+info', '--json'], { retryRead: true })
  })

  it('returns a preview before any write command and requires connector identity', async () => {
    const cli = Object.create(null) as ZsxqCliService
    cli.runJson = jest.fn()
    const middleware = new ZsxqConnectorRuntimeMiddleware(cli, new ZsxqConfirmationStore(), {
      enableWrites: true
    }).createMiddleware({}, connectorRuntime(['zsxq.read', 'zsxq.write']))
    const preview = await invoke(middleware, 'zsxq_create_comment', { topicId: '12', text: 'publish this' })
    expect(preview).toMatchObject({ status: 'confirmation_required', operation: 'create_comment' })
    expect(cli.runJson).not.toHaveBeenCalled()
  })

  it('does not expose a write path when the runtime credential lacks write scope', async () => {
    const cli = Object.create(null) as ZsxqCliService
    cli.runJson = jest.fn()
    const middleware = new ZsxqConnectorRuntimeMiddleware(cli, new ZsxqConfirmationStore(), {
      enableWrites: true
    }).createMiddleware({}, connectorRuntime(['zsxq.read']))
    await expect(invoke(middleware, 'zsxq_create_comment', { topicId: '12', text: 'blocked' })).rejects.toMatchObject({
      code: 'PERMISSION_DENIED'
    })
    expect(cli.runJson).not.toHaveBeenCalled()
  })
})

function connectorRuntime(scopes = ['zsxq.read']): IAgentMiddlewareContext {
  const connectorRuntime: ConnectorRuntimeApi = {
    getConnector: jest.fn(),
    getConnectorCredential: jest.fn().mockResolvedValue({
      connectorId: 'connector-1',
      workspaceId: 'workspace-1',
      provider: 'zsxq',
      authMethodId: 'device-oauth-cli',
      credentials: { connectionHandle: 'opaque-handle', transport: 'cli' },
      scopes,
      profile: { name: 'Alice' }
    })
  }
  return {
    tenantId: 'tenant-1',
    organizationId: 'organization-1',
    userId: 'user-1',
    workspaceId: 'workspace-1',
    conversationId: 'conversation-1',
    node: {},
    tools: new Map(),
    runtime: {
      capabilities: {
        get: (capability: unknown) => (capability === ConnectorRuntimeCapability ? connectorRuntime : undefined)
      }
    }
  } as unknown as IAgentMiddlewareContext
}

function requireTool(middleware: AgentMiddleware, name: string) {
  const selected = middleware.tools?.find((tool) => tool.name === name)
  if (!selected) throw new Error(`Missing tool ${name}`)
  return selected
}

async function invoke(middleware: AgentMiddleware, name: string, input: Record<string, unknown>) {
  return requireTool(middleware, name).invoke(input) as Promise<Record<string, unknown>>
}
