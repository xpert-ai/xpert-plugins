import { z } from 'zod/v3'
import { mapProviderSchema, mapResultSchema, mapSearchInputSchema } from './contracts.js'

export const mapViewDataSchema = z.object({
  kind: z.literal('maps-view'),
  provider: mapProviderSchema,
  mode: z.enum(['live', 'demo']),
  result: mapResultSchema.optional(),
  search: mapSearchInputSchema.optional()
}).strict()
export type MapViewData = z.infer<typeof mapViewDataSchema>

export const mapViewQuerySchema = z.object({
  operation: z.enum(['search', 'detail', 'route']).optional(),
  inputJson: z.string().max(8000).optional()
}).strict().refine(value => Boolean(value.operation) === Boolean(value.inputJson), {
  message: 'Both operation and inputJson are required'
})

export const MAPS_VIEW_ACTIONS = ['maps.search', 'maps.detail', 'maps.route', 'maps.render'] as const
