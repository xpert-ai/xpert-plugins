import {
  ConnectorRuntimeCapability,
  type AgentMiddleware,
  type ConnectorRuntimeApi,
  type IAgentMiddlewareContext
} from '@xpert-ai/plugin-sdk'
import { NotionConnectorRuntimeMiddleware } from './notion-connector-runtime.middleware.js'
import { NotionApiClient } from './notion-api.client.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => (target: object) => target,
  ConnectorRuntimeCapability: { id: 'platform.connector' }
}))
jest.mock('@langchain/core/tools', () => ({
  tool: (
    handler: (input: unknown) => Promise<unknown>,
    config: { schema: { parse(value: unknown): unknown }; name: string; description: string }
  ) => ({ ...config, invoke: (input: unknown) => handler(config.schema.parse(input)) })
}))

describe('NotionConnectorRuntimeMiddleware', () => {
  it('exposes bounded read tools and stops recursive traversal at max_blocks', async () => {
    const api = new NotionApiClient()
    jest.spyOn(api, 'retrievePage').mockResolvedValue({ id: 'page-1', type: 'page', properties: {}, title: 'Page' })
    jest.spyOn(api, 'listBlockChildren').mockImplementation(async (_credential, blockId) => ({
      items:
        blockId === 'page-1'
          ? [{ id: 'block-1', type: 'toggle', text: 'Parent', hasChildren: true }]
          : [{ id: 'block-2', type: 'paragraph', text: 'Child', hasChildren: false }],
      hasMore: false
    }))
    const middleware = new NotionConnectorRuntimeMiddleware(api).createMiddleware({}, runtimeContext())
    expect(middleware.tools?.map((tool) => tool.name)).toEqual([
      'notion_search',
      'notion_get_page',
      'notion_read_page',
      'notion_get_data_source',
      'notion_query_data_source'
    ])
    await expect(invoke(middleware, 'notion_search', { unknown: true })).rejects.toThrow()
    const result = await invoke(middleware, 'notion_read_page', { page_id: 'page-1', max_depth: 4, max_blocks: 1 })
    expect(result).toMatchObject({ truncated: true, blocks: [expect.objectContaining({ id: 'block-1' })] })
    expect(JSON.stringify(result)).not.toContain('access-token')
  })

  it('normalizes a once-stringified query filter before calling Notion', async () => {
    const api = new NotionApiClient()
    const query = jest.spyOn(api, 'queryDataSource').mockResolvedValue({ items: [], hasMore: false })
    const middleware = new NotionConnectorRuntimeMiddleware(api).createMiddleware({}, runtimeContext())

    await invoke(middleware, 'notion_query_data_source', {
      data_source_id: 'ds-1',
      filter: JSON.stringify({ type: 'status', property: 'Status', operator: 'equals', value: 'In progress' }),
      page_size: 3
    })

    expect(query).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        filter: { type: 'status', property: 'Status', operator: 'equals', value: 'In progress' }
      })
    )
  })
})

function runtimeContext(): IAgentMiddlewareContext {
  const connectorRuntime: ConnectorRuntimeApi = {
    getConnector: jest.fn(),
    getConnectorCredential: jest.fn().mockResolvedValue({
      connectorId: 'connector-1',
      workspaceId: 'workspace-1',
      provider: 'notion',
      authMethodId: 'notion-public-oauth',
      credentials: { accessToken: 'access-token', tokenType: 'bearer' }
    })
  }
  return {
    tenantId: 'tenant-1',
    organizationId: 'organization-1',
    userId: 'user-1',
    workspaceId: 'workspace-1',
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
  return requireTool(middleware, name).invoke(input)
}
