import { isToolMessage, type BaseMessage } from '@langchain/core/messages'
import { z } from 'zod/v3'
import { DASHBOARD_MUTATION_TOOLS } from './dashboard-receipt'

const savedCard = z.object({
  dashboard: z.object({ artifactId: z.string().uuid(), title: z.string().optional(), draftRevision: z.number().int().positive(), status: z.literal('draft') }),
  resourceCard: z.object({ status: z.enum(['emitted', 'unavailable']) })
})
const openedDraft = z.object({ artifactId: z.string().uuid(), state: z.literal('draft'), expectedRevision: z.number(), readVersionId: z.undefined() })

function output(content: BaseMessage['content']): unknown {
  if (typeof content !== 'string') return null
  try { return JSON.parse(content) } catch { return null }
}

/** Use this turn's actual delivery receipt, including after a checkpoint resume. */
export function dashboardDelivery(messages: BaseMessage[] = []) {
  let lastRead: z.infer<typeof openedDraft> | undefined
  let lastTool = true
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.getType() === 'human') break
    if (!isToolMessage(message)) continue
    if (lastTool && message.name === 'dashboard_open' && message.status !== 'error') {
      const read = openedDraft.safeParse(output(message.content))
      if (read.success) lastRead = read.data
    }
    lastTool = false
    if (message.status === 'error' || !message.name || !DASHBOARD_MUTATION_TOOLS.includes(message.name)) continue
    const result = savedCard.safeParse(output(message.content))
    if (!result.success) continue
    const { dashboard, resourceCard } = result.data
    return {
      guidance: `Draft ${dashboard.artifactId} revision ${dashboard.draftRevision} is saved. ` +
        (resourceCard.status === 'emitted'
          ? 'Its clickable Open card has already been delivered to this conversation. A request for an openable dashboard or a card is fulfilled by that delivery.'
          : 'Card delivery was unavailable. The saved dashboard is available in the Workbench picker.') +
        ' Reply with the result when this fulfills the request. Use editing tools only for outstanding changes.',
      verifiedDraft: resourceCard.status === 'emitted' && lastRead?.artifactId === dashboard.artifactId &&
        lastRead.expectedRevision === dashboard.draftRevision ? dashboard : undefined
    }
  }
  return null
}
