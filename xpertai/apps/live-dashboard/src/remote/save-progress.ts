import { z } from 'zod/v3'
import { requestHost } from './bridge'
const receipt = z.object({ artifactId: z.string().uuid(), draftRevision: z.number().int().positive() })
const progress = z.object({ requestId: z.string().uuid(), cursor: z.string(), terminal: z.boolean(), stage: z.string(), completed: z.number(), total: z.number(),
  dashboard: receipt.optional(), error: z.string().optional() })
export type SaveProgress = z.infer<typeof progress>

/** Short host calls observe durable work; closing a View does not cancel a submitted save. */
export async function waitForDashboardSave(value: unknown, onProgress: (value: SaveProgress) => void, signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('DASHBOARD_SAVE_OBSERVER_CLOSED')
  const direct = receipt.safeParse(value)
  if (direct.success) return direct.data
  let state = progress.parse(value)
  for (;;) {
    if (signal?.aborted) throw new Error('DASHBOARD_SAVE_OBSERVER_CLOSED')
    onProgress(state)
    if (state.terminal) {
      if (!state.dashboard) throw new Error(state.error ?? 'DASHBOARD_SAVE_VALIDATION_FAILED')
      return state.dashboard
    }
    const result = await requestHost('executeAction', { actionKey: 'save-wait', input: { requestId: state.requestId, cursor: state.cursor } })
    state = progress.parse(z.object({ success: z.literal(true), data: z.unknown() }).parse(result).data)
  }
}
