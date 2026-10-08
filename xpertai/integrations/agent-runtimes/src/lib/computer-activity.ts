import { z } from 'zod'
import { AgentExecutionRunnerCapability, type AgentRuntimeContext, type AgentRuntimeHandle } from '@xpert-ai/plugin-sdk'
import { jsonlActivities, appendActivities, type JsonlActivityProtocol } from './activity.js'

const pageSchema = z.object({
  sourceId: z.string().uuid(),
  events: z.array(z.unknown()).max(50),
  positions: z.array(z.number().int().nonnegative()),
  next: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  gap: z.boolean()
})
const cursorSchema = z.object({ sourceId: z.string().uuid(), offset: z.number().int().nonnegative() })
function parseCursor(value?: string) {
  try {
    return cursorSchema.parse(JSON.parse(value ?? 'null'))
  } catch {
    return undefined
  }
}

export async function collectJsonlActivity(
  context: AgentRuntimeContext,
  handle: AgentRuntimeHandle,
  provider: JsonlActivityProtocol,
  terminal: boolean
) {
  if (!handle.runner) return undefined
  const runner = context.capabilities.require(AgentExecutionRunnerCapability)
  let checkpoint = await context.activity?.readCheckpoint().catch(() => undefined)
  let committed = parseCursor(checkpoint?.sourceCursor)
  let offset = terminal ? 0 : (committed?.offset ?? 0)
  const all: unknown[] = []
  let gap = false
  try {
    for (let count = 0; count < 1000; count++) {
      const page = pageSchema.parse(await runner.request(handle.runner, { method: 'GET', path: `/events/${offset}` }))
      if (committed && page.sourceId !== committed.sourceId) throw Error('Activity source was replaced')
      gap ||= page.gap
      if (terminal) all.push(...page.events)
      if (context.activity && page.next > (committed?.offset ?? 0)) {
        const items = page.events.flatMap((event, index) =>
          jsonlActivities(provider, [event], String(page.positions[index]))
        )
        try {
          // A source page and its checkpoint are one transaction. Competing inspections
          // cannot replay an older start event over a completed tool.
          checkpoint = await context.activity.append({
            items: items.slice(0, 100),
            sourceCursor: JSON.stringify({ sourceId: page.sourceId, offset: page.next }),
            expectedSourceCursor: checkpoint?.sourceCursor ?? '',
            gaps: [
              ...(gap ? ['source_truncated' as const] : []),
              ...(items.length > 100 ? ['capture_limit' as const] : [])
            ]
          })
          committed = parseCursor(checkpoint.sourceCursor)
        } catch {
          await appendActivities(context, [], false, ['storage_unavailable'])
        }
      }
      if (!page.hasMore) {
        if (terminal) await appendActivities(context, [], true, gap ? ['source_truncated'] : [])
        return { events: all, gap }
      }
      if (page.next <= offset) throw Error('Invalid activity cursor')
      offset = page.next
    }
    await appendActivities(context, [], terminal, ['capture_limit'])
  } catch {
    await appendActivities(context, [], terminal, ['source_lost'])
  }
  return undefined
}
