import type { AgentMiddleware, ConnectorRuntimeApi, IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { ConnectorRuntimeCapability } from '@xpert-ai/plugin-sdk'
import { CTRIP_WENDAO_ICON } from './branding.js'
import { CTRIP_WENDAO_MAX_QUERY_LENGTH } from './constants.js'
import { CtripWendaoClient } from './ctrip-wendao.client.js'
import { CtripWendaoRuntimeMiddleware } from './ctrip-wendao-runtime.middleware.js'

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

describe('CtripWendaoRuntimeMiddleware', () => {
  it('exposes only the read-only travel query tool with a strict schema', async () => {
    const setup = createSetup()
    expect(setup.runtime.meta.icon).toBe(CTRIP_WENDAO_ICON)
    expect(setup.middleware.tools?.map((tool) => tool.name)).toEqual(['query_ctrip_wendao'])
    expect(setup.middleware.tools?.[0]).toMatchObject({
      metadata: { toolName: { en_US: 'Query Ctrip Wendao', zh_Hans: '查询携程问道' } }
    })
    await expect(invoke(setup.middleware, { query: 'Shanghai', unknown: true })).rejects.toThrow()
  })

  it('describes the supported travel scenes and connector-only fallback boundary', () => {
    const description = createSetup().middleware.tools?.[0]?.description

    expect(description).toEqual(expect.stringContaining('hotel searches'))
    expect(description).toEqual(expect.stringContaining('flight searches'))
    expect(description).toEqual(expect.stringContaining('attraction recommendations'))
    expect(description).toEqual(expect.stringContaining('visa information'))
    expect(description).toEqual(
      expect.stringContaining('instead of answering the same travel request from general knowledge')
    )
    expect(description).toEqual(expect.stringContaining('Do not send personal or sensitive data'))
  })

  it('accepts a query at the maximum supported length', async () => {
    const setup = createSetup()
    const query = 'x'.repeat(CTRIP_WENDAO_MAX_QUERY_LENGTH)
    setup.query.mockResolvedValue({ content: 'Travel result', format: 'markdown' })

    await expect(invoke(setup.middleware, { query })).resolves.toEqual({
      content: 'Travel result',
      format: 'markdown'
    })
    expect(setup.query).toHaveBeenCalledWith('server-secret', query)
  })

  it('resolves the token server-side and never returns it from the tool', async () => {
    const setup = createSetup()
    setup.query.mockResolvedValue({ content: 'Travel result', format: 'markdown' })

    const result = await invoke(setup.middleware, { query: ' Shanghai itinerary ' })

    expect(setup.getConnectorCredential).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      provider: 'ctrip-wendao'
    })
    expect(setup.query).toHaveBeenCalledWith('server-secret', 'Shanghai itinerary')
    expect(result).toEqual({ content: 'Travel result', format: 'markdown' })
    expect(JSON.stringify(result)).not.toContain('server-secret')
  })

  it('passes an explicitly selected connector ID to the platform runtime', async () => {
    const setup = createSetup('connector-selected')
    setup.query.mockResolvedValue({ content: 'Travel result', format: 'markdown' })

    await invoke(setup.middleware, { query: 'Shanghai' })

    expect(setup.getConnectorCredential).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      provider: 'ctrip-wendao',
      connectorId: 'connector-selected'
    })
  })
})

function createSetup(connectorId?: string) {
  const client = new CtripWendaoClient()
  const query = jest.spyOn(client, 'query')
  const getConnectorCredential = jest.fn().mockResolvedValue({
    connectorId: 'ctrip-connector-1',
    workspaceId: 'workspace-1',
    provider: 'ctrip-wendao',
    authMethodId: 'api-token',
    credentials: { apiToken: 'server-secret' }
  })
  const connectorRuntime: ConnectorRuntimeApi = { getConnector: jest.fn(), getConnectorCredential }
  const runtime = new CtripWendaoRuntimeMiddleware(client)
  const middleware = runtime.createMiddleware(connectorId ? { connectorId } : {}, runtimeContext(connectorRuntime))
  return { runtime, middleware, getConnectorCredential, query }
}

function runtimeContext(connectorRuntime: ConnectorRuntimeApi): IAgentMiddlewareContext {
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

async function invoke(middleware: AgentMiddleware, input: Record<string, unknown>): Promise<unknown> {
  const tool = middleware.tools?.find((item) => item.name === 'query_ctrip_wendao')
  if (!tool) throw new Error('Missing query_ctrip_wendao')
  return tool.invoke(input)
}
