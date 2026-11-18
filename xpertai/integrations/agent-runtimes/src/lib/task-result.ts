import { createHash } from 'node:crypto'
import { agentOutputDeliverySchema, AGENT_TASK_REPORT_MAX_BYTES,
  type AgentInvocationResult, type AgentOutputDelivery, type AgentTaskReport } from '@xpert-ai/plugin-sdk'

export function outputDelivery(value: unknown): AgentOutputDelivery {
  return value === undefined ? { mode: 'none' } : agentOutputDeliverySchema.parse(value)
}

/** Keep a bounded overflow marker so oversized output fails delivery instead of silently losing its beginning. */
export function appendReportText(current: string, next: string): string {
  if (Buffer.byteLength(current) > AGENT_TASK_REPORT_MAX_BYTES) return current
  const combined = current + next
  return Buffer.byteLength(combined) > AGENT_TASK_REPORT_MAX_BYTES
    ? Buffer.from(combined).subarray(0, AGENT_TASK_REPORT_MAX_BYTES + 1).toString('utf8') : combined
}

/** Ordinary replies have no report requirement. Never present bounded overflow as complete text. */
export function taskResult(text: string, delivery: AgentOutputDelivery = { mode: 'none' }): AgentInvocationResult {
  const textTruncated = Buffer.byteLength(text) > AGENT_TASK_REPORT_MAX_BYTES
  return {
    text: delivery.reportPath || textTruncated ? '' : text,
    ...(delivery.reportPath
      ? { report: { status: 'failed' as const, path: delivery.reportPath, code: 'report_unavailable' as const } }
      : textTruncated ? { textTruncated: true } : {}),
    export: { mode: delivery.mode, status: delivery.mode === 'none' ? 'not_requested' : 'unavailable' }
  }
}

/** Read only the report path selected before launch. No workspace scan or JSON-in-Markdown parsing. */
export async function resolveTaskResult(text: string, delivery: AgentOutputDelivery,
  readFile?: (path: string) => Promise<AgentTaskReport>): Promise<AgentInvocationResult> {
  if (!delivery.reportPath) return taskResult(text, delivery)
  const path = delivery.reportPath
  try {
    if (!readFile) throw new Error('Report reading is unavailable')
    const report = await readFile(path)
    const code = !report.text.trim() ? 'report_empty'
      : Buffer.byteLength(report.text) > AGENT_TASK_REPORT_MAX_BYTES ? 'report_too_large' : undefined
    return {
      text: code ? '' : report.text,
      report: code ? { status: 'failed', path, code }
        : { status: 'completed', path, sha256: createHash('sha256').update(report.text).digest('hex') },
      export: { mode: delivery.mode, status: delivery.mode === 'none' ? 'not_requested' : 'unavailable' }
    }
  } catch {
    return { text: '', report: { status: 'failed', path, code: 'report_unavailable' },
      export: { mode: delivery.mode, status: delivery.mode === 'none' ? 'not_requested' : 'unavailable' } }
  }
}

export function deliveryPaths(delivery: AgentOutputDelivery): string[] {
  if (delivery.mode === 'none') return []
  return [...new Set([...(delivery.paths ?? []), ...(delivery.reportPath ? [delivery.reportPath] : [])])]
}

export function resultInstructions(delivery: AgentOutputDelivery): string {
  return [
    ...(delivery.reportPath ? [
      `Write the requested report as UTF-8 Markdown at ${JSON.stringify(delivery.reportPath)}, relative to this task working directory. The runner collects that exact file; no fixed headings, JSON envelope, platform IDs or calculated digest are required.`
    ] : []),
    ...(delivery.mode !== 'none' ? [
      `Requested artifact delivery: ${JSON.stringify(delivery)}. Only explicitly selected files are exported. Identify additional filenames in your reply if needed for collection. Do not invent artifact IDs or download URLs. Keep credentials and caches out of deliverables.`
    ] : [])
  ].join('\n\n')
}
