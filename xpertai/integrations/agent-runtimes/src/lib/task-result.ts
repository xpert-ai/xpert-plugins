import {
  agentOutputDeliverySchema,
  agentTaskResultSchema,
  type AgentInvocationResult,
  type AgentOutputDelivery
} from '@xpert-ai/plugin-sdk'

export function outputDelivery(value: unknown): AgentOutputDelivery {
  return value === undefined ? { mode: 'none' } : agentOutputDeliverySchema.parse(value)
}

/** Only the explicit versioned envelope is structured output; arbitrary prose stays prose. */
export function taskResult(text: string, delivery: AgentOutputDelivery = { mode: 'none' }): AgentInvocationResult {
  const output: AgentInvocationResult = {
    text,
    export: { mode: delivery.mode, status: delivery.mode === 'none' ? 'not_requested' : 'unavailable' }
  }
  const trimmed = text.trim()
  const match = /^```(?:xpert-task-result|json)\s*\n([\s\S]*?)\n```$/.exec(trimmed)
  const candidate = match?.[1] ?? (trimmed.startsWith('{') && trimmed.endsWith('}') ? trimmed : undefined)
  if (!candidate) return output
  try {
    const parsed = agentTaskResultSchema.safeParse(JSON.parse(candidate))
    if (parsed.success) return { ...output, text: parsed.data.summary, items: parsed.data.items }
  } catch {
    /* Preserve unstructured output when a provider does not follow the contract. */
  }
  return output
}

export function resultInstructions(delivery: AgentOutputDelivery): string {
  return `Final response protocol: return a single fenced xpert-task-result JSON block, with no text outside it.
Schema: {"version":1,"summary":"actual overall result in the user's language","items":[...]}
Each item needs a unique short id, title and summary. Supported item types:
- {"type":"analysis","id":"review","title":"...","summary":"..."} for findings or explanations.
- {"type":"changes","id":"changes","title":"...","summary":"...","files":[{"path":"relative/file.py","change":"created|modified|deleted"}]} for code changes.
- {"type":"tests","id":"tests","title":"...","summary":"actual test output","status":"passed|failed|skipped","command":"command actually run"} for tests/checks. Do not claim unrun tests passed.
- {"type":"file","id":"report","title":"...","summary":"...","path":"relative/file.txt"} ONLY for explicit deliverable files; changed source files are not automatically deliverables.
Paths must be individual files relative to this task's working directory, without .. or absolute paths. Never include caches, credentials, dependency trees or unrelated files. No invented artifact IDs, platform URLs, or file references.
Requested delivery: ${JSON.stringify(
    delivery
  )}. With mode none, leave files in place and report findings/changes/tests; do not package them. With files, declare only requested deliverables. With archive, declare the requested input files; the platform packages them. Do not create an archive yourself unless creating an archive is the actual task.
Only report verified results; the platform independently validates and exports requested files.`
}
