import { z } from 'zod'
import {
  coordinateSchema, mapSearchInputSchema, mapDetailInputSchema, mapRouteInputSchema, mapViewportInputSchema,
  mapPlacesResultSchema, mapPlaceResultSchema, mapRouteResultSchema, mapViewportResultSchema,
  type Coordinate, type MapPlace, type MapSearchInput, type MapDetailInput, type MapRouteInput, type MapViewportInput,
  type MapPlacesResult, type MapPlaceResult, type MapRouteResult, type MapViewportResult
} from '../contracts.js'
import { MapHttpClient } from './http.js'
import { attributionFor, MapProviderError, type MapCredential, type MapHttpOptions, type MapProvider } from './types.js'

// AMap represents missing values as empty arrays in some Web Service responses.
const text = z.union([z.string(), z.array(z.never()).length(0)]).optional().transform((value) => typeof value === 'string' ? value : undefined)
const numeric = z.union([z.number(), z.string().regex(/^\d+(?:\.\d+)?$/)]).transform(Number).pipe(z.number().finite().nonnegative())
const poiSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), location: z.string(), address: text,
  pname: text, cityname: text, adname: text, type: text, distance: text,
  business: z.object({ tel: text }).optional()
})
const placesSchema = z.object({ status: z.literal('1'), count: numeric.optional(), pois: z.array(poiSchema).max(100) })
const routeSchema = z.object({ status: z.literal('1'), route: z.object({ paths: z.array(z.object({
  distance: numeric,
  cost: z.object({ duration: numeric }),
  steps: z.array(z.object({ instruction: text, polyline: z.string().min(1).max(500000) })).min(1).max(1000)
})).max(10) }) })
const statusSchema = z.object({ status: z.string(), infocode: z.string().optional() })
const at = attributionFor('amap')
const coord = (value: Coordinate) => `${value.lng.toFixed(6)},${value.lat.toFixed(6)}`
function success(payload: unknown): void {
  const state = statusSchema.safeParse(payload)
  if (!state.success) throw new MapProviderError('RESPONSE_INVALID', 'AMap returned an invalid response.')
  if (state.data.status !== '1') {
    if (['10001', '10002', '10005', '10007', '10008', '10009', '10012', '10013'].includes(state.data.infocode ?? '')) throw new MapProviderError('CREDENTIAL_INVALID', 'AMap rejected the Web Service credential or its permissions.')
    if (['10003', '10004', '10014', '10019', '10020', '10021', '10029', '10044'].includes(state.data.infocode ?? '')) throw new MapProviderError('QUOTA_EXCEEDED', 'AMap request quota was exceeded.')
    throw new MapProviderError('REQUEST_FAILED', 'AMap could not complete the request.')
  }
}
function point(value: string): Coordinate {
  if (!/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(value)) throw new MapProviderError('RESPONSE_INVALID', 'AMap returned an invalid coordinate.')
  const [lng, lat] = value.split(',').map(Number)
  const result = coordinateSchema.safeParse({ lng, lat })
  if (!result.success) throw new MapProviderError('RESPONSE_INVALID', 'AMap returned an invalid coordinate.')
  return result.data
}
function place(poi: z.infer<typeof poiSchema>): MapPlace {
  const distance = poi.distance ? Number(poi.distance) : undefined
  return {
    id: poi.id.slice(0, 128), name: poi.name.slice(0, 200), location: point(poi.location),
    address: [poi.pname, poi.cityname, poi.adname, poi.address].filter(Boolean).join(' ').slice(0, 500),
    ...(poi.type ? { category: poi.type.slice(0, 200) } : {}),
    ...(poi.business?.tel ? { phone: poi.business.tel.slice(0, 100) } : {}),
    ...(distance !== undefined && Number.isFinite(distance) && distance >= 0 && distance <= 50000000 ? { distanceMeters: distance } : {})
  }
}

export class AmapMapProvider implements MapProvider {
  readonly id = 'amap' as const
  private readonly http: MapHttpClient
  constructor(options: MapHttpOptions = {}) { this.http = new MapHttpClient(options) }
  async search(raw: MapSearchInput, credential: MapCredential, signal?: AbortSignal): Promise<MapPlacesResult> {
    const input = mapSearchInputSchema.parse(raw)
    const payload = await this.http.json(this.id, input.center ? '/v5/place/around' : '/v5/place/text', {
      keywords: input.query, region: input.city, city_limit: input.city ? 'true' : undefined,
      page_num: input.page, page_size: input.pageSize, show_fields: 'business',
      ...(input.center ? { location: coord(input.center), radius: input.radiusMeters, sortrule: 'distance' } : {})
    }, credential, signal)
    success(payload)
    const parsed = placesSchema.safeParse(payload)
    if (!parsed.success) throw new MapProviderError('RESPONSE_INVALID', 'AMap returned invalid place data.')
    const places = parsed.data.pois.slice(0, input.pageSize).map(place)
    return mapPlacesResultSchema.parse({ kind: 'places', provider: this.id, mode: 'live', coordinateSystem: 'GCJ02',
      title: input.query, places, page: input.page,
      hasMore: input.page < 20 && (parsed.data.count !== undefined ? input.page * input.pageSize < parsed.data.count : places.length === input.pageSize), attribution: at })
  }
  async detail(raw: MapDetailInput, credential: MapCredential, signal?: AbortSignal): Promise<MapPlaceResult> {
    const input = mapDetailInputSchema.parse(raw)
    const payload = await this.http.json(this.id, '/v5/place/detail', { id: input.id, show_fields: 'business' }, credential, signal)
    success(payload)
    const parsed = placesSchema.safeParse(payload)
    if (!parsed.success) throw new MapProviderError('RESPONSE_INVALID', 'AMap returned invalid place data.')
    if (!parsed.data.pois[0]) throw new MapProviderError('NO_RESULT', 'AMap found no place for this ID.')
    return mapPlaceResultSchema.parse({ kind: 'place', provider: this.id, mode: 'live', coordinateSystem: 'GCJ02', place: place(parsed.data.pois[0]), attribution: at })
  }
  async route(raw: MapRouteInput, credential: MapCredential, signal?: AbortSignal): Promise<MapRouteResult> {
    const input = mapRouteInputSchema.parse(raw)
    const payload = await this.http.json(this.id, `/v5/direction/${input.travelMode}`, {
      origin: coord(input.origin), destination: coord(input.destination), show_fields: 'cost,polyline', alternative_route: 1
    }, credential, signal)
    success(payload)
    const parsed = routeSchema.safeParse(payload)
    if (!parsed.success) throw new MapProviderError('RESPONSE_INVALID', 'AMap returned invalid route geometry or duration.')
    const route = parsed.data.route.paths[0]
    if (!route) throw new MapProviderError('NO_RESULT', 'AMap found no route.')
    const path: Coordinate[] = []
    for (const step of route.steps) {
      for (const item of step.polyline.split(';')) {
        const next = point(item)
        const previous = path[path.length - 1]
        if (!previous || previous.lng !== next.lng || previous.lat !== next.lat) path.push(next)
        if (path.length > 10000) throw new MapProviderError('RESPONSE_TOO_LARGE', 'Route geometry exceeds the supported 10000 points.')
      }
    }
    const result = mapRouteResultSchema.safeParse({ kind: 'route', provider: this.id, mode: 'live', coordinateSystem: 'GCJ02',
      title: input.travelMode === 'driving' ? '驾车路线' : '步行路线', ...input,
      distanceMeters: route.distance, durationSeconds: route.cost.duration, path,
      steps: route.steps.flatMap((step) => step.instruction ? [step.instruction.slice(0, 500)] : []).slice(0, 100), attribution: at })
    if (!result.success) throw new MapProviderError('RESPONSE_INVALID', 'AMap returned an unsupported route.')
    return result.data
  }
  async render(raw: MapViewportInput, credential: MapCredential, signal?: AbortSignal): Promise<MapViewportResult> {
    const input = mapViewportInputSchema.parse(raw)
    const imageDataUrl = await this.http.image(this.id, '/v3/staticmap', {
      location: coord(input.center), zoom: input.zoom, size: `${input.width}*${input.height}`, scale: 1
    }, credential, signal)
    return mapViewportResultSchema.parse({ kind: 'viewport', provider: this.id, mode: 'live', coordinateSystem: 'GCJ02', ...input, imageDataUrl, attribution: at })
  }
}
