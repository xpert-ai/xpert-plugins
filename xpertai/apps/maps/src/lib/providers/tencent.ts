import { z } from 'zod'
import {
  coordinateSchema, mapSearchInputSchema, mapDetailInputSchema, mapRouteInputSchema, mapViewportInputSchema,
  mapPlacesResultSchema, mapPlaceResultSchema, mapRouteResultSchema, mapViewportResultSchema,
  type Coordinate, type MapPlace, type MapSearchInput, type MapDetailInput, type MapRouteInput, type MapViewportInput,
  type MapPlacesResult, type MapPlaceResult, type MapRouteResult, type MapViewportResult
} from '../contracts.js'
import { MapHttpClient } from './http.js'
import { attributionFor, MapProviderError, type MapCredential, type MapHttpOptions, type MapProvider } from './types.js'

const poiSchema = z.object({
  id: z.string().min(1), title: z.string().min(1), location: coordinateSchema,
  address: z.string().optional(), category: z.string().optional(), tel: z.string().optional(),
  _distance: z.number().finite().nonnegative().optional()
})
const placesSchema = z.object({ status: z.literal(0), count: z.number().int().nonnegative().optional(), data: z.array(poiSchema).max(100) })
const detailSchema = z.object({ status: z.literal(0), data: z.array(poiSchema).max(10) })
const routeSchema = z.object({ status: z.literal(0), result: z.object({ routes: z.array(z.object({
  distance: z.number().finite().nonnegative(), duration: z.number().finite().nonnegative(),
  polyline: z.array(z.number().finite()).min(4).max(20000),
  steps: z.array(z.object({ instruction: z.string().optional() })).max(1000).optional()
})).max(10) }) })
const statusSchema = z.object({ status: z.number().int() })
const coord = (value: Coordinate) => `${value.lat.toFixed(6)},${value.lng.toFixed(6)}`
const at = attributionFor('tencent')
function success(payload: unknown): void {
  const state = statusSchema.safeParse(payload)
  if (!state.success) throw new MapProviderError('RESPONSE_INVALID', 'Tencent Maps returned an invalid response.')
  if (state.data.status !== 0) {
    if ([110, 111, 112, 113, 114, 115, 120, 121].includes(state.data.status)) throw new MapProviderError('CREDENTIAL_INVALID', 'Tencent Maps rejected the credential or its permissions.')
    if ([119, 122, 123, 196].includes(state.data.status)) throw new MapProviderError('QUOTA_EXCEEDED', 'Tencent Maps request quota was exceeded.')
    throw new MapProviderError('REQUEST_FAILED', 'Tencent Maps could not complete the request.')
  }
}
function place(poi: z.infer<typeof poiSchema>): MapPlace {
  return { id: poi.id.slice(0, 128), name: poi.title.slice(0, 200), location: poi.location, address: (poi.address ?? '').slice(0, 500),
    ...(poi.category ? { category: poi.category.slice(0, 200) } : {}), ...(poi.tel ? { phone: poi.tel.slice(0, 100) } : {}),
    ...(poi._distance !== undefined && poi._distance <= 50000000 ? { distanceMeters: poi._distance } : {}) }
}
export function decodeTencentPolyline(encoded: number[]): Coordinate[] {
  if (encoded.length < 4 || encoded.length % 2 !== 0 || encoded.length > 20000 || !encoded.every(Number.isFinite)) throw new MapProviderError('RESPONSE_INVALID', 'Tencent Maps returned invalid route geometry.')
  const values = [...encoded]
  for (let index = 2; index < values.length; index++) values[index] = values[index - 2] + values[index] / 1000000
  const path: Coordinate[] = []
  for (let index = 0; index < values.length; index += 2) {
    const result = coordinateSchema.safeParse({ lat: values[index], lng: values[index + 1] })
    if (!result.success) throw new MapProviderError('RESPONSE_INVALID', 'Tencent Maps returned an invalid route coordinate.')
    path.push(result.data)
  }
  return path
}

export class TencentMapProvider implements MapProvider {
  readonly id = 'tencent' as const
  private readonly http: MapHttpClient
  constructor(options: MapHttpOptions = {}) { this.http = new MapHttpClient(options) }
  async search(raw: MapSearchInput, credential: MapCredential, signal?: AbortSignal): Promise<MapPlacesResult> {
    const input = mapSearchInputSchema.parse(raw)
    if (Buffer.byteLength(input.query, 'utf8') > 96) throw new MapProviderError('INVALID_ARGUMENT', 'Tencent place search supports at most 96 UTF-8 bytes per query.')
    if (input.center && input.radiusMeters > 1000) throw new MapProviderError('INVALID_ARGUMENT', 'Tencent nearby search supports a radius of at most 1000 meters.')
    if ((input.page - 1) * input.pageSize >= 200) throw new MapProviderError('INVALID_ARGUMENT', 'Tencent place search supports only the first 200 results.')
    const payload = await this.http.json(this.id, '/ws/place/v1/search', {
      keyword: input.query,
      boundary: input.center ? `nearby(${coord(input.center)},${input.radiusMeters},0)` : `region(${input.city},0)`,
      page_index: input.page, page_size: input.pageSize, orderby: input.center ? '_distance' : undefined
    }, credential, signal)
    success(payload)
    const parsed = placesSchema.safeParse(payload)
    if (!parsed.success) throw new MapProviderError('RESPONSE_INVALID', 'Tencent Maps returned invalid place data.')
    const places = parsed.data.data.slice(0, input.pageSize).map(place)
    return mapPlacesResultSchema.parse({ kind: 'places', provider: this.id, mode: 'live', coordinateSystem: 'GCJ02',
      title: input.query, places, page: input.page,
      hasMore: input.page < 20 && input.page * input.pageSize < 200 && (parsed.data.count !== undefined ? input.page * input.pageSize < parsed.data.count : places.length === input.pageSize), attribution: at })
  }
  async detail(raw: MapDetailInput, credential: MapCredential, signal?: AbortSignal): Promise<MapPlaceResult> {
    const input = mapDetailInputSchema.parse(raw)
    const payload = await this.http.json(this.id, '/ws/place/v1/detail', { id: input.id }, credential, signal)
    success(payload)
    const parsed = detailSchema.safeParse(payload)
    if (!parsed.success) throw new MapProviderError('RESPONSE_INVALID', 'Tencent Maps returned invalid place data.')
    const poi = parsed.data.data[0]
    if (!poi) throw new MapProviderError('NO_RESULT', 'Tencent Maps found no place for this ID.')
    return mapPlaceResultSchema.parse({ kind: 'place', provider: this.id, mode: 'live', coordinateSystem: 'GCJ02', place: place(poi), attribution: at })
  }
  async route(raw: MapRouteInput, credential: MapCredential, signal?: AbortSignal): Promise<MapRouteResult> {
    const input = mapRouteInputSchema.parse(raw)
    const payload = await this.http.json(this.id, `/ws/direction/v1/${input.travelMode}/`, {
      from: coord(input.origin), to: coord(input.destination)
    }, credential, signal)
    success(payload)
    const parsed = routeSchema.safeParse(payload)
    if (!parsed.success) throw new MapProviderError('RESPONSE_INVALID', 'Tencent Maps returned invalid route geometry or duration.')
    const route = parsed.data.result.routes[0]
    if (!route) throw new MapProviderError('NO_RESULT', 'Tencent Maps found no route.')
    const result = mapRouteResultSchema.safeParse({ kind: 'route', provider: this.id, mode: 'live', coordinateSystem: 'GCJ02',
      title: input.travelMode === 'driving' ? '驾车路线' : '步行路线', ...input,
      distanceMeters: route.distance, durationSeconds: route.duration * 60, path: decodeTencentPolyline(route.polyline),
      steps: (route.steps ?? []).flatMap((step) => step.instruction ? [step.instruction.slice(0, 500)] : []).slice(0, 100), attribution: at })
    if (!result.success) throw new MapProviderError('RESPONSE_INVALID', 'Tencent Maps returned an unsupported route.')
    return result.data
  }
  async render(raw: MapViewportInput, credential: MapCredential, signal?: AbortSignal): Promise<MapViewportResult> {
    const input = mapViewportInputSchema.parse(raw)
    if (input.center.lat < 3.5 || input.center.lat > 53 || input.center.lng < 73.5 || input.center.lng > 135) throw new MapProviderError('REGION_UNSUPPORTED', 'Tencent static maps support centers within the documented mainland China bounds.')
    const imageDataUrl = await this.http.image(this.id, '/ws/staticmap/v2/', {
      center: coord(input.center), zoom: input.zoom, size: `${input.width}*${input.height}`, scale: 1, format: 'png', maptype: 'roadmap'
    }, credential, signal)
    return mapViewportResultSchema.parse({ kind: 'viewport', provider: this.id, mode: 'live', coordinateSystem: 'GCJ02', ...input, imageDataUrl, attribution: at })
  }
}
