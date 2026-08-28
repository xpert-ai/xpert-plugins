import { isIP } from 'node:net'
import { z } from 'zod/v3'

const boundedUtf8 = (label: string, maxBytes: number) => z.string().trim().min(1).max(maxBytes).refine(
  (value) => Buffer.byteLength(value, 'utf8') <= maxBytes,
  `${label} must not exceed ${maxBytes} UTF-8 bytes.`
)

const poiIdSchema = z.string().trim().min(1).max(128)
  .regex(/^[A-Za-z0-9_-]+$/, 'POI ID contains unsupported characters.')
const poiTypeSchema = z.string().trim().regex(/^\d{6}$/, 'POI type must contain exactly 6 digits.')
const cityCodeSchema = z.string().trim().regex(/^\d{3,4}$/, 'city code must contain 3 or 4 digits.')

export const coordinateSchema = z.object({
  lng: z.number().finite().min(-180).max(180),
  lat: z.number().finite().min(-90).max(90)
}).strict()

export const emptySchema = z.object({}).strict()

export const geocodeSchema = z.object({
  address: boundedUtf8('address', 256),
  city: boundedUtf8('city', 64).optional()
}).strict()

export const reverseGeocodeSchema = z.object({
  location: coordinateSchema,
  radiusMeters: z.number().int().min(0).max(3000).default(1000),
  poiTypes: z.array(poiTypeSchema).max(10).refine(uniqueStrings, 'POI types must be unique.').optional()
}).strict()

const paginationFields = {
  page: z.number().int().min(1).max(10).default(1),
  pageSize: z.number().int().min(1).max(20).default(10)
}

const placeSelectors = {
  keywords: z.string().trim().min(1).max(80).optional(),
  types: z.array(poiTypeSchema).max(10).refine(uniqueStrings, 'POI types must be unique.').optional()
}

export const placeSearchSchema = z.object({
  ...placeSelectors,
  region: boundedUtf8('region', 64).optional(),
  cityLimit: z.boolean().default(false),
  ...paginationFields
}).strict().superRefine(validatePlaceSearch)

export const nearbySearchSchema = z.object({
  ...placeSelectors,
  location: coordinateSchema,
  radiusMeters: z.number().int().min(0).max(50_000).default(5_000),
  sort: z.enum(['distance', 'weight']).default('distance'),
  region: boundedUtf8('region', 64).optional(),
  cityLimit: z.boolean().default(false),
  ...paginationFields
}).strict().superRefine(validatePlaceSearch)

export const placeDetailSchema = z.object({ id: poiIdSchema }).strict()

const routeBaseShape = {
  origin: coordinateSchema,
  destination: coordinateSchema
}

const optionalRoutePoiIds = {
  originPoiId: poiIdSchema.optional(),
  destinationPoiId: poiIdSchema.optional()
}

export const drivingRouteSchema = z.object({
  ...routeBaseShape,
  ...optionalRoutePoiIds,
  strategy: z.enum([
    'recommended',
    'avoid_congestion',
    'highway_first',
    'avoid_highway',
    'avoid_tolls',
    'main_roads',
    'fastest',
    'avoid_congestion_highway_first',
    'avoid_congestion_avoid_highway',
    'avoid_congestion_avoid_tolls',
    'avoid_tolls_avoid_highway',
    'avoid_congestion_avoid_tolls_avoid_highway',
    'avoid_congestion_main_roads',
    'avoid_congestion_fastest'
  ]).default('recommended'),
  waypoints: z.array(coordinateSchema).max(16).refine(uniqueCoordinates, 'Waypoints must be unique.').optional(),
  alternatives: z.number().int().min(1).max(3).default(1)
}).strict()

export const transitRouteSchema = z.object({
  ...routeBaseShape,
  originPoiId: poiIdSchema.optional(),
  destinationPoiId: poiIdSchema.optional(),
  originCityCode: cityCodeSchema,
  destinationCityCode: cityCodeSchema,
  strategy: z.enum([
    'recommended',
    'least_cost',
    'least_transfer',
    'least_walking',
    'most_comfortable',
    'no_subway',
    'subway_map',
    'subway_first',
    'least_time'
  ]).default('recommended'),
  alternatives: z.number().int().min(1).max(5).default(5),
  includeNightBus: z.boolean().default(false)
}).strict().superRefine((value, context) => {
  if (Boolean(value.originPoiId) !== Boolean(value.destinationPoiId)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['destinationPoiId'],
      message: 'originPoiId and destinationPoiId must be provided together.'
    })
  }
  if (value.strategy === 'subway_map' && (!value.originPoiId || !value.destinationPoiId)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['originPoiId'],
      message: 'subway_map requires both originPoiId and destinationPoiId.'
    })
  }
})

export const walkingRouteSchema = z.object({
  ...routeBaseShape,
  ...optionalRoutePoiIds,
  alternatives: z.number().int().min(1).max(3).default(1),
  indoor: z.boolean().default(false)
}).strict()

export const bicyclingRouteSchema = z.object({
  ...routeBaseShape,
  alternatives: z.number().int().min(1).max(3).default(1)
}).strict()

export const distanceSchema = z.object({
  origins: z.array(coordinateSchema).min(1).max(100),
  destination: coordinateSchema,
  mode: z.enum(['straight_line', 'driving', 'walking']).default('driving')
}).strict()

export const weatherSchema = z.object({
  adcode: z.string().trim().regex(/^\d{6}$/, 'adcode must contain exactly 6 digits.'),
  mode: z.enum(['live', 'forecast']).default('live')
}).strict()

export const ipLocationSchema = z.object({
  ip: z.string().trim().min(7).max(15).refine(isPublicIpv4, 'ip must be a public IPv4 address.')
}).strict()

export type CoordinateInput = { lng?: number; lat?: number }

export function formatCoordinate(value: CoordinateInput | undefined): string {
  if (!value || typeof value.lng !== 'number' || typeof value.lat !== 'number') {
    throw new TypeError('A complete coordinate with lng and lat is required.')
  }
  return `${formatNumber(value.lng)},${formatNumber(value.lat)}`
}

export function formatCoordinates(values: CoordinateInput[] | undefined, separator: '|' | ';'): string {
  if (!values) throw new TypeError('A coordinate array is required.')
  return values.map(formatCoordinate).join(separator)
}

function validatePlaceSearch(
  value: { keywords?: string; types?: string[]; page?: number; pageSize?: number },
  context: z.RefinementCtx
): void {
  if (!value.keywords && !value.types?.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['keywords'],
      message: 'Provide at least one of keywords or types.'
    })
  }
  if ((value.page ?? 1) * (value.pageSize ?? 10) > 200) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['page'],
      message: 'page multiplied by pageSize must not exceed the first 200 results.'
    })
  }
}

function uniqueStrings(values: string[]): boolean {
  return new Set(values).size === values.length
}

function uniqueCoordinates(values: Array<{ lng?: number; lat?: number }>): boolean {
  return new Set(values.map((value) => formatCoordinate(value))).size === values.length
}

function formatNumber(value: number): string {
  return String(Number(value.toFixed(6)))
}

function isPublicIpv4(value: string): boolean {
  if (isIP(value) !== 4) return false
  const [first, second, third, fourth] = value.split('.').map(Number)
  if (first === 0 || first === 10 || first === 127 || first >= 224) return false
  if (first === 100 && second >= 64 && second <= 127) return false
  if (first === 169 && second === 254) return false
  if (first === 172 && second >= 16 && second <= 31) return false
  if (first === 192 && second === 168) return false
  if (first === 192 && second === 0 && (third === 0 || third === 2)) return false
  if (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100))) return false
  if (first === 203 && second === 0 && third === 113) return false
  return !(first === 255 && second === 255 && third === 255 && fourth === 255)
}
