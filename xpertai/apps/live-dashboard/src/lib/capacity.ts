import { z } from 'zod/v3'

/** Storage compatibility is independent of the administrator's authoring policy. */
export const MAX_DASHBOARD_BINDINGS = 64
export const DEFAULT_DASHBOARD_BINDINGS = 32
export const DASHBOARD_CONFIG = 'live-dashboard.config'
export const dashboardConfigSchema = z.object({
  maxBindings: z.number().int().min(1).max(MAX_DASHBOARD_BINDINGS).default(DEFAULT_DASHBOARD_BINDINGS)
}).strict().default({})
export type DashboardConfig = z.infer<typeof dashboardConfigSchema>

export function assertBindingCapacity(count: number, previousCount = 0, limit = DEFAULT_DASHBOARD_BINDINGS) {
  if (count > MAX_DASHBOARD_BINDINGS || count > limit && count > previousCount)
    throw new Error(`DASHBOARD_BINDING_CAPACITY: ${count} bindings; authoring limit ${limit}, storage limit ${MAX_DASHBOARD_BINDINGS}. Reuse existing queries or increase the installation policy.`)
}
