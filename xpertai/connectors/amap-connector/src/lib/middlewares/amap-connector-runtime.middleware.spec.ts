import {
  ConnectorRuntimeCapability,
  type AgentMiddleware,
  type ConnectorRuntimeApi,
  type IAgentMiddlewareContext
} from '@xpert-ai/plugin-sdk'
import { AmapWebServiceClient } from '../client/amap-webservice.client.js'
import { AmapConnectorRuntimeMiddleware } from './amap-connector-runtime.middleware.js'

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

describe('AmapConnectorRuntimeMiddleware', () => {
  it('exposes 13 tools and maps semantic inputs to official Web Service arguments', async () => {
    const client = Object.create(AmapWebServiceClient.prototype) as AmapWebServiceClient
    const call = jest.spyOn(client, 'call').mockImplementation(async (input) => {
      if (input.name === 'geocode') {
        return { status: '1', infocode: '10000', count: '1', geocodes: [{ location: '116.397,39.908' }] }
      }
      if (input.name === 'directionDriving') {
        return {
          status: '1', infocode: '10000', route: {
            origin: '116.397,39.908', destination: '116.407,39.918', paths: [{ distance: '1000', steps: [] }]
          }
        }
      }
      return { status: '1', infocode: '10000' }
    })
    const connectorRuntime: ConnectorRuntimeApi = {
      getConnector: jest.fn(),
      getConnectorCredential: jest.fn().mockResolvedValue({
        connectorId: 'connector-1', workspaceId: 'workspace-1', provider: 'amap', authMethodId: 'api-key',
        credentials: { apiKey: 'amap-key-12345678', privateKey: 'private-key-87654321' },
        scopes: ['map.read'], profile: { name: 'AMap' }
      })
    }
    const middleware = new AmapConnectorRuntimeMiddleware(client)
      .createMiddleware({ connectorId: 'connector-1' }, runtimeContext(connectorRuntime))

    expect(middleware.tools?.map((tool) => tool.name)).toEqual([
      'amap_connection_status', 'amap_geocode', 'amap_reverse_geocode', 'amap_search_places',
      'amap_search_nearby', 'amap_get_place', 'amap_route_driving', 'amap_route_transit',
      'amap_route_walking', 'amap_route_bicycling', 'amap_distance', 'amap_weather', 'amap_ip_location'
    ])

    const status = await invoke(middleware, 'amap_connection_status', {})
    expect(status).toMatchObject({ status: 'active', connectorId: 'connector-1', digitalSignatureEnabled: true })
    expect(JSON.stringify(status)).not.toContain('12345678')

    await invoke(middleware, 'amap_geocode', { address: '北京市东城区天安门广场' })
    expect(call).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'amap-key-12345678',
      privateKey: 'private-key-87654321',
      name: 'geocode',
      arguments: { address: '北京市东城区天安门广场' }
    }))

    await invoke(middleware, 'amap_route_driving', {
      origin: { lng: 116.397, lat: 39.908 },
      destination: { lng: 116.407, lat: 39.918 },
      strategy: 'avoid_congestion',
      waypoints: [{ lng: 116.4, lat: 39.91 }],
      alternatives: 2
    })
    expect(call).toHaveBeenLastCalledWith(expect.objectContaining({
      name: 'directionDriving',
      arguments: {
        origin: '116.397,39.908',
        destination: '116.407,39.918',
        strategy: 33,
        waypoints: '116.4,39.91',
        alternative_route: 2
      }
    }))
  })

  it('rejects runtime use without an active workspace', async () => {
    const client = Object.create(AmapWebServiceClient.prototype) as AmapWebServiceClient
    const middleware = new AmapConnectorRuntimeMiddleware(client)
      .createMiddleware({}, { workspaceId: undefined } as IAgentMiddlewareContext)
    await expect(invoke(middleware, 'amap_connection_status', {})).rejects.toMatchObject({ code: 'CONFIGURATION_INVALID' })
  })
})

function runtimeContext(connectorRuntime: ConnectorRuntimeApi): IAgentMiddlewareContext {
  return {
    tenantId: 'tenant-1', organizationId: 'organization-1', userId: 'user-1', workspaceId: 'workspace-1',
    conversationId: 'conversation-1', node: {}, tools: new Map(),
    runtime: { capabilities: { get: (capability: unknown) => capability === ConnectorRuntimeCapability ? connectorRuntime : undefined } }
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
