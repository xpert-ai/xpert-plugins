import { z } from 'zod/v3'
import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'

export const dashboardSelectionSchema = z.object({ schemaVersion: z.literal(1), artifactId: z.string().uuid(),
  versionId: z.string().uuid().optional(), draftRevision: z.number().int().positive().optional() }).strict()
const newSelection = z.object({ schemaVersion: z.literal(1), mode: z.literal('new') }).strict()
export const dashboardContextSchema = z.object({ live_dashboard: z.union([dashboardSelectionSchema, newSelection]).nullable().optional() })
export type DashboardSelection = z.infer<typeof dashboardSelectionSchema>
export const dashboardStateSchema = z.object({ dashboardEditing: z.object({
  scope: z.string(), target: dashboardSelectionSchema.nullable()
}).nullable().optional() })

/** Checkpoints belong to an actor and conversation. Copied state must never choose another user's target. */
export function editingSession(context: IAgentMiddlewareContext) {
  const scope = JSON.stringify([context.tenantId, context.organizationId, context.userId, context.xpertId,
    context.projectId, context.conversationId, context.threadId, context.agentKey])
  let active: DashboardSelection | null = null
  let initialized = false
  return {
    current: () => active,
    resolve(config: unknown) { return initialized ? active : selectionFromConfig(config) ?? active },
    restore(state: unknown, requestContext: unknown) {
      const persisted = dashboardStateSchema.safeParse(state)
      const selected = selectionFromContext(requestContext)
      active = selected !== undefined ? selected : persisted.success && persisted.data.dashboardEditing?.scope === scope
        ? persisted.data.dashboardEditing.target : null
      initialized = true
      return { dashboardEditing: { scope, target: active } }
    },
    select(target: DashboardSelection | null) { active = target; initialized = true; return { dashboardEditing: { scope, target } } }
  }
}

export function selectionFromContext(value: unknown): DashboardSelection | null | undefined {
  if (value === undefined || value === null) return undefined
  const parsed = dashboardContextSchema.safeParse(value)
  if (!parsed.success) throw new Error('DASHBOARD_SELECTION_INVALID: select the dashboard again before editing')
  if (parsed.data.live_dashboard === undefined) return undefined
  const selected = parsed.data.live_dashboard
  return selected && 'artifactId' in selected ? selected : null
}

export function selectionFromConfig(value: unknown) {
  const config = z.object({ context: z.unknown(),
    configurable: z.object({ context: z.unknown() }).optional() }).safeParse(value)
  if (!config.success) return undefined
  const primary = selectionFromContext(config.data.context)
  return primary !== undefined ? primary : selectionFromContext(config.data.configurable?.context)
}
