import { isIP } from 'node:net'
import { z } from 'zod/v3'

const boundedUtf8 = (label: string, maxBytes: number) => z.string().trim().min(1).max(maxBytes).refine(
  (value) => Buffer.byteLength(value, 'utf8') <= maxBytes,
  `${label} must not exceed ${maxBytes} UTF-8 bytes.`
)

export const coordinateSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180)
}).strict()

export const emptySchema = z.object({}).strict()

export const geocodeSchema = z.object({
  address: boundedUtf8('address', 256)
}).strict()

export const reverseGeocodeSchema = z.object({
  location: coordinateSchema
}).strict()

const paginationFields = {
  page: z.number().int().min(1).max(10).default(1)
    .describe('Result page, from 1 through 10.'),
  pageSize: z.number().int().min(1).max(20).default(20)
    .describe('Number of places per page, from 1 through 20.')
}

export const placeSearchSchema = z.object({
  keyword: boundedUtf8('keyword', 96),
  region: boundedUtf8('region', 64).optional(),
  ...paginationFields
}).strict()

export const nearbySearchSchema = z.object({
  keyword: boundedUtf8('keyword', 96),
  location: coordinateSchema,
  radiusMeters: z.number().int().min(10).max(1000).default(1000)
    .describe('Search radius in meters, from 10 through 1000.'),
  autoExtend: z.boolean().default(false)
    .describe('Whether Tencent Maps may expand the radius when the requested range has no results.'),
  ...paginationFields
}).strict()

export const placeDetailSchema = z.object({
  id: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/, 'id contains unsupported characters.')
}).strict()

export const routeSchema = z.object({
  from: coordinateSchema,
  to: coordinateSchema
}).strict()

export const transitRouteSchema = routeSchema.extend({
  sort_policy: z.enum(['LEAST_TIME', 'LEAST_TRANSFER', 'LEAST_WALKING', 'RECOMMEND']).default('LEAST_TIME'),
  subway_policy: z.enum(['NO_SUBWAY', 'ONLY_SUBWAY', 'SUBWAY_FIRST']).optional()
}).strict()

export const matrixSchema = z.object({
  origins: z.array(coordinateSchema).min(1).max(25),
  destinations: z.array(coordinateSchema).min(1).max(25),
  mode: z.enum(['driving', 'walking', 'bicycling']).default('driving')
}).strict().superRefine((value, context) => {
  if (value.origins.length * value.destinations.length > 100) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['destinations'],
      message: 'origins multiplied by destinations must not exceed 100 matrix elements.'
    })
  }
})

export const weatherSchema = z.object({
  adcode: z.string().trim().regex(/^\d{6}$/, 'adcode must contain exactly 6 digits.').optional(),
  location: coordinateSchema.optional(),
  type: z.enum(['now', 'future']).default('now')
}).strict().superRefine((value, context) => {
  if ((value.adcode ? 1 : 0) + (value.location ? 1 : 0) !== 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['adcode'],
      message: 'Provide exactly one of adcode or location.'
    })
  }
})

export const ipLocationSchema = z.object({
  ip: z.string().trim().min(2).max(45).refine((value) => isIP(value) !== 0, 'ip must be a valid IPv4 or IPv6 address.')
}).strict()

export const alongRouteSchema = routeSchema.extend({
  keyword: boundedUtf8('keyword', 96)
}).strict()

export const futureDrivingSchema = routeSchema.extend({
  departure_time: z.number().int().refine((value) => {
    const now = Math.floor(Date.now() / 1000)
    return value >= now - 60 && value <= now + 7 * 24 * 60 * 60
  }, 'departure_time must be a Unix timestamp from now through the next 7 days.')
}).strict()

export const waypointOrderSchema = routeSchema.extend({
  waypoints: z.array(coordinateSchema).min(1).max(16)
}).strict()

export type CoordinateInput = { lat?: number; lng?: number }

export function formatCoordinate(value: CoordinateInput | undefined): string {
  if (!value || typeof value.lat !== 'number' || typeof value.lng !== 'number') {
    throw new TypeError('A complete coordinate with lat and lng is required.')
  }
  return `${value.lat},${value.lng}`
}

export function formatCoordinates(values: CoordinateInput[] | undefined): string {
  if (!values) throw new TypeError('A coordinate array is required.')
  return values.map(formatCoordinate).join(';')
}
