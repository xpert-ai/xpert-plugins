import { z } from 'zod/v3'

export const mapsOptionsSchema = z.object({
  provider: z.enum(['amap', 'tencent']).default('amap'),
  mode: z.enum(['live', 'demo']).default('live'),
  connectorId: z.string().trim().min(1).max(200).optional()
}).strict()

export type MapsOptions = z.input<typeof mapsOptionsSchema>
export type MapsSettings = z.output<typeof mapsOptionsSchema>
