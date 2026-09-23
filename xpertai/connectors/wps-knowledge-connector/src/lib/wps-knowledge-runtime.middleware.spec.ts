import {
  ConnectorRuntimeCapability,
  type AgentMiddleware,
  type ConnectorRuntimeApi,
  type IAgentMiddlewareContext
} from '@xpert-ai/plugin-sdk'
import { WPS_KNOWLEDGE_AUTH_METHOD_ID } from './constants.js'
import { WPS_KNOWLEDGE_ICON } from './branding.js'
import { WpsKnowledgeRuntimeMiddleware } from './wps-knowledge-runtime.middleware.js'
import type { WpsKnowledgeService } from './wps-knowledge.service.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => (target: object) => target,
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

describe('WpsKnowledgeRuntimeMiddleware', () => {
  it('exposes only confirmed read-only SkillHub tools and hides credentials', async () => {
    const setup = createSetup()
    expect(setup.strategy.meta.icon).toEqual(WPS_KNOWLEDGE_ICON)
    expect(setup.middleware.tools?.map((tool) => tool.name)).toEqual([
      'wps_knowledge_get_connection_status',
      'wps_knowledge_list_libraries',
      'wps_knowledge_get_library',
      'wps_knowledge_list_files',
      'wps_knowledge_ask',
      'wps_knowledge_get_share_link'
    ])

    const result = await invoke(setup.middleware, 'wps_knowledge_get_connection_status', {})
    expect(result).toMatchObject({
      status: 'active',
      connectorId: 'connector-1',
      provider: 'wps-knowledge',
      authMethodId: WPS_KNOWLEDGE_AUTH_METHOD_ID,
      profile: { name: 'WPS User' }
    })
    expect(JSON.stringify(result)).not.toContain('kwiki-token')
    expect(JSON.stringify(result)).not.toContain('avatar.png')
  })

  it('passes an exact kuid to the SkillHub file-list service and rejects unknown fields', async () => {
    const setup = createSetup()
    setup.listFiles.mockResolvedValue({ items: [], nextCursor: null })

    await expect(invoke(setup.middleware, 'wps_knowledge_list_files', { kuid: '0s_123' }))
      .resolves.toEqual({ items: [], nextCursor: null })
    expect(setup.listFiles).toHaveBeenCalledWith(
      { credential: { accessToken: 'kwiki-token' }, authMethodId: WPS_KNOWLEDGE_AUTH_METHOD_ID, connectorId: 'connector-1', statusCredential: expect.anything() },
      { kuid: '0s_123', pageSize: 50 }
    )
    await expect(invoke(setup.middleware, 'wps_knowledge_list_files', { kuid: '0s_123', unknown: true })).rejects.toThrow()
  })
})

function createSetup() {
  const listFiles = jest.fn()
  const knowledge = {
    listLibraries: jest.fn(),
    getLibrary: jest.fn(),
    listFiles,
    ask: jest.fn(),
    getShareLink: jest.fn()
  } as unknown as WpsKnowledgeService
  const connectorRuntime: ConnectorRuntimeApi = {
    getConnector: jest.fn(),
    getConnectorCredential: jest.fn().mockResolvedValue({
      connectorId: 'connector-1',
      workspaceId: 'workspace-1',
      provider: 'wps-knowledge',
      authMethodId: WPS_KNOWLEDGE_AUTH_METHOD_ID,
      credentials: { accessToken: 'kwiki-token' },
      expiresAt: null,
      scopes: [],
      profile: { name: 'WPS User', avatarUrl: 'https://wps.example/avatar.png' }
    })
  }
  const strategy = new WpsKnowledgeRuntimeMiddleware(knowledge)
  const middleware = strategy.createMiddleware(
    { connectorId: 'connector-1' },
    runtimeContext(connectorRuntime)
  )
  return { strategy, middleware, listFiles }
}

function runtimeContext(connectorRuntime: ConnectorRuntimeApi): IAgentMiddlewareContext {
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
        get: (capability: unknown) => capability === ConnectorRuntimeCapability ? connectorRuntime : undefined
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
  const value = await requireTool(middleware, name).invoke(input)
  if (typeof value === 'object' && value !== null) return value
  throw new Error(`Tool ${name} returned a non-object value`)
}
