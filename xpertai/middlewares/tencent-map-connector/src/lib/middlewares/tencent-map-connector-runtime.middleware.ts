import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  AgentMiddlewareStrategy,
  ConnectorRuntimeCapability,
  type AgentMiddleware,
  type ConnectorRuntimeCredentialV2,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { TENCENT_MAP_ICON } from '../branding.js'
import { TencentMapWebServiceClient } from '../client/tencent-map-webservice.client.js'
import type { TencentMapOperation, TencentMapRuntimeCredential } from '../client/types.js'
import {
  TENCENT_MAP_CONNECTOR_PROVIDER,
  TENCENT_MAP_ROUTE_TIMEOUT_MS,
  TENCENT_MAP_RUNTIME_MIDDLEWARE_NAME
} from '../constants.js'
import { TencentMapConnectorError } from '../errors.js'
import {
  mapDistanceMatrix,
  mapGeocode,
  mapIpLocation,
  mapPlaceDetail,
  mapPlaceSearch,
  mapReverseGeocode,
  mapRoute,
  mapWeather
} from '../mappers/tencent-map-mappers.js'
import { defineAgentTool } from '../tools/define-agent-tool.js'
import {
  alongRouteSchema,
  emptySchema,
  formatCoordinate,
  formatCoordinates,
  futureDrivingSchema,
  geocodeSchema,
  ipLocationSchema,
  matrixSchema,
  nearbySearchSchema,
  placeDetailSchema,
  placeSearchSchema,
  reverseGeocodeSchema,
  routeSchema,
  transitRouteSchema,
  waypointOrderSchema,
  weatherSchema
} from '../tools/schemas.js'

type TencentMapRuntimeConfig = { connectorId?: string }
type HiddenAgentMiddlewareMeta = TAgentMiddlewareMeta & { builtin: true }

@Injectable()
@AgentMiddlewareStrategy(TENCENT_MAP_RUNTIME_MIDDLEWARE_NAME)
export class TencentMapConnectorRuntimeMiddleware implements IAgentMiddlewareStrategy<TencentMapRuntimeConfig> {
  readonly meta: HiddenAgentMiddlewareMeta = {
    name: TENCENT_MAP_RUNTIME_MIDDLEWARE_NAME,
    label: { en_US: 'Tencent Maps connector runtime', zh_Hans: '腾讯地图连接器运行时' },
    description: {
      en_US: 'Read-only Tencent Maps geocoding, place, route, matrix, weather, and IP location tools.',
      zh_Hans: '只读腾讯地图地址解析、地点、路线、距离矩阵、天气和 IP 定位工具。'
    },
    icon: TENCENT_MAP_ICON,
    builtin: true,
    configSchema: { type: 'object', properties: {} }
  }

  constructor(private readonly client: TencentMapWebServiceClient) {}

  createMiddleware(options: TencentMapRuntimeConfig, context: IAgentMiddlewareContext): AgentMiddleware {
    const connectorId = readString(options?.connectorId)
    const workspaceId = context.workspaceId
    const connectorRuntime = context.runtime?.capabilities?.get(ConnectorRuntimeCapability)

    const getCredential = async (): Promise<TencentMapRuntimeCredential> => {
      if (!workspaceId) throw configurationError('Tencent Maps requires an active workspace.')
      if (!connectorRuntime?.getConnectorCredential) throw configurationError('Tencent Maps requires connector runtime credential support.')
      const runtime = await connectorRuntime.getConnectorCredential({
        workspaceId,
        provider: TENCENT_MAP_CONNECTOR_PROVIDER,
        ...(connectorId ? { connectorId } : {})
      })
      return runtimeCredentialFrom(runtime)
    }

    const call = async (name: TencentMapOperation, args: Record<string, unknown>, timeoutMs?: number) => {
      const credential = await getCredential()
      return this.client.call({
        apiKey: credential.apiKey,
        name,
        arguments: args,
        ...(timeoutMs ? { timeoutMs } : {})
      })
    }

    const statusTool = defineAgentTool(async () => {
      if (!workspaceId) throw configurationError('Tencent Maps requires an active workspace.')
      if (!connectorRuntime?.getConnectorCredential) throw configurationError('Tencent Maps requires connector runtime credential support.')
      const credential = await connectorRuntime.getConnectorCredential({
        workspaceId,
        provider: TENCENT_MAP_CONNECTOR_PROVIDER,
        ...(connectorId ? { connectorId } : {})
      })
      return connectionStatusDto(credential)
    }, toolFields(
      'tencent_map_connection_status',
      'Check the connected Tencent Maps credential metadata without returning the developer Key.',
      emptySchema,
      'Check Tencent Maps connection',
      '检查腾讯地图连接'
    ))

    const geocodeTool = defineAgentTool(async (input: z.infer<typeof geocodeSchema>) =>
      mapGeocode(await call('geocoder', { address: input.address })), toolFields(
      'tencent_map_geocode',
      'Convert a complete Chinese address or city-qualified place name to a GCJ02 coordinate.',
      geocodeSchema,
      'Geocode address',
      '解析地址坐标'
    ))

    const reverseGeocodeTool = defineAgentTool(async (input: z.infer<typeof reverseGeocodeSchema>) =>
      mapReverseGeocode(await call('reverseGeocoder', { location: formatCoordinate(input.location) })), toolFields(
      'tencent_map_reverse_geocode',
      'Convert a GCJ02 coordinate to a structured address and nearby places.',
      reverseGeocodeSchema,
      'Reverse geocode coordinate',
      '逆地址解析'
    ))

    const placeSearchTool = defineAgentTool(async (input: z.infer<typeof placeSearchSchema>) =>
      mapPlaceSearch(await call('placeSuggestion', {
        keyword: input.keyword,
        ...(input.region ? { region: input.region } : {}),
        page_index: input.page,
        page_size: input.pageSize
      }), { page: input.page, pageSize: input.pageSize }), toolFields(
      'tencent_map_search_places',
      'Search places by keyword and optional Chinese city name. Returns at most 20 allowlisted POI summaries.',
      placeSearchSchema,
      'Search places',
      '搜索地点'
    ))

    const nearbySearchTool = defineAgentTool(async (input: z.infer<typeof nearbySearchSchema>) =>
      mapPlaceSearch(await call('placeSearchNearby', {
        keyword: input.keyword,
        location: formatCoordinate(input.location),
        radius: input.radiusMeters,
        auto_extend: input.autoExtend,
        page_index: input.page,
        page_size: input.pageSize
      }), { page: input.page, pageSize: input.pageSize }), toolFields(
      'tencent_map_search_nearby',
      'Search nearby places around a GCJ02 center coordinate with an explicit radius and bounded pagination.',
      nearbySearchSchema,
      'Search nearby places',
      '搜索附近地点'
    ))

    const placeDetailTool = defineAgentTool(async (input: z.infer<typeof placeDetailSchema>) =>
      mapPlaceDetail(await call('placeDetail', { id: input.id })), toolFields(
      'tencent_map_get_place',
      'Get allowlisted details for an exact Tencent Maps POI ID returned by a place search.',
      placeDetailSchema,
      'Get place details',
      '获取地点详情'
    ))

    const drivingTool = defineAgentTool(async (input: z.infer<typeof routeSchema>) =>
      mapRoute(await call('directionDriving', routeArguments(input), TENCENT_MAP_ROUTE_TIMEOUT_MS), 'driving'), toolFields(
      'tencent_map_route_driving',
      'Plan driving routes between two GCJ02 coordinates, including distance, duration, toll, and concise steps.',
      routeSchema,
      'Plan driving route',
      '规划驾车路线'
    ))

    const transitTool = defineAgentTool(async (input: z.infer<typeof transitRouteSchema>) => {
      const policy = [input.sort_policy ?? 'LEAST_TIME', input.subway_policy].filter(Boolean).join(',')
      return mapRoute(await call('directionTransit', { ...routeArguments(input), policy }, TENCENT_MAP_ROUTE_TIMEOUT_MS), 'transit')
    }, toolFields(
      'tencent_map_route_transit',
      'Plan public transit routes between two GCJ02 coordinates with explicit sorting and subway policies.',
      transitRouteSchema,
      'Plan transit route',
      '规划公交路线'
    ))

    const walkingTool = defineAgentTool(async (input: z.infer<typeof routeSchema>) =>
      mapRoute(await call('directionWalking', routeArguments(input), TENCENT_MAP_ROUTE_TIMEOUT_MS), 'walking'), toolFields(
      'tencent_map_route_walking',
      'Plan walking routes between two GCJ02 coordinates.',
      routeSchema,
      'Plan walking route',
      '规划步行路线'
    ))

    const bicyclingTool = defineAgentTool(async (input: z.infer<typeof routeSchema>) =>
      mapRoute(await call('directionBicycling', routeArguments(input), TENCENT_MAP_ROUTE_TIMEOUT_MS), 'bicycling'), toolFields(
      'tencent_map_route_bicycling',
      'Plan bicycling routes between two GCJ02 coordinates.',
      routeSchema,
      'Plan bicycling route',
      '规划骑行路线'
    ))

    const matrixTool = defineAgentTool(async (input: z.infer<typeof matrixSchema>) =>
      mapDistanceMatrix(await call('matrix', {
        from: formatCoordinates(input.origins),
        to: formatCoordinates(input.destinations),
        mode: input.mode
      }, TENCENT_MAP_ROUTE_TIMEOUT_MS), input.mode), toolFields(
      'tencent_map_distance_matrix',
      'Calculate road distance and duration for up to 100 origin-destination pairs.',
      matrixSchema,
      'Calculate distance matrix',
      '计算距离矩阵'
    ))

    const weatherTool = defineAgentTool(async (input: z.infer<typeof weatherSchema>) =>
      mapWeather(await call('weather', {
        ...(input.adcode ? { adcode: input.adcode } : {}),
        ...(input.location ? { location: formatCoordinate(input.location) } : {}),
        type: input.type
      })), toolFields(
      'tencent_map_weather',
      'Get current or forecast weather using exactly one six-digit adcode or GCJ02 coordinate.',
      weatherSchema,
      'Get weather',
      '查询天气'
    ))

    const ipLocationTool = defineAgentTool(async (input: z.infer<typeof ipLocationSchema>) =>
      mapIpLocation(await call('ipLocation', { ip: input.ip })), toolFields(
      'tencent_map_ip_location',
      'Locate an explicit public IPv4 or IPv6 address to province, city, district, and GCJ02 coordinate.',
      ipLocationSchema,
      'Locate IP address',
      '查询 IP 位置'
    ))

    const alongRouteTool = defineAgentTool(async (input: z.infer<typeof alongRouteSchema>) =>
      mapPlaceSearch(await call('placeAlongby', {
        ...routeArguments(input),
        keyword: input.keyword
      })), toolFields(
      'tencent_map_search_along_route',
      'Plan one driving route and search places along it. This advanced operation consumes two Tencent Maps requests.',
      alongRouteSchema,
      'Search along route',
      '搜索沿途地点'
    ))

    const futureDrivingTool = defineAgentTool(async (input: z.infer<typeof futureDrivingSchema>) =>
      mapRoute(await call('futureDrivingDirection', {
        ...routeArguments(input),
        departure_time: String(requireInteger(input.departure_time, 'departure_time'))
      }, TENCENT_MAP_ROUTE_TIMEOUT_MS), 'future_driving'), toolFields(
      'tencent_map_route_future_driving',
      'Plan a driving route for a Unix departure time from now through the next seven days.',
      futureDrivingSchema,
      'Plan future driving route',
      '规划未来驾车路线'
    ))

    const waypointOrderTool = defineAgentTool(async (input: z.infer<typeof waypointOrderSchema>) =>
      mapRoute(await call('waypointOrder', {
        ...routeArguments(input),
        waypoints: formatCoordinates(input.waypoints)
      }, TENCENT_MAP_ROUTE_TIMEOUT_MS), 'waypoint_driving'), toolFields(
      'tencent_map_optimize_waypoints',
      'Order 1-16 GCJ02 waypoints for an efficient driving route and return the route plus waypoint order.',
      waypointOrderSchema,
      'Optimize waypoint order',
      '优化途经点顺序'
    ))

    return {
      name: TENCENT_MAP_RUNTIME_MIDDLEWARE_NAME,
      tools: [
        statusTool,
        geocodeTool,
        reverseGeocodeTool,
        placeSearchTool,
        nearbySearchTool,
        placeDetailTool,
        drivingTool,
        transitTool,
        walkingTool,
        bicyclingTool,
        matrixTool,
        weatherTool,
        ipLocationTool,
        alongRouteTool,
        futureDrivingTool,
        waypointOrderTool
      ]
    }
  }
}

function toolFields(name: string, description: string, schema: z.ZodTypeAny, en_US: string, zh_Hans: string) {
  return {
    name,
    description,
    schema,
    verboseParsingErrors: true,
    metadata: { toolName: { en_US, zh_Hans } }
  }
}

function routeArguments(input: { from?: { lat?: number; lng?: number }; to?: { lat?: number; lng?: number } }) {
  return { from: formatCoordinate(input.from), to: formatCoordinate(input.to) }
}

function runtimeCredentialFrom(credential: ConnectorRuntimeCredentialV2): TencentMapRuntimeCredential {
  const apiKey = readString(credential.credentials.apiKey)
  if (!apiKey) throw configurationError('Tencent Maps runtime credential is incomplete.')
  return { apiKey }
}

function connectionStatusDto(credential: ConnectorRuntimeCredentialV2) {
  return {
    status: 'active' as const,
    connectorId: credential.connectorId,
    provider: credential.provider,
    authMethodId: credential.authMethodId,
    scopes: credential.scopes ?? [],
    profile: credential.profile ? { name: readString(credential.profile.name) ?? null } : null
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function requireInteger(value: unknown, field: string): number {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  throw configurationError(`${field} must be an integer.`)
}

function configurationError(message: string): TencentMapConnectorError {
  return new TencentMapConnectorError('CONFIGURATION_INVALID', message)
}
