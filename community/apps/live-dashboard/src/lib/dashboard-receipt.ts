import { z } from 'zod/v3'

export const DASHBOARD_MUTATION_TOOLS = ['dashboard_create', 'dashboard_create_html', 'dashboard_update']
const receiptSchema = z.object({ dashboard: z.object({ artifactId: z.string().uuid(), draftRevision: z.number().int().positive(), status: z.literal('draft') }) })
/** Tool start/failed logs can share the host event channel; only a saved receipt opens a View. */
export function createdDashboard(output: unknown) {
  let value = output
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { return null }
  }
  const parsed = receiptSchema.safeParse(value)
  return parsed.success ? parsed.data.dashboard : null
}

export function savedDashboardSource(output: unknown) {
  let value = output
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { return null }
  }
  const parsed = z.object({ sourceFile: z.object({ path: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }) }).safeParse(value)
  return parsed.success ? parsed.data.sourceFile : null
}
