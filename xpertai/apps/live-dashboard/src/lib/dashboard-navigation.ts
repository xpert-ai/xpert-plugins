import { z } from 'zod/v3'
import type { WorkbenchNavigationOpenPayload, XpertResolvedViewHostContext } from '@xpert-ai/contracts'

// The host namespaces provider + local view key; cards use the resolved public key.
export const DASHBOARD_VIEW_KEY = 'live-dashboard__live-dashboard'
export const dashboardNavigationTargetSchema = z.discriminatedUnion('target', [
  z.object({ target: z.literal('workbench.view'), viewKey: z.literal(DASHBOARD_VIEW_KEY) }).strict(),
  z.object({ target: z.literal('assistant.project'), projectId: z.string().uuid(), viewKey: z.literal(DASHBOARD_VIEW_KEY) }).strict()
])
export type DashboardNavigationTarget = z.infer<typeof dashboardNavigationTargetSchema>
/** Resolve from the authorized host context, never from the dashboard's business identity. */
export function dashboardNavigationTarget(context: XpertResolvedViewHostContext): DashboardNavigationTarget {
  if (context.hostType !== 'agent' && context.hostType !== 'project') throw new Error('DASHBOARD_HOST_UNSUPPORTED')
  return {
    ...(context.hostType === 'project' ? { target: 'assistant.project', projectId: context.hostId } as const : { target: 'workbench.view' } as const),
    viewKey: DASHBOARD_VIEW_KEY
  } as const satisfies WorkbenchNavigationOpenPayload
}
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
