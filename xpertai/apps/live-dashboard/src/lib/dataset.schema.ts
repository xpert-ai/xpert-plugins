import { z } from 'zod/v3'
import { analyticsBindingSchema, analyticsSourceRefSchema } from '@xpert-ai/plugin-sdk/analytics'
import { controlsSchema } from './dashboard.schema'

/**
 * @beta Reusable dataset definitions and their request/response contracts are experimental.
 * Persisted fields and API payloads may change incompatibly during beta; backward
 * compatibility is not guaranteed. Upgrades may require migrating or recreating definitions.
 */
export const datasetDefinitionSchema = z.object({
  schema: z.literal('xpert.live-dashboard.dataset'), id: z.string().uuid(),
  name: z.string().trim().min(1).max(160), description: z.string().max(1000).default(''),
  binding: analyticsBindingSchema, controls: controlsSchema.default({})
}).strict()
export const datasetSummarySchema = z.object({ artifactId: z.string().uuid(), revision: z.number().int().positive(),
  name: z.string(), description: z.string(), providerId: z.string(), source: analyticsSourceRefSchema,
  fields: z.number(), updatedAt: z.string().optional() })
export const datasetRecordSchema = datasetSummarySchema.extend({ definition: datasetDefinitionSchema })
export const datasetSaveSchema = z.object({ definition: datasetDefinitionSchema, expectedRevision: z.number().int().nonnegative(), artifactId: z.string().uuid().optional() }).strict()
export const datasetTargetSchema = z.object({ artifactId: z.string().uuid() }).strict()
export const datasetDeleteSchema = datasetTargetSchema.extend({ expectedRevision: z.number().int().positive(), confirmed: z.literal(true) }).strict()
export type DatasetDefinition = z.infer<typeof datasetDefinitionSchema>
export type DatasetSummary = z.infer<typeof datasetSummarySchema>
export type DatasetRecord = z.infer<typeof datasetRecordSchema>
