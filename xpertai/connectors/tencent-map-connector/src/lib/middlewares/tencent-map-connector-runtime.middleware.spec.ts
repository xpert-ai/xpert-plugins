import {
  ConnectorRuntimeCapability,
  type AgentMiddleware,
  type ConnectorRuntimeApi,
  type IAgentMiddlewareContext
} from '@xpert-ai/plugin-sdk'
import { TencentMapWebServiceClient } from '../client/tencent-map-webservice.client.js'
import { TencentMapConnectorRuntimeMiddleware } from './tencent-map-connector-runtime.middleware.js'

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

describe('TencentMapConnectorRuntimeMiddleware', () => {
  it('exposes 16 read-only tools and converts structured coordinates to WebService arguments', async () => {
    const client = Object.create(TencentMapWebServiceClient.prototype) as TencentMapWebServiceClient
    const call = jest.spyOn(client, 'call').mockImplementation(async (input) => {
      if (input.name === 'geocoder') return { status: 0, result: { location: { lat: 39.9, lng: 116.4 } } }
      if (input.name === 'matrix') return { status: 0, result: { rows: [{ elements: [{ distance: 1, duration: 1 }] }] } }
      return { status: 0, result: {} }
    })
    const connectorRuntime: ConnectorRuntimeApi = {
      getConnector: jest.fn(),
      getConnectorCredential: jest.fn().mockResolvedValue({
        connectorId: 'connector-1', workspaceId: 'workspace-1', provider: 'tencent-map', authMethodId: 'api-key',
        credentials: { apiKey: 'ABCDE-FGHIJ-KLMNO-PQRST-UVWXY-12345' }, scopes: ['map.read'], profile: { name: 'Tencent Maps' }
      })
    }
    const middleware = new TencentMapConnectorRuntimeMiddleware(client)
      .createMiddleware({ connectorId: 'connector-1' }, runtimeContext(connectorRuntime))

    expect(middleware.tools?.map((tool) => tool.name)).toEqual([
      'tencent_map_connection_status', 'tencent_map_geocode', 'tencent_map_reverse_geocode',
      'tencent_map_search_places', 'tencent_map_search_nearby', 'tencent_map_get_place',
      'tencent_map_route_driving', 'tencent_map_route_transit', 'tencent_map_route_walking',
      'tencent_map_route_bicycling', 'tencent_map_distance_matrix', 'tencent_map_weather',
      'tencent_map_ip_location', 'tencent_map_search_along_route',
      'tencent_map_route_future_driving', 'tencent_map_optimize_waypoints'
    ])

    const status = await invoke(middleware, 'tencent_map_connection_status', {})
    expect(status).toMatchObject({ status: 'active', connectorId: 'connector-1' })
    expect(JSON.stringify(status)).not.toContain('ABCDE')

    await invoke(middleware, 'tencent_map_geocode', { address: '北京市东城区天安门广场' })
    expect(call).toHaveBeenCalledWith(expect.objectContaining({
      name: 'geocoder',
      arguments: { address: '北京市东城区天安门广场' }
    }))

    await invoke(middleware, 'tencent_map_distance_matrix', {
      origins: [{ lat: 39.9, lng: 116.4 }, { lat: 31.2, lng: 121.5 }],
      destinations: [{ lat: 22.5, lng: 114.1 }],
      mode: 'driving'
    })
    expect(call).toHaveBeenLastCalledWith(expect.objectContaining({
      name: 'matrix',
      arguments: { from: '39.9,116.4;31.2,121.5', to: '22.5,114.1', mode: 'driving' }
    }))

    await invoke(middleware, 'tencent_map_search_nearby', {
      keyword: '咖啡',
      location: { lat: 39.9, lng: 116.4 },
      radiusMeters: 500,
      autoExtend: false,
      page: 2,
      pageSize: 10
    })
    expect(call).toHaveBeenLastCalledWith(expect.objectContaining({
      name: 'placeSearchNearby',
      arguments: {
        keyword: '咖啡',
        location: '39.9,116.4',
        radius: 500,
        auto_extend: false,
        page_index: 2,
        page_size: 10
      }
    }))
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
