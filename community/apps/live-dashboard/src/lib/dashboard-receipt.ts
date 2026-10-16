import { z } from 'zod/v3'

const receiptSchema = z.object({ dashboard: z.object({ artifactId: z.string().uuid(), versionId: z.string().uuid() }) })
/** Tool start/failed logs can share the host event channel; only a saved receipt opens a View. */
export function createdDashboard(output: unknown) {
  let value = output
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { return null }
  }
  const parsed = receiptSchema.safeParse(value)
  return parsed.success ? parsed.data.dashboard : null
}
