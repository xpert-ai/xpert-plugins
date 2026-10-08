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
import { AMAP_ICON } from '../branding.js'
import { AmapWebServiceClient } from '../client/amap-webservice.client.js'
import type { AmapOperation, AmapRuntimeCredential } from '../client/types.js'
import {
  AMAP_CONNECTOR_PROVIDER,
  AMAP_ROUTE_TIMEOUT_MS,
  AMAP_RUNTIME_MIDDLEWARE_NAME
} from '../constants.js'
import { AmapConnectorError } from '../errors.js'
import {
  mapDistance,
  mapGeocode,
  mapIpLocation,
  mapPlaceDetail,
  mapPlaceSearch,
  mapReverseGeocode,
  mapRoute,
  mapTransitRoute,
  mapWeather
} from '../mappers/amap-mappers.js'
import { defineAgentTool } from '../tools/define-agent-tool.js'
import {
  bicyclingRouteSchema,
  distanceSchema,
  drivingRouteSchema,
  emptySchema,
  formatCoordinate,
  formatCoordinates,
  geocodeSchema,
  ipLocationSchema,
  nearbySearchSchema,
  placeDetailSchema,
  placeSearchSchema,
  reverseGeocodeSchema,
  transitRouteSchema,
  walkingRouteSchema,
  weatherSchema
} from '../tools/schemas.js'

type AmapRuntimeConfig = { connectorId?: string }
type HiddenAgentMiddlewareMeta = TAgentMiddlewareMeta & { builtin: true }

const DRIVING_STRATEGY = {
  recommended: 32,
  avoid_congestion: 33,
  highway_first: 34,
  avoid_highway: 35,
  avoid_tolls: 36,
  main_roads: 37,
  fastest: 38,
  avoid_congestion_highway_first: 39,
  avoid_congestion_avoid_highway: 40,
  avoid_congestion_avoid_tolls: 41,
  avoid_tolls_avoid_highway: 42,
  avoid_congestion_avoid_tolls_avoid_highway: 43,
  avoid_congestion_main_roads: 44,
  avoid_congestion_fastest: 45
} as const

const TRANSIT_STRATEGY = {
  recommended: 0,
  least_cost: 1,
  least_transfer: 2,
  least_walking: 3,
  most_comfortable: 4,
  no_subway: 5,
  subway_map: 6,
  subway_first: 7,
  least_time: 8
} as const

const DISTANCE_MODE = { straight_line: 0, driving: 1, walking: 3 } as const

@Injectable()
@AgentMiddlewareStrategy(AMAP_RUNTIME_MIDDLEWARE_NAME)
export class AmapConnectorRuntimeMiddleware implements IAgentMiddlewareStrategy<AmapRuntimeConfig> {
  readonly meta: HiddenAgentMiddlewareMeta = {
    name: AMAP_RUNTIME_MIDDLEWARE_NAME,
    label: { en_US: 'AMap connector runtime', zh_Hans: '高德地图连接器运行时' },
    description: {
      en_US: 'Read-only AMap geocoding, place, route, distance, weather, and IP location tools.',
      zh_Hans: '只读高德地图地址解析、地点、路线、距离、天气和 IP 定位工具。'
    },
    icon: AMAP_ICON,
    builtin: true,
    configSchema: { type: 'object', properties: {} }
  }

  constructor(private readonly client: AmapWebServiceClient) {}

  createMiddleware(options: AmapRuntimeConfig, context: IAgentMiddlewareContext): AgentMiddleware {
    const connectorId = readString(options?.connectorId)
    const workspaceId = context.workspaceId
    const connectorRuntime = context.runtime?.capabilities?.get(ConnectorRuntimeCapability)

    const resolveCredential = async (): Promise<AmapRuntimeCredential> => {
      if (!workspaceId) throw configurationError('AMap requires an active workspace.')
      if (!connectorRuntime?.getConnectorCredential) throw configurationError('AMap requires connector runtime credential support.')
      const runtime = await connectorRuntime.getConnectorCredential({
        workspaceId,
        provider: AMAP_CONNECTOR_PROVIDER,
        ...(connectorId ? { connectorId } : {})
      })
      return runtimeCredentialFrom(runtime)
    }

    const call = async (name: AmapOperation, args: Record<string, unknown>, timeoutMs?: number) => {
      const credential = await resolveCredential()
      return this.client.call({
        ...credential,
        name,
        arguments: args,
        ...(timeoutMs ? { timeoutMs } : {})
      })
    }

    const statusTool = defineAgentTool(async () => {
      if (!workspaceId) throw configurationError('AMap requires an active workspace.')
      if (!connectorRuntime?.getConnectorCredential) throw configurationError('AMap requires connector runtime credential support.')
      const credential = await connectorRuntime.getConnectorCredential({
        workspaceId,
        provider: AMAP_CONNECTOR_PROVIDER,
        ...(connectorId ? { connectorId } : {})
      })
      return connectionStatusDto(credential)
    }, toolFields(
      'amap_connection_status',
      'Check connected AMap credential metadata without returning the Key or digital signature private key.',
      emptySchema,
      'Check AMap connection',
      '检查高德地图连接'
    ))

    const geocodeTool = defineAgentTool(async (input: z.infer<typeof geocodeSchema>) =>
      mapGeocode(await call('geocode', {
        address: input.address,
        ...(input.city ? { city: input.city } : {})
      })), toolFields(
      'amap_geocode',
      'Convert a complete Chinese address or city-qualified place name to GCJ02 coordinates.',
      geocodeSchema,
      'Geocode address',
      '解析地址坐标'
    ))

    const reverseGeocodeTool = defineAgentTool(async (input: z.infer<typeof reverseGeocodeSchema>) =>
      mapReverseGeocode(await call('reverseGeocode', {
        location: formatCoordinate(input.location),
        radius: input.radiusMeters ?? 1000,
        ...(input.poiTypes?.length ? { poitype: input.poiTypes.join('|') } : {})
      }), requiredCoordinate(input.location)), toolFields(
      'amap_reverse_geocode',
      'Convert a GCJ02 coordinate to a structured address and bounded nearby POI summaries.',
      reverseGeocodeSchema,
      'Reverse geocode coordinate',
      '逆地址解析'
    ))

    const placeSearchTool = defineAgentTool(async (input: z.infer<typeof placeSearchSchema>) =>
      mapPlaceSearch(await call('placeText', placeArguments(input)), pageContext(input)), toolFields(
      'amap_search_places',
      'Search AMap places by keywords or six-digit POI type codes with bounded pagination.',
      placeSearchSchema,
      'Search places',
      '搜索地点'
    ))

    const nearbySearchTool = defineAgentTool(async (input: z.infer<typeof nearbySearchSchema>) =>
      mapPlaceSearch(await call('placeAround', {
        ...placeArguments(input),
        location: formatCoordinate(input.location),
        radius: input.radiusMeters ?? 5000,
        sortrule: input.sort ?? 'distance'
      }), pageContext(input)), toolFields(
      'amap_search_nearby',
      'Search nearby AMap places around a GCJ02 coordinate with an explicit radius and bounded pagination.',
      nearbySearchSchema,
      'Search nearby places',
      '搜索附近地点'
    ))

    const placeDetailTool = defineAgentTool(async (input: z.infer<typeof placeDetailSchema>) =>
      mapPlaceDetail(await call('placeDetail', { id: input.id })), toolFields(
      'amap_get_place',
      'Get allowlisted details for an exact AMap POI ID returned by place search.',
      placeDetailSchema,
      'Get place details',
      '获取地点详情'
    ))

    const drivingTool = defineAgentTool(async (input: z.infer<typeof drivingRouteSchema>) =>
      mapRoute(await call('directionDriving', {
        ...routeArguments(input),
        ...(input.originPoiId ? { origin_id: input.originPoiId } : {}),
        ...(input.destinationPoiId ? { destination_id: input.destinationPoiId } : {}),
        strategy: DRIVING_STRATEGY[input.strategy ?? 'recommended'],
        ...(input.waypoints?.length ? { waypoints: formatCoordinates(input.waypoints, ';') } : {}),
        alternative_route: input.alternatives ?? 1
      }, AMAP_ROUTE_TIMEOUT_MS), 'driving'), toolFields(
      'amap_route_driving',
      'Plan AMap driving routes between two GCJ02 coordinates with semantic strategy, waypoints, cost, and concise steps.',
      drivingRouteSchema,
      'Plan driving route',
      '规划驾车路线'
    ))

    const transitTool = defineAgentTool(async (input: z.infer<typeof transitRouteSchema>) =>
      mapTransitRoute(await call('directionTransit', {
        ...routeArguments(input),
        ...(input.originPoiId ? { originpoi: input.originPoiId } : {}),
        ...(input.destinationPoiId ? { destinationpoi: input.destinationPoiId } : {}),
        city1: input.originCityCode,
        city2: input.destinationCityCode,
        strategy: TRANSIT_STRATEGY[input.strategy ?? 'recommended'],
        AlternativeRoute: input.alternatives ?? 5,
        nightflag: input.includeNightBus ? 1 : 0
      }, AMAP_ROUTE_TIMEOUT_MS)), toolFields(
      'amap_route_transit',
      'Plan AMap public transit routes between two GCJ02 coordinates and explicit origin and destination city codes.',
      transitRouteSchema,
      'Plan transit route',
      '规划公交路线'
    ))

    const walkingTool = defineAgentTool(async (input: z.infer<typeof walkingRouteSchema>) =>
      mapRoute(await call('directionWalking', {
        ...routeArguments(input),
        ...(input.originPoiId ? { origin_id: input.originPoiId } : {}),
        ...(input.destinationPoiId ? { destination_id: input.destinationPoiId } : {}),
        alternative_route: input.alternatives ?? 1,
        isindoor: input.indoor ? 1 : 0
      }, AMAP_ROUTE_TIMEOUT_MS), 'walking'), toolFields(
      'amap_route_walking',
      'Plan AMap walking routes between two GCJ02 coordinates.',
      walkingRouteSchema,
      'Plan walking route',
      '规划步行路线'
    ))

    const bicyclingTool = defineAgentTool(async (input: z.infer<typeof bicyclingRouteSchema>) =>
      mapRoute(await call('directionBicycling', {
        ...routeArguments(input),
        alternative_route: input.alternatives ?? 1
      }, AMAP_ROUTE_TIMEOUT_MS), 'bicycling'), toolFields(
      'amap_route_bicycling',
      'Plan AMap bicycling routes between two GCJ02 coordinates.',
      bicyclingRouteSchema,
      'Plan bicycling route',
      '规划骑行路线'
    ))

    const distanceTool = defineAgentTool(async (input: z.infer<typeof distanceSchema>) =>
      mapDistance(await call('distance', {
        origins: formatCoordinates(input.origins, '|'),
        destination: formatCoordinate(input.destination),
        type: DISTANCE_MODE[input.mode ?? 'driving']
      }, AMAP_ROUTE_TIMEOUT_MS), input.mode ?? 'driving'), toolFields(
      'amap_distance',
      'Calculate straight-line, driving, or walking distance from up to 100 GCJ02 origins to one destination.',
      distanceSchema,
      'Calculate distance',
      '计算距离'
    ))

    const weatherTool = defineAgentTool(async (input: z.infer<typeof weatherSchema>) =>
      mapWeather(await call('weather', {
        city: input.adcode,
        extensions: (input.mode ?? 'live') === 'live' ? 'base' : 'all'
      }), input.mode ?? 'live'), toolFields(
      'amap_weather',
      'Get current or forecast weather for an explicit six-digit Chinese adcode.',
      weatherSchema,
      'Get weather',
      '查询天气'
    ))

    const ipLocationTool = defineAgentTool(async (input: z.infer<typeof ipLocationSchema>) =>
      mapIpLocation(await call('ipLocation', { ip: input.ip })), toolFields(
      'amap_ip_location',
      'Locate an explicit public IPv4 address to province, city, adcode, and GCJ02 bounding rectangle.',
      ipLocationSchema,
      'Locate IP address',
      '查询 IP 位置'
    ))

    return {
      name: AMAP_RUNTIME_MIDDLEWARE_NAME,
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
        distanceTool,
        weatherTool,
        ipLocationTool
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

function placeArguments(input: {
  keywords?: string
  types?: string[]
  region?: string
  cityLimit?: boolean
  page?: number
  pageSize?: number
}) {
  return {
    ...(input.keywords ? { keywords: input.keywords } : {}),
    ...(input.types?.length ? { types: input.types.join('|') } : {}),
    ...(input.region ? { region: input.region } : {}),
    city_limit: input.cityLimit ?? false,
    page_num: input.page ?? 1,
    page_size: input.pageSize ?? 10
  }
}

function pageContext(input: { page?: number; pageSize?: number }) {
  return { page: input.page ?? 1, pageSize: input.pageSize ?? 10 }
}

function routeArguments(input: {
  origin?: { lat?: number; lng?: number }
  destination?: { lat?: number; lng?: number }
}) {
  return {
    origin: formatCoordinate(input.origin),
    destination: formatCoordinate(input.destination)
  }
}

function requiredCoordinate(value: { lng?: number; lat?: number } | undefined) {
  if (!value || typeof value.lng !== 'number' || typeof value.lat !== 'number') {
    throw configurationError('A complete coordinate with lng and lat is required.')
  }
  return { lng: value.lng, lat: value.lat }
}

function runtimeCredentialFrom(credential: ConnectorRuntimeCredentialV2): AmapRuntimeCredential {
  const apiKey = readString(credential.credentials.apiKey)
  const privateKey = readString(credential.credentials.privateKey)
  if (!apiKey) throw configurationError('AMap runtime credential is incomplete.')
  return { apiKey, ...(privateKey ? { privateKey } : {}) }
}

function connectionStatusDto(credential: ConnectorRuntimeCredentialV2) {
  return {
    status: 'active' as const,
    connectorId: credential.connectorId,
    provider: credential.provider,
    authMethodId: credential.authMethodId,
    scopes: credential.scopes ?? [],
    profile: credential.profile ? { name: readString(credential.profile.name) ?? null } : null,
    digitalSignatureEnabled: Boolean(readString(credential.credentials.privateKey))
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function configurationError(message: string): AmapConnectorError {
  return new AmapConnectorError('CONFIGURATION_INVALID', message)
}
