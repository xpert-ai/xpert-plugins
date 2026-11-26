import { AIMessage, isAIMessage, isHumanMessage, isToolMessage, type BaseMessage } from '@langchain/core/messages'
import type { ModelRequest } from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'
import { z } from 'zod/v3'
import { LIST_TOOL } from './constants.js'
import { ticketSchema, type Ticket } from './domain.js'
import { inboxIntent } from './inbox-intent.js'

const LIMIT = 10
const EXCERPT_LENGTH = 100

export const inboxInput = z
  .object({
    purpose: z.enum(['list', 'lookup']).optional().describe(
      'Set list for a simple inbox display. Set lookup for a further operation, filtering, counts, or a more detailed answer.',
    ),
  })
  .strict()

const itemSchema = ticketSchema.pick({ id: true, status: true, confirmedCategory: true }).extend({
  excerpt: z.string().min(1).max(EXCERPT_LENGTH * 2),
  truncated: z.boolean(),
})
const receiptSchema = z.object({ tickets: z.array(itemSchema).max(LIMIT), hasMore: z.boolean() })

export function inboxReceipt(tickets: Ticket[], hasMore: boolean) {
  return {
    tickets: tickets.slice(0, LIMIT).map(({ id, source, status, confirmedCategory }) => {
      const characters = Array.from(source)
      return {
        id, status, confirmedCategory,
        excerpt: characters.slice(0, EXCERPT_LENGTH).join(''),
        truncated: characters.length > EXCERPT_LENGTH,
      }
    }),
    hasMore: hasMore || tickets.length > LIMIT,
  }
}

const copy = {
  zh: {
    heading: (count: number) => `最近 ${count} 条反馈工单`,
    empty: '你的收件箱里还没有反馈工单。',
    more: '可在工作台查看更早的工单。',
    status: { draft: '待分析', processing: '分析中', review: '待确认', confirmed: '已确认', failed: '需重试' },
    category: { bug: '功能故障', usability: '使用体验', request: '功能需求', other: '其他' },
  },
  en: {
    heading: (count: number) => `Recent feedback tickets (${count})`,
    empty: 'Your feedback inbox is empty.',
    more: 'Earlier tickets are available in the workbench.',
    status: {
      draft: 'Unanalyzed', processing: 'Analyzing', review: 'Needs review',
      confirmed: 'Confirmed', failed: 'Retry needed',
    },
    category: { bug: 'Functional bug', usability: 'Usability', request: 'Feature request', other: 'Other' },
  },
}

// ChatKit renders Markdown. A fenced code span keeps customer text literal, including links and backticks.
function inlineExcerpt(text: string) {
  const runs = text.match(/`+/g) ?? []
  const fence = '`'.repeat(1 + Math.max(0, ...runs.map((run) => run.length)))
  return `${fence} ${text.replace(/\s+/gu, ' ').trim()} ${fence}`
}

export function inboxReply(messages: BaseMessage[], locale: string): string | null {
  const response = messages.at(-1)
  const request = messages.at(-2)
  if (!response || !request || !isToolMessage(response) || !isAIMessage(request)) return null
  const calls = request.tool_calls ?? []
  const call = calls[0]
  if (
    calls.length !== 1 || !call?.id || call.name !== LIST_TOOL || call.id !== response.tool_call_id ||
    response.name !== LIST_TOOL || response.status !== 'success' || typeof response.content !== 'string'
  ) {
    return null
  }
  const input = inboxInput.safeParse(call.args)
  if (!input.success || input.data.purpose !== 'list' || response.content.length > 16_000) return null

  let data: unknown
  try {
    data = JSON.parse(response.content)
  } catch {
    return null
  }
  const parsed = receiptSchema.safeParse(data)
  if (!parsed.success) return null
  const labels = /^zh/i.test(locale) ? copy.zh : copy.en
  const { tickets, hasMore } = parsed.data
  if (!tickets.length) return labels.empty

  const lines = tickets.map(({ id, status, confirmedCategory, excerpt, truncated }) => {
    const category = status === 'confirmed' && confirmedCategory ? ` · ${labels.category[confirmedCategory]}` : ''
    return `- \`${id.slice(0, 8)}\` **${labels.status[status]}${category}**　${inlineExcerpt(excerpt)}${truncated ? '…' : ''}`
  })
  return [labels.heading(tickets.length), lines.join('\n'), ...(hasMore ? [labels.more] : [])].join('\n\n')
}

/** Dispatch through the graph so the real registered tool performs authorization, retrieval and event reporting. */
export function inboxTurn(request: ModelRequest, preferredLanguage: string): AIMessage | null {
  if (
    (request.toolChoice && request.toolChoice !== 'auto') || request.requirements?.features?.length ||
    !request.tools.some((tool) => tool.name === LIST_TOOL)
  ) return null
  const last = request.messages.at(-1)
  if (!last) return null
  const afterTool = isToolMessage(last)
  const human = afterTool ? request.messages.at(-3) : last
  if (!human || !isHumanMessage(human)) return null
  const content = human.content
  const part = Array.isArray(content) && content.length === 1 ? content[0] : null
  const text = typeof content === 'string' ? content : part?.type === 'text' ? part.text : null
  if (typeof text !== 'string') return null
  const language = inboxIntent(text, preferredLanguage)
  if (!language) return null
  if (afterTool) {
    const reply = inboxReply(request.messages, language)
    return reply === null ? null : new AIMessage(reply)
  }
  return new AIMessage({
    content: '',
    tool_calls: [{ id: randomUUID(), name: LIST_TOOL, args: { purpose: 'list' }, type: 'tool_call' }],
  })
}
