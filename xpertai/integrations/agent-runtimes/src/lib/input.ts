import { z } from 'zod'
import type { AgentJson, AgentInvocationInput } from '@xpert-ai/plugin-sdk'

const json: z.ZodType<AgentJson> = z.lazy(() =>
  z.union([z.null(), z.boolean(), z.number().finite(), z.string(), z.array(json), z.record(json)])
)
export const ApprovalData = json.refine(
  (value) => Buffer.byteLength(JSON.stringify(value)) <= 32768,
  'Approval details exceed the review limit'
)

/** Forward explicit portable inputs; do not silently discard structured task context. */
export function agentPrompt(input: AgentInvocationInput): string {
  const text = [
    input.prompt,
    ...(input.parameters ? [`Task parameters (JSON):\n${JSON.stringify(input.parameters)}`] : []),
    ...(input.context ? [`Task context (JSON):\n${JSON.stringify(input.context)}`] : [])
  ].join('\n\n')
  if (Buffer.byteLength(text) > 1024 * 1024) throw new Error('Agent input exceeds the size limit')
  return text
}
