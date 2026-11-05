import { z } from 'zod/v3'

const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()])
export const sourceDatasetSchema = z.object({
  schema: z.literal('xpert.analytics.dataset'), datasetId: z.string(),
  fields: z.array(z.object({ id: z.string(), label: z.string().optional() }).passthrough()), rows: z.array(z.record(scalar)),
  completeness: z.object({ truncated: z.boolean(), returnedRows: z.number(), scope: z.string(), totalAccuracy: z.string() }).passthrough(),
  freshness: z.object({ sourceFetchedAt: z.string(), executedAt: z.string().optional(), dataAsOf: z.string().optional() }),
  provenance: z.object({ executionId: z.string(), bindingId: z.string(), providerId: z.string() }).passthrough()
}).passthrough()
export type SourceDataset = z.infer<typeof sourceDatasetSchema>
export interface SourceExecution {
  requestId: string
  state: 'running' | 'succeeded' | 'failed'
  controls: Record<string, string | number | boolean | null>
  requestedAt: string
  finishedAt?: string
  result?: SourceDataset
  resultControls?: SourceExecution['controls']
}
export type SourceEvent = { bindingId: string; requestId: string } & (
  { type: 'start'; controls: SourceExecution['controls']; at: string } |
  { type: 'success'; result: SourceDataset; at: string } |
  { type: 'failure'; at: string }
)
export function reduceSourceExecutions(state: Record<string, SourceExecution>, event: SourceEvent): Record<string, SourceExecution> {
  const previous = state[event.bindingId]
  if (event.type === 'start') return { ...state, [event.bindingId]: {
    requestId: event.requestId, state: 'running', controls: event.controls, requestedAt: event.at,
    result: previous?.result, resultControls: previous?.resultControls
  } }
  if (!previous || previous.requestId !== event.requestId) return state
  return { ...state, [event.bindingId]: { ...previous, state: event.type === 'success' ? 'succeeded' : 'failed', finishedAt: event.at,
    ...(event.type === 'success' ? { result: { ...event.result, rows: event.result.rows.slice(0, 50) }, resultControls: previous.controls } : {}) } }
}
