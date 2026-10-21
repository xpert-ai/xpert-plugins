import { z } from 'zod/v3'

// The host namespaces provider + local view key; cards use the resolved public key.
export const DASHBOARD_VIEW_KEY = 'live-dashboard__live-dashboard'
export const dashboardNavigationSchema = z.object({
  selectionId: z.string().uuid().optional(),
  parameters: z.object({ artifactId: z.string().uuid().optional(), versionId: z.string().uuid().optional() }).strict().optional()
}).transform((query, ctx) => {
  const artifactId = query.selectionId ?? query.parameters?.artifactId
  const versionId = query.parameters?.versionId
  if (query.selectionId && query.parameters?.artifactId && query.selectionId !== query.parameters.artifactId || versionId && !artifactId)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'DASHBOARD_NAVIGATION_INVALID: provide one Artifact identity and an optional version' })
  return { artifactId, versionId }
})
export type DashboardNavigation = z.infer<typeof dashboardNavigationSchema>
export const dashboardNavigationKey = (target: DashboardNavigation) => JSON.stringify([target.artifactId ?? null, target.versionId ?? null])
