import { createHash } from 'node:crypto'
import {
  agentOutputDeliverySchema,
  AGENT_TASK_REPORT_MAX_BYTES,
  type AgentTaskReport,
  type AgentInvocationResult,
  type AgentOutputDelivery
} from '@xpert-ai/plugin-sdk'

/** Keep a bounded overflow marker so oversized output fails delivery instead of silently losing its beginning. */
export function appendReportText(current: string, next: string): string {
  if (Buffer.byteLength(current) > AGENT_TASK_REPORT_MAX_BYTES) return current
  const combined = current + next
  return Buffer.byteLength(combined) > AGENT_TASK_REPORT_MAX_BYTES
    ? Buffer.from(combined).subarray(0, AGENT_TASK_REPORT_MAX_BYTES + 1).toString('utf8') : combined
}

const MAX_REPLY_BYTES = 2 * 1024 * 1024

export function outputDelivery(value: unknown): AgentOutputDelivery {
  return value === undefined ? { mode: 'none' } : agentOutputDeliverySchema.parse(value)
}

/** Reply text is evidence, not an envelope or a model-selected file authorization. */
export function taskResult(text: string, delivery: AgentOutputDelivery = { mode: 'none' }, maxBytes = MAX_REPLY_BYTES): AgentInvocationResult {
  const output: AgentInvocationResult = {
    text: Buffer.byteLength(text) > maxBytes ? '' : text,
    ...(Buffer.byteLength(text) > maxBytes ? { textTruncated: true } : {}),
    export: { mode: delivery.mode, status: delivery.mode === 'none' ? 'not_requested' : 'unavailable' }
  }
  if (delivery.reportPath) {
    output.text = ''
    delete output.textTruncated
    output.report = { status: 'failed', path: delivery.reportPath, code: 'report_unavailable' }
  }
  return output
}

/** Only the caller-pinned report path is read, after verified process completion. */
export async function resolveTaskResult(
  text: string,
  delivery: AgentOutputDelivery,
  readFile?: (path: string) => Promise<AgentTaskReport>,
  maxInlineBytes = MAX_REPLY_BYTES
): Promise<AgentInvocationResult> {
  const result = taskResult(text, delivery, maxInlineBytes)
  if (!delivery.reportPath || !readFile) return result
  try {
    const report = await readFile(delivery.reportPath)
    const code = !report.text.trim() ? 'report_empty'
      : Buffer.byteLength(report.text) > AGENT_TASK_REPORT_MAX_BYTES ? 'report_too_large' : undefined
    result.text = code ? '' : report.text
    result.report = code ? { status: 'failed', path: delivery.reportPath, code }
      : { status: 'completed', path: delivery.reportPath, sha256: createHash('sha256').update(report.text).digest('hex') }
  } catch {
    // Preserve execution completion; report delivery can be recovered by the host without relaunching.
    result.report = { status: 'failed', path: delivery.reportPath, code: 'report_unavailable' }
  }
  return result
}

/** Deliverables are selected by the caller, never inferred from provider prose. */
export function deliveryPaths(delivery: AgentOutputDelivery): string[] {
  if (delivery.mode === 'none') return []
  return [...new Set([...(delivery.paths ?? []), ...(delivery.reportPath ? [delivery.reportPath] : [])])]
}

export function resultInstructions(delivery: AgentOutputDelivery, reportReader = false): string {
  return [
    'Return the requested result in the user\'s language. Preserve task-specific evidence and formatting requirements. Ordinary tasks do not require an outer JSON envelope, report file or artifact export. Do not invent platform identifiers or download links. Report only checks actually run.',
    ...(delivery.reportPath ? [
      `The caller selected this exact report path (JSON string): ${JSON.stringify(delivery.reportPath)}. Write the complete assessment as UTF-8 Markdown at that path, relative to the assigned working directory. Do not wrap it in a result envelope or compute a digest. The host records report identity and SHA-256; maximum report size is 4 MiB.`,
      reportReader ? 'The host reads the selected report only after verified execution completion.'
        : 'This runtime cannot transfer the selected report. State this delivery limitation; do not claim the report was delivered.'
    ] : []),
    `Requested delivery: ${JSON.stringify(delivery)}. With mode none, do not package files. With files or archive, create only requested deliverables; the host collects explicitly selected paths and packages archives. If paths were not selected, report their exact relative paths to the coordinator for delivery recovery. File presence or tool output does not prove task completion.`
  ].join('\n')
}
