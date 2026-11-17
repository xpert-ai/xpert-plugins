import { z } from 'zod/v3'
import { dashboardSchema } from './dashboard.schema'

/**
 * @beta Standard-dashboard generation contracts are experimental. Preset keys,
 * field mappings and request payloads may change incompatibly during beta.
 */
export const templateKeySchema = z.enum(['comparison', 'trend', 'details', 'bar', 'line', 'area', 'pie'])
export const visualThemeSchema = dashboardSchema.innerType().shape.visualTheme.unwrap()
const field = dashboardSchema.innerType().shape.charts.element.shape.x
export const templateCreateSchema = z.object({
  datasetId: z.string().uuid(), datasetRevision: z.number().int().positive(),
  id: z.string().uuid(), title: z.string().trim().min(1).max(160), template: templateKeySchema,
  theme: visualThemeSchema, x: field.optional(), y: field.optional()
}).strict()
export type TemplateCreate = z.infer<typeof templateCreateSchema>
