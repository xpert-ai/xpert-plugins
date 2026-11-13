import { z } from 'zod/v3'
import { dashboardSummarySchema } from './dashboard-view.schema'

export const dashboardDiscoveryQuerySchema = z
  .object({
    search: z.string().trim().max(100).default(''),
    origin: z.enum(['all', 'project', 'shared']).default('all'),
    cursor: z.string().min(1).max(512).optional(),
    projectId: z.string().uuid().optional()
  })
  .strict()

export const dashboardDiscoveryItemSchema = z.object({
  resource: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('project-content'), id: z.string().uuid() }).strict(),
    z.object({ kind: z.literal('group-reference'), id: z.string().uuid() }).strict()
  ]),
  title: z.string(),
  typeId: z.string().optional(),
  projectId: z.string().uuid(),
  contentSource: z.object({ providerKey: z.string(), resourceId: z.string().uuid() }).optional(),
  publication: z
    .object({ versionId: z.string().uuid(), versionNumber: z.number().int(), expiresAt: z.string() })
    .optional(),
  access: z.object({ canOpen: z.boolean(), canEdit: z.boolean(), analysis: z.enum(['none', 'bindings', 'explore']) }),
  dashboard: dashboardSummarySchema.optional()
})
export const dashboardDiscoveryPageSchema = z.object({
  items: z.array(dashboardDiscoveryItemSchema),
  nextCursor: z.string().nullable(),
  sharedAvailable: z.boolean(),
  canEdit: z.boolean(),
  mode: z.enum(['draft', 'published'])
})
export type DiscoveredDashboard = z.infer<typeof dashboardDiscoveryItemSchema>
