import { z } from 'zod/v3'
import { analyticsSourceRefSchema, analyticsDiscoveryResultSchema } from '@xpert-ai/plugin-sdk/analytics'
import { datasetSummarySchema } from './dataset.schema'
export * from './dataset.schema'
export * from './template.schema'

/**
 * @beta Workbench data-view contracts are experimental. View keys, navigation
 * parameters and data payloads may change incompatibly during beta.
 */
export const libraryPages = ['data'] as const
export type LibraryPage = typeof libraryPages[number]
export const sourceSummarySchema = z.object({ source: analyticsSourceRefSchema, name: z.string(), providers: z.array(z.object({
  id: z.string(), name: z.string(), operations: z.array(z.object({ name: z.string(), contractVersion: z.number(), readOnly: z.literal(true) }))
})) })
export const libraryDataSchema = z.object({ meta: z.object({ canEdit: z.boolean(), sources: z.array(sourceSummarySchema),
  datasets: z.array(datasetSummarySchema), page: z.number(), hasMore: z.boolean() }) })
// Host transport may append cursor/search/sort/filter keys even when unsupported.
// Strip that transport metadata; keep plugin navigation parameters and all mutations strict.
export const libraryQuerySchema = z.object({ page: z.number().int().positive().default(1), pageSize: z.number().int().min(1).max(50).default(30),
  selectionId: z.string().uuid().optional(), parameters: z.object({ tab: z.enum(['datasets','sources']).optional(),
    search: z.string().max(160).optional() }).strict().optional()
}).strip()
export { analyticsDiscoveryResultSchema }
export type LibraryData = z.infer<typeof libraryDataSchema>['meta']
