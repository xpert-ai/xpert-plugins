import { z } from 'zod/v3'
import { analyticsSourceRefSchema } from '@xpert-ai/plugin-sdk/analytics'
import { artifactDocumentDependencyAssets } from '@xpert-ai/plugin-sdk/artifact-document'
import { dashboardProjectSchema } from './projects.schema'
import { dashboardSchema } from './dashboard.schema'
import { dashboardNavigationTargetSchema } from './dashboard-navigation'

export const dashboardSummarySchema = z.object({ artifactId: z.string(), versionId: z.string().nullish(), versionNumber: z.number().optional(), title: z.string().nullish(), updatedAt: z.string().optional(), draftRevision: z.number().optional(), canDelete: z.boolean().optional(), isDraft: z.boolean().optional(), baseVersionId: z.string().nullish() })
export const dashboardPickerPageSchema = z.object({ items: z.array(dashboardSummarySchema), page: z.number().int().positive(), hasMore: z.boolean() })
export const dashboardSavedSchema = dashboardSummarySchema.extend({ manifest: dashboardSchema, dependencies: artifactDocumentDependencyAssets.optional() })
// Source identities belong to Analytics, including immutable Definitions and Artifacts.
// The viewer consumes only the reference and label; DataSource fields are not universal.
export const dashboardViewDataSchema = z.object({ meta: z.object({
  currentProject: dashboardProjectSchema.nullable().optional(),
  access: z.object({ project: z.boolean(), archived: z.boolean(), canReadDraft: z.boolean(), canEdit: z.boolean(), canManage: z.boolean() }).optional(),
  mode: z.enum(['published', 'draft']).optional(),
  notice: z.literal('not_published').optional(),
  pagination: z.object({ page: z.number(), pageSize: z.number(), hasMore: z.boolean() }).optional(),
  navigationTarget: dashboardNavigationTargetSchema.optional(),
  dashboards: z.array(dashboardSummarySchema),
  sources: z.array(z.object({ source: analyticsSourceRefSchema, name: z.string() })),
  saved: dashboardSavedSchema.optional(),
  versions: z.array(dashboardSummarySchema).optional()
}) })
