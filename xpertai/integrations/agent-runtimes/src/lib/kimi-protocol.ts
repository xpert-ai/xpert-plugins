// Kimi Code 2.1.1 prompt mode emits public messages and a resume marker after a completed turn.
// Its tool messages omit success/exit-code metadata; do not infer those facts from output prose.
import { z } from 'zod'
import type { ExecutionActivityItem } from '@xpert-ai/contracts'
import { completionFailure, type CompletionCheck } from './computer-completion.js'

const call = z.object({
  type: z.literal('function'),
  id: z.string().min(1),
  function: z.object({ name: z.string(), arguments: z.string() })
})
const event = z.discriminatedUnion('role', [
  z.object({ role: z.literal('assistant'), content: z.string().optional(), tool_calls: z.array(call).optional() }),
  z.object({ role: z.literal('tool'), tool_call_id: z.string().min(1), content: z.string() }),
  z.object({ role: z.literal('meta'), type: z.string(), session_id: z.string().optional() })
])
const toolInput = z
  .object({
    command: z.string().optional(),
    file_path: z.string().optional(),
    path: z.string().optional(),
    old_string: z.string().optional(),
    new_string: z.string().optional(),
    content: z.string().optional(),
    pattern: z.string().optional()
  })
  .strip()
const limit = (text: string) => text.slice(0, 65536)

export function kimiCompletion(raw: unknown[]): CompletionCheck {
  const parsed = z.array(event).safeParse(raw)
  if (!parsed.success) return completionFailure('protocol_invalid', 'Kimi returned an invalid public message stream.')
  const events = parsed.data
  const markers = events.filter((item) => item.role === 'meta' && item.type === 'session.resume_hint')
  if (markers.length > 1)
    return completionFailure('ambiguous_final_result', 'Kimi returned multiple session completion markers.')
  const pending = new Set<string>()
  for (const item of events) {
    if (item.role === 'assistant') for (const tool of item.tool_calls ?? []) pending.add(tool.id)
    if (item.role === 'tool' && !pending.delete(item.tool_call_id))
      return completionFailure('protocol_invalid', 'Kimi returned an unmatched tool result.')
  }
  const final = events.filter((item) => item.role !== 'meta').at(-1)
  const marker = events.at(-1)
  if (
    markers.length !== 1 ||
    marker?.role !== 'meta' ||
    marker.type !== 'session.resume_hint' ||
    !marker.session_id ||
    pending.size ||
    final?.role !== 'assistant' ||
    final.tool_calls?.length ||
    !final.content?.trim()
  )
    return completionFailure(
      'missing_final_result',
      'Kimi exited without a completed turn, final reply and session marker.'
    )
  return {
    ok: true,
    text: final.content,
    diagnostic: {
      code: 'completed',
      message: 'Kimi completed successfully.',
      finalEventType: 'session.resume_hint'
    }
  }
}

export function kimiActivities(raw: unknown[], offset: string): ExecutionActivityItem[] {
  return raw.flatMap((value, index): ExecutionActivityItem[] => {
    const parsed = event.safeParse(value)
    if (!parsed.success || parsed.data.role === 'meta') return []
    const item = parsed.data
    if (item.role === 'tool')
      return [
        {
          id: `kimi:tool:${item.tool_call_id}`,
          content: {
            kind: 'tool',
            status: 'unknown',
            output: item.content.slice(0, 2 * 1024 * 1024),
            truncated: item.content.length > 2 * 1024 * 1024
          }
        }
      ]
    const items: ExecutionActivityItem[] = item.content
      ? [{ id: `kimi:${offset}:${index}`, content: { kind: 'message', text: limit(item.content) } }]
      : []
    for (const tool of item.tool_calls ?? []) {
      let input: z.infer<typeof toolInput> | undefined
      try {
        input = toolInput.parse(JSON.parse(tool.function.arguments))
      } catch {
        /* retain the named call */
      }
      const path = input?.file_path ?? input?.path
      items.push({
        id: `kimi:tool:${tool.id}`,
        content: {
          kind: 'tool',
          name: tool.function.name,
          status: 'running',
          ...(input ? { input: limit(JSON.stringify(input)) } : {}),
          ...(tool.function.name === 'Bash' && input?.command
            ? { detail: { type: 'command', command: limit(input.command), outputMode: 'merged' } }
            : ['Write', 'Edit'].includes(tool.function.name) && path
            ? { detail: { type: 'file_change', files: [{ path, change: 'reported' }] } }
            : {})
        }
      })
    }
    return items
  })
}
