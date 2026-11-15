import * as runtimeSdk from '@xpert-ai/plugin-sdk'
import {
  agentOutputDeliverySchema,
  agentTaskResultSchema,
  type AgentTaskResult,
  type AgentTaskResultFile,
  type AgentInvocationResult,
  type AgentOutputDelivery
} from '@xpert-ai/plugin-sdk'

// File submission is optional. Namespace access keeps older SDK releases loadable for the inline protocol.
const taskResultFileSchema = runtimeSdk.agentTaskResultFileSchema

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

/** Resolve only an explicit final reference, never scan a workspace or tool output for reports. */
export async function resolveTaskResult(
  text: string,
  delivery: AgentOutputDelivery,
  readFile?: (reference: AgentTaskResultFile) => Promise<AgentTaskResult>,
  maxInlineChars?: number
): Promise<AgentInvocationResult> {
  // Recognize the complete submission before applying a provider's legacy prose limit.
  // Truncation must not hide a malformed reference or turn a suffix into a new file submission.
  if (!text.trim().startsWith('```xpert-task-result-file'))
    return taskResult(maxInlineChars === undefined ? text : text.slice(-maxInlineChars), delivery)
  try {
    const match = /^```xpert-task-result-file\s*\n([\s\S]*?)\n```$/.exec(text.trim())
    if (!match || !readFile || !taskResultFileSchema) throw new Error('Unsupported result file submission')
    const reference = taskResultFileSchema.parse(JSON.parse(match[1]))
    const result = agentTaskResultSchema.parse(await readFile(reference))
    return {
      text: result.summary,
      items: result.items,
      export: { mode: delivery.mode, status: delivery.mode === 'none' ? 'not_requested' : 'unavailable' }
    }
  } catch {
    // Do not leak file contents or a validator's rejected values into the task error.
    throw new Error('Task result file could not be validated. Check host support, relative path, SHA-256 and envelope schema; the authored report was not changed.')
  }
}

export function resultInstructions(delivery: AgentOutputDelivery, resultFile = false): string {
  return `${resultFile && taskResultFileSchema
    ? `Final response protocol: when file-writing tools are available, prefer writing the complete result envelope below to a UTF-8 JSON file, using a JSON encoder. Then compute SHA-256 over its exact bytes and return only this reference:
\`\`\`xpert-task-result-file
{"version":1,"path":"output/result-envelope.json","sha256":"<64 lowercase hex characters>"}
\`\`\`
The host supports result-file submission v1 (maximum 4 MiB). Do not retype the file's JSON in your final response. File presence or tool stdout alone does not submit it. The host reads only the final reference, validates the digest and envelope, and checkpoints the result. This does not change review criteria or requested file exports. The inline xpert-task-result format remains supported.`
    : 'Final response protocol: return a single fenced xpert-task-result JSON block, with no text outside it.'}
Schema: {"version":1,"summary":"actual overall result in the user's language","items":[...]}
Task-specific summary requirements are mandatory: include complete source/test code when requested. If the task requires a JSON-encoded structured report in summary, use that JSON string exactly instead of a prose summary. Do not replace required evidence with a claim that files exist.
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
