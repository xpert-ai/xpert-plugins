// Only public protocol fields cross this boundary. Reasoning/system/config events are never projected.
import { z } from 'zod'
import type { ExecutionActivityItem } from '@xpert-ai/contracts'
import type { AgentRuntimeContext } from '@xpert-ai/plugin-sdk'

const limit = (value: string | undefined) => value?.slice(0, 65536)
const outputLimit = 2 * 1024 * 1024
const capturedOutput = (value: string) => value.slice(0, outputLimit)
const input = z
  .object({
    command: z.string().optional(),
    workdir: z.string().optional(),
    file_path: z.string().optional(),
    filePath: z.string().optional(),
    path: z.string().optional(),
    pattern: z.string().optional(),
    old_string: z.string().optional(),
    new_string: z.string().optional(),
    content: z.string().optional()
  })
  .strip()
const block = z
  .object({
    type: z.string(),
    id: z.string().optional(),
    name: z.string().optional(),
    text: z.string().optional(),
    input: input.optional(),
    tool_use_id: z.string().optional(),
    is_error: z.boolean().optional(),
    content: z.union([z.string(), z.array(z.object({ type: z.string(), text: z.string().optional() }))]).optional()
  })
  .strip()
const qwen = z
  .object({
    type: z.string(),
    uuid: z.string().optional(),
    message: z.object({ id: z.string().optional(), content: z.array(block) }).optional()
  })
  .strip()
const codex = z
  .object({
    type: z.string(),
    item: z
      .object({
        id: z.string(),
        type: z.string(),
        text: z.string().optional(),
        command: z.string().optional(),
        aggregated_output: z.string().optional(),
        exit_code: z.number().int().nullable().optional(),
        status: z.string().optional(),
        changes: z.array(z.object({ path: z.string(), kind: z.string() })).optional()
      })
      .optional()
  })
  .strip()
type Content = ExecutionActivityItem['content']

export function jsonlActivities(
  provider: 'qwen' | 'codex',
  events: unknown[],
  offset: string
): ExecutionActivityItem[] {
  const items: ExecutionActivityItem[] = []
  events.forEach((raw, index) => {
    if (provider === 'codex') {
      const parsed = codex.safeParse(raw)
      if (!parsed.success || !['item.started', 'item.updated', 'item.completed'].includes(parsed.data.type)) return
      const item = parsed.data.item
      if (!item) return
      const id = `codex:${item.id}`
      if (item.type === 'agent_message' && item.text)
        items.push({ id, content: { kind: 'message', text: limit(item.text)! } })
      if (item.type === 'command_execution' && item.command)
        items.push({
          id,
          content: {
            kind: 'tool',
            name: 'command',
            status:
              item.status === 'in_progress'
                ? 'running'
                : item.status === 'completed' && (item.exit_code == null || item.exit_code === 0)
                  ? 'succeeded'
                  : 'failed',
            ...(item.aggregated_output !== undefined
              ? {
                  output: capturedOutput(item.aggregated_output),
                  truncated: item.aggregated_output.length > outputLimit
                }
              : {}),
            detail: {
              type: 'command',
              command: limit(item.command)!,
              outputMode: 'merged',
              ...(item.exit_code != null ? { exitCode: item.exit_code } : {})
            }
          }
        })
      if (item.type === 'file_change' && item.changes)
        items.push({
          id,
          content: {
            kind: 'tool',
            name: 'file_change',
            status: item.status === 'completed' ? 'succeeded' : item.status === 'failed' ? 'failed' : 'running',
            detail: {
              type: 'file_change',
              files: item.changes
                .slice(0, 100)
                .map((file) => ({
                  path: file.path,
                  change:
                    file.kind === 'add'
                      ? 'created'
                      : file.kind === 'delete'
                        ? 'deleted'
                        : file.kind === 'update'
                          ? 'modified'
                          : 'reported'
                }))
            }
          }
        })
      return
    }
    const parsed = qwen.safeParse(raw)
    if (!parsed.success || !['assistant', 'user'].includes(parsed.data.type)) return
    const event = parsed.data
    event.message?.content.forEach((part, blockIndex) => {
      if (event.type === 'assistant' && part.type === 'text' && part.text)
        items.push({
          id: `qwen:${event.uuid ?? event.message?.id ?? `${offset}:${index}`}:${blockIndex}`,
          content: { kind: 'message', text: limit(part.text)! }
        })
      if (part.type === 'tool_use' && part.id && part.name) {
        const detail = toolDetail(part.name, part.input)
        items.push({
          id: `qwen:tool:${part.id}`,
          content: {
            kind: 'tool',
            name: part.name,
            status: 'running',
            input: limit(JSON.stringify(part.input ?? {})),
            ...(detail ? { detail } : {})
          }
        })
      }
      if (part.type === 'tool_result' && part.tool_use_id) {
        const output =
          typeof part.content === 'string'
            ? part.content
            : (part.content
                ?.filter((item) => item.type === 'text')
                .map((item) => item.text ?? '')
                .join('\n') ?? '')
        // Qwen 0.24.7 emits this explicit tool-result trailer when it truncates
        // output upstream. The private CLI scratch path is not a public file link.
        const upstreamTruncation = /\nOutput too long and was saved to: [^\n]+\.output\s*$/.test(output)
        const publicOutput = upstreamTruncation
          ? output.replace(/\nOutput too long and was saved to: [^\n]+\.output\s*$/, '\n[CLI output truncated]')
          : output
        items.push({
          id: `qwen:tool:${part.tool_use_id}`,
          content: {
            kind: 'tool',
            status: part.is_error ? 'failed' : 'succeeded',
            output: capturedOutput(publicOutput),
            truncated: upstreamTruncation || output.length > outputLimit
          }
        })
      }
    })
  })
  return items
}

function toolDetail(name: string, value?: z.infer<typeof input>): Extract<Content, { kind?: 'tool' }>['detail'] {
  if (['run_shell_command', 'bash', 'shell'].includes(name) && value?.command)
    return {
      type: 'command',
      command: limit(value.command)!,
      outputMode: 'merged',
      ...(value.workdir ? { cwd: value.workdir } : {})
    }
  const path = value?.file_path ?? value?.filePath
  if (['write_file', 'edit', 'write'].includes(name) && path)
    return { type: 'file_change', files: [{ path, change: 'reported' }] }
  return undefined
}

const openMessage = z.object({
  info: z.object({ id: z.string(), parentID: z.string().optional(), role: z.string() }),
  parts: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      text: z.string().optional(),
      tool: z.string().optional(),
      callID: z.string().optional(),
      state: z
        .object({
          status: z.string(),
          input: input.optional(),
          output: z.string().optional(),
          error: z.string().optional(),
          metadata: z
            .object({ exit: z.number().int().optional(), diff: z.string().optional(), output: z.string().optional() })
            .optional()
        })
        .optional()
    })
  )
})
export function openCodeActivities(raw: unknown, runId: string): ExecutionActivityItem[] {
  const parsed = z.array(openMessage).safeParse(raw)
  if (!parsed.success) return []
  return parsed.data
    .filter((message) => message.info.role === 'assistant' && message.info.parentID === runId)
    .flatMap((message) =>
      message.parts.flatMap((part): ExecutionActivityItem[] => {
        const id = `opencode:${part.id}`
        if (part.type === 'text' && part.text) return [{ id, content: { kind: 'message', text: limit(part.text)! } }]
        if (part.type !== 'tool' || !part.state || !part.tool) return []
        let detail = toolDetail(part.tool, part.state.input)
        if (detail?.type === 'command' && part.state.metadata?.exit !== undefined)
          detail = { ...detail, exitCode: part.state.metadata.exit }
        if (detail?.type === 'file_change' && part.state.metadata?.diff)
          detail = {
            ...detail,
            files: detail.files.map((file) => ({ ...file, patch: limit(part.state!.metadata!.diff) }))
          }
        const output = part.state.output ?? part.state.error ?? part.state.metadata?.output
        return [
          {
            id,
            content: {
              kind: 'tool',
              name: part.tool,
              status:
                part.state.status === 'completed' ? 'succeeded' : part.state.status === 'error' ? 'failed' : 'running',
              input: limit(JSON.stringify(part.state.input ?? {})),
              ...(output !== undefined
                ? { output: capturedOutput(output), truncated: output.length > outputLimit }
                : {}),
              ...(detail ? { detail } : {})
            }
          }
        ]
      })
    )
}

/** Presentation failures never replace the actual runtime result. */
export async function appendActivities(
  context: AgentRuntimeContext,
  items: ExecutionActivityItem[],
  complete = false,
  gaps: Array<'source_truncated' | 'storage_unavailable' | 'source_lost' | 'interrupted' | 'capture_limit'> = []
) {
  if (!context.activity) return
  try {
    for (let offset = 0; offset < items.length; offset += 100)
      await context.activity.append({ items: items.slice(offset, offset + 100) })
    await context.activity.append({ items: [], complete, gaps })
  } catch {
    try {
      await context.activity.append({ items: [], complete, gaps: ['storage_unavailable'] })
    } catch {
      /* keep result independent */
    }
  }
}
