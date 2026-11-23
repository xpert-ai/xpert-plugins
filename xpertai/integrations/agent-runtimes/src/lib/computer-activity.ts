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

type JsonlActivityCollection =
  | { status: 'collected'; events: unknown[]; gap: boolean }
  | { status: 'incomplete'; reason: 'source_changed' | 'invalid_page' | 'capture_limit' }
  | { status: 'unavailable' }

export async function collectJsonlActivity(
  context: AgentRuntimeContext,
  handle: AgentRuntimeHandle,
  provider: JsonlActivityProtocol,
  terminal: boolean
): Promise<JsonlActivityCollection> {
  if (!handle.runner) return { status: 'unavailable' }
  const runner = context.capabilities.require(AgentExecutionRunnerCapability)
  let checkpoint = await context.activity?.readCheckpoint().catch(() => undefined)
  let committed = parseCursor(checkpoint?.sourceCursor)
  let sourceId = committed?.sourceId
  let offset = terminal ? 0 : (committed?.offset ?? 0)
  const all: unknown[] = []
  let gap = false
  try {
    for (let count = 0; count < 1000; count++) {
      const parsed = pageSchema.safeParse(await runner.request(handle.runner, { method: 'GET', path: `/events/${offset}` }))
      if (!parsed.success) {
        await appendActivities(context, [], terminal, ['source_lost'])
        return { status: 'incomplete', reason: 'invalid_page' }
      }
      const page = parsed.data
      if (sourceId && page.sourceId !== sourceId) {
        await appendActivities(context, [], terminal, ['source_lost'])
        return { status: 'incomplete', reason: 'source_changed' }
      }
      sourceId = page.sourceId
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
        return { status: 'collected', events: all, gap }
      }
      if (page.next <= offset) {
        await appendActivities(context, [], terminal, ['source_lost'])
        return { status: 'incomplete', reason: 'invalid_page' }
      }
      offset = page.next
    }
    await appendActivities(context, [], terminal, ['capture_limit'])
    return { status: 'incomplete', reason: 'capture_limit' }
  } catch {
    // A transport interruption does not establish a missing protocol event. Keep the
    // ledger open so the next inspection can recover the same source and cursor.
    return { status: 'unavailable' }
  }
}
