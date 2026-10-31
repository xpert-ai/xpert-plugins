import { z } from 'zod/v3'
import type { WorkbenchNavigationOpenPayload, XpertResolvedViewHostContext } from '@xpert-ai/contracts'

// The host namespaces provider + local view key; cards use the resolved public key.
export const DASHBOARD_VIEW_KEY = 'live-dashboard__live-dashboard'
export const dashboardNavigationTargetSchema = z.object({
  target: z.literal('workbench.view'), viewKey: z.literal(DASHBOARD_VIEW_KEY)
}).strict()
export type DashboardNavigationTarget = z.infer<typeof dashboardNavigationTargetSchema>
/** Resolve from the authorized host context, never from the dashboard's business identity. */
export function dashboardNavigationTarget(context: XpertResolvedViewHostContext): DashboardNavigationTarget {
  if (context.hostType !== 'agent') throw new Error('DASHBOARD_HOST_UNSUPPORTED')
  return {
    target: 'workbench.view',
    viewKey: DASHBOARD_VIEW_KEY
  } as const satisfies WorkbenchNavigationOpenPayload
}
export const dashboardNavigationSchema = z.object({
  selectionId: z.string().uuid().optional(),
  page: z.number().int().positive().optional(), pageSize: z.number().int().min(1).max(100).optional(),
  parameters: z.object({ pipelineInstanceId: z.string().uuid().optional(), pipelineRoundId: z.string().uuid().optional(), pipelineNodeId: z.string().uuid().optional(), contentProvider: z.string().optional(), contentId: z.string().uuid().optional(), contentTitle: z.string().optional(), contentEditor: z.string().optional(), artifactId: z.string().uuid().optional(), versionId: z.string().uuid().optional(), newDashboard: z.boolean().optional(), picker: z.literal('dashboards').optional(), draftRevision: z.number().int().positive().optional(), mode: z.enum(['published', 'draft']).optional() }).strict().optional()
}).transform((query, ctx) => {
  const artifactId = query.selectionId ?? query.parameters?.artifactId
  const versionId = query.parameters?.versionId
  if (query.parameters?.newDashboard && artifactId || query.selectionId && query.parameters?.artifactId && query.selectionId !== query.parameters.artifactId || versionId && !artifactId)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'DASHBOARD_NAVIGATION_INVALID: provide one Artifact identity and an optional version' })
  return { artifactId, versionId, ...(query.parameters?.draftRevision ? { draftRevision: query.parameters.draftRevision } : {}), ...(query.page ? { page: query.page } : {}), ...(query.pageSize ? { pageSize: query.pageSize } : {}),
    ...(query.parameters?.mode ? { mode: query.parameters.mode } : {}), ...(query.parameters?.picker ? { picker: query.parameters.picker } : {}), ...(query.parameters?.newDashboard ? { newDashboard: true } : {}) }
})
export type DashboardNavigation = z.infer<typeof dashboardNavigationSchema>
export const dashboardNavigationKey = (target: DashboardNavigation) => JSON.stringify([target.artifactId ?? null, target.versionId ?? null, target.newDashboard ?? false, target.mode ?? null, target.draftRevision ?? null, target.picker ?? null])
