import { z } from 'zod/v3'
import { analyticsFieldSchema } from '@xpert-ai/plugin-sdk/analytics'

const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()])
export const sourceDatasetSchema = z.object({
  schema: z.literal('xpert.analytics.dataset'), datasetId: z.string(),
  fields: z.array(z.object({ id: z.string(), label: z.string().optional() }).passthrough()), rows: z.array(z.record(scalar)),
  completeness: z.object({ truncated: z.boolean(), returnedRows: z.number(), scope: z.string(), totalAccuracy: z.string() }).passthrough(),
  freshness: z.object({ sourceFetchedAt: z.string(), executedAt: z.string().optional(), dataAsOf: z.string().optional() }),
  provenance: z.object({ executionId: z.string(), bindingId: z.string(), providerId: z.string() }).passthrough()
}).passthrough()
export type SourceDataset = z.infer<typeof sourceDatasetSchema>
/** Rendering needs the complete typed contract; inspection deliberately accepts a smaller projection. */
export const renderDatasetSchema = sourceDatasetSchema.extend({
  fields: z.array(analyticsFieldSchema.required({ id: true, sourceField: true, label: true, logicalType: true, nullable: true, role: true })), grain: z.array(z.string()),
  completeness: z.object({ returnedRows: z.number(), totalRows: z.number().optional(), totalAccuracy: z.enum(['exact', 'estimated', 'unknown']),
    scope: z.enum(['full_query_result', 'page', 'sample', 'top_n']), truncated: z.boolean() }),
  freshness: z.object({ executedAt: z.string(), sourceFetchedAt: z.string(), dataAsOf: z.string().optional() })
})
export interface SourceExecution {
  requestId: string
  state: 'queued' | 'running' | 'succeeded' | 'failed'
  controls: Record<string, string | number | boolean | null>
  requestedAt: string
  startedAt?: string
  finishedAt?: string
  result?: SourceDataset
  resultControls?: SourceExecution['controls']
  previewEvicted?: boolean
}
export type SourceEvent = { bindingId: string; requestId: string } & (
  { type: 'queue' | 'start'; controls: SourceExecution['controls']; at: string } |
  { type: 'success'; result: SourceDataset; at: string } |
  { type: 'failure'; at: string }
)
export function reduceSourceExecutions(state: Record<string, SourceExecution>, event: SourceEvent): Record<string, SourceExecution> {
  const previous = state[event.bindingId]
  if (event.type === 'start' || event.type === 'queue') return { ...state, [event.bindingId]: {
    requestId: event.requestId, state: event.type === 'queue' ? 'queued' : 'running', controls: event.controls,
    requestedAt: previous?.requestId === event.requestId ? previous.requestedAt : event.at,
    ...(event.type === 'start' ? { startedAt: event.at } : {}),
    result: previous?.result, resultControls: previous?.resultControls
  } }
  if (!previous || previous.requestId !== event.requestId) return state
  const next = { ...state, [event.bindingId]: { ...previous, state: event.type === 'success' ? 'succeeded' as const : 'failed' as const, finishedAt: event.at,
    ...(event.type === 'success' ? { result: preview(event.result), resultControls: previous.controls, previewEvicted: false } : {}) } }
  // Limit inspection snapshots independently of the rendering result budget.
  const byAge = Object.values(next).filter(item => item.result).sort((a, b) => (a.finishedAt ?? '').localeCompare(b.finishedAt ?? ''))
  while (new TextEncoder().encode(JSON.stringify(Object.values(next).map(item => item.result ?? null))).byteLength > 2_000_000 && byAge.length) {
    const oldest = byAge.shift()!
    const id = Object.keys(next).find(id => next[id] === oldest)!
    next[id] = { ...oldest, result: undefined, resultControls: undefined, previewEvicted: true }
  }
  return next
}
function preview(result: SourceDataset): SourceDataset {
  const rows = result.rows.slice(0, 50)
  while (new TextEncoder().encode(JSON.stringify(rows)).byteLength > 64_000) rows.pop()
  return { ...result, rows }
}
