import { z } from 'zod'

export const mapProviderSchema = z.enum(['amap', 'tencent'])
export type MapProviderId = z.infer<typeof mapProviderSchema>
export const coordinateSchema = z.object({
  lng: z.number().finite().min(-180).max(180),
  lat: z.number().finite().min(-85).max(85)
}).strict()
export type Coordinate = z.infer<typeof coordinateSchema>
const label = z.string().trim().min(1).max(200)
export const mapSearchInputSchema = z.object({
  query: label,
  city: z.string().trim().min(1).max(80).regex(/^[^(),;|]+$/, 'Use a city name or code').optional(),
  center: coordinateSchema.optional(),
  radiusMeters: z.number().int().min(100).max(50000).default(1000),
  page: z.number().int().min(1).max(20).default(1),
  pageSize: z.number().int().min(1).max(20).default(10)
}).strict().refine((value) => Boolean(value.city || value.center), { message: 'Specify city or center', path: ['city'] })
export const mapDetailInputSchema = z.object({ id: z.string().trim().min(1).max(128).regex(/^[\w:-]+$/) }).strict()
export const mapRouteInputSchema = z.object({
  origin: coordinateSchema,
  destination: coordinateSchema,
  travelMode: z.enum(['driving', 'walking']).default('driving')
}).strict()
export const mapViewportInputSchema = z.object({
  center: coordinateSchema,
  zoom: z.number().int().min(4).max(17),
  width: z.number().int().min(50).max(1024),
  height: z.number().int().min(50).max(1024)
}).strict()
export type MapSearchInput = z.infer<typeof mapSearchInputSchema>
export type MapDetailInput = z.infer<typeof mapDetailInputSchema>
export type MapRouteInput = z.infer<typeof mapRouteInputSchema>
export type MapViewportInput = z.infer<typeof mapViewportInputSchema>

export const mapPlaceSchema = z.object({
  id: z.string().min(1).max(128),
  name: label,
  location: coordinateSchema,
  address: z.string().max(500),
  category: z.string().max(200).optional(),
  phone: z.string().max(100).optional(),
  distanceMeters: z.number().finite().nonnegative().max(50000000).optional()
}).strict()
export type MapPlace = z.infer<typeof mapPlaceSchema>
const resultMetadata = {
  provider: mapProviderSchema,
  mode: z.enum(['live', 'demo']),
  coordinateSystem: z.literal('GCJ02'),
  attribution: z.string().min(1).max(300)
}
export const mapPlacesResultSchema = z.object({
  ...resultMetadata, kind: z.literal('places'), title: label,
  places: z.array(mapPlaceSchema).max(20), page: z.number().int().min(1).max(20), hasMore: z.boolean()
}).strict()
export const mapPlaceResultSchema = z.object({ ...resultMetadata, kind: z.literal('place'), place: mapPlaceSchema }).strict()
export const mapRouteResultSchema = z.object({
  ...resultMetadata, kind: z.literal('route'), title: label,
  origin: coordinateSchema, destination: coordinateSchema,
  travelMode: z.enum(['driving', 'walking']),
  distanceMeters: z.number().finite().nonnegative().max(50000000),
  durationSeconds: z.number().finite().nonnegative().max(50000000),
  path: z.array(coordinateSchema).min(2).max(10000),
  steps: z.array(z.string().max(500)).max(100).optional()
}).strict()
export const mapViewportResultSchema = z.object({
  ...resultMetadata, kind: z.literal('viewport'), ...mapViewportInputSchema.shape,
  imageDataUrl: z.string().max(2100000).regex(/^data:image\/(?:png|jpeg|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/)
}).strict()
export const mapResultSchema = z.discriminatedUnion('kind', [
  mapPlacesResultSchema, mapPlaceResultSchema, mapRouteResultSchema, mapViewportResultSchema
]).superRefine((result, ctx) => {
  if (result.kind === 'viewport' && result.mode === 'live' && result.imageDataUrl.startsWith('data:image/svg')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['imageDataUrl'], message: 'Live maps require PNG or JPEG images' })
  }
})
export type MapPlacesResult = z.infer<typeof mapPlacesResultSchema>
export type MapPlaceResult = z.infer<typeof mapPlaceResultSchema>
export type MapRouteResult = z.infer<typeof mapRouteResultSchema>
export type MapViewportResult = z.infer<typeof mapViewportResultSchema>
export type MapResult = z.infer<typeof mapResultSchema>
