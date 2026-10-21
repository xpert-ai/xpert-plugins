import { z } from 'zod/v3'
import { analyticsSourceRefSchema } from '@xpert-ai/plugin-sdk/analytics'
import { artifactDocumentDependencyAssets } from '@xpert-ai/plugin-sdk/artifact-document'
import { dashboardSchema } from './dashboard.schema'
import { dashboardNavigationTargetSchema } from './dashboard-navigation'

export const dashboardSummarySchema = z.object({ artifactId: z.string(), versionId: z.string().nullish(), versionNumber: z.number().optional(), title: z.string().nullish(), updatedAt: z.string().optional(), draftRevision: z.number().optional(), isDraft: z.boolean().optional(), baseVersionId: z.string().nullish() })
export const dashboardSavedSchema = dashboardSummarySchema.extend({ manifest: dashboardSchema, dependencies: artifactDocumentDependencyAssets.optional() })
// Source identities belong to Analytics, including immutable Definitions and Artifacts.
// The viewer consumes only the reference and label; DataSource fields are not universal.
export const dashboardViewDataSchema = z.object({ meta: z.object({
  navigationTarget: dashboardNavigationTargetSchema.optional(),
  dashboards: z.array(dashboardSummarySchema),
  sources: z.array(z.object({ source: analyticsSourceRefSchema, name: z.string() })),
  saved: dashboardSavedSchema.optional(),
  versions: z.array(dashboardSummarySchema).optional()
}) })
