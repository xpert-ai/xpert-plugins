import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Local mock host for the Support Ticket workbench.
 * Run it after `pnpm build` with:
 *   corepack pnpm remote-view:preview --config community/apps/support-ticket/src/lib/remote-components/support-ticket/preview.config.mjs
 *
 * The option lists below mirror src/lib/constants.ts. They are duplicated on purpose:
 * a preview fixture must stay readable without compiling the plugin.
 * Type "模拟失败" in the customer message to exercise the failure and retry path.
 */
const componentRoot = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(componentRoot, '../../../..')

const statuses = [
  { value: 'processing', en_US: 'AI processing', zh_Hans: 'AI 处理中' },
  { value: 'pending_review', en_US: 'Awaiting review', zh_Hans: '待人工确认' },
  { value: 'confirmed', en_US: 'Confirmed', zh_Hans: '已确认' },
  { value: 'failed', en_US: 'Failed', zh_Hans: '处理失败' }
]
const categories = [
  { value: 'product_issue', en_US: 'Product issue', zh_Hans: '产品故障' },
  { value: 'billing', en_US: 'Billing', zh_Hans: '计费与账单' },
  { value: 'delivery', en_US: 'Delivery', zh_Hans: '物流与交付' },
  { value: 'account_access', en_US: 'Account access', zh_Hans: '账号与权限' },
  { value: 'how_to', en_US: 'How to use', zh_Hans: '使用咨询' },
  { value: 'complaint', en_US: 'Complaint', zh_Hans: '投诉与建议' },
  { value: 'other', en_US: 'Other', zh_Hans: '其他' }
]
const priorities = [
  { value: 'p0', en_US: 'P0 - Blocking', zh_Hans: 'P0 - 业务中断' },
  { value: 'p1', en_US: 'P1 - High', zh_Hans: 'P1 - 高' },
  { value: 'p2', en_US: 'P2 - Normal', zh_Hans: 'P2 - 中' },
  { value: 'p3', en_US: 'P3 - Low', zh_Hans: 'P3 - 低' }
]
const channels = [
  { value: 'email', en_US: 'Email', zh_Hans: '邮件' },
  { value: 'im', en_US: 'Instant message', zh_Hans: '在线 IM' },
  { value: 'phone', en_US: 'Phone note', zh_Hans: '电话记录' },
  { value: 'other', en_US: 'Other', zh_Hans: '其他' }
]

const FAILURE_MARKER = '模拟失败'
let sequence = 0

function makeTicket({ requestId, customerName, channel, originalMessage }, now) {
  sequence += 1
  const day = now.slice(0, 10).replaceAll('-', '')
  return {
    id: `10000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    requestId,
    ticketNo: `ST-${day}-${String(sequence).padStart(4, '0')}`,
    status: 'processing',
    sourceType: 'workbench_form',
    customerName,
    channel,
    originalMessage,
    revision: 1,
    attemptCount: 1,
    events: [{ action: 'submitted', at: now, detail: 'preview mock intake' }]
  }
}

function withTriage(ticket, now) {
  return {
    ...ticket,
    status: 'pending_review',
    revision: ticket.revision + 1,
    ai: {
      category: 'billing',
      priority: 'p1',
      priorityReason: 'preview mock: 客户提到重复支付，存在资损风险',
      draftReply: '您好，已定位到重复扣款，我们今天 18:00 前原路退回，并会在完成后再次与您确认。',
      confidence: 0.86,
      missingInfo: ['付款流水号'],
      processedAt: now
    },
    events: [...ticket.events, { action: 'ai_completed', at: now, detail: 'preview mock triage' }]
  }
}

function toListItem(ticket) {
  const preview = ticket.confirmed?.draftReply ?? ticket.ai?.draftReply
  return {
    id: ticket.id,
    ticketNo: ticket.ticketNo,
    status: ticket.status,
    customerName: ticket.customerName,
    channel: ticket.channel,
    category: ticket.confirmed?.category ?? ticket.ai?.category,
    priority: ticket.confirmed?.priority ?? ticket.ai?.priority,
    confirmedReplyPreview: ticket.confirmed?.draftReply ? preview.slice(0, 80) : undefined,
    draftReplyPreview: ticket.confirmed?.draftReply ? undefined : preview?.slice(0, 80),
    attemptCount: ticket.attemptCount,
    revision: ticket.revision,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt
  }
}

function buildViewData(tickets, query) {
  const parameters = query?.parameters ?? {}
  const search = typeof query?.search === 'string' ? query.search.trim().toLowerCase() : ''
  const filtered = tickets.filter((ticket) => {
    if (parameters.status && ticket.status !== parameters.status) return false
    if (!search) return true
    return [ticket.ticketNo, ticket.customerName, ticket.originalMessage]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search))
  })
  const selected = parameters.ticketId
    ? tickets.find((ticket) => ticket.id === parameters.ticketId)
    : filtered[0]
  const stats = { total: tickets.length, processing: 0, pending_review: 0, confirmed: 0, failed: 0 }
  const confirmedReply = (ticket) => ticket.confirmed?.draftReply

  return {
    items: filtered.map(toListItem),
    total: filtered.length,
    item: selected ? { ...selected, confirmedReply: confirmedReply(selected) } : undefined,
    summary: {
      mode: selected ? 'detail' : 'empty',
      stats: tickets.reduce((acc, ticket) => {
        acc[ticket.status] = (acc[ticket.status] ?? 0) + 1
        return acc
      }, stats)
    },
    meta: {
      statuses,
      categories,
      priorities,
      channels,
      maxMessageLength: 2000,
      aiTimeoutSeconds: 90
    }
  }
}

export default {
  title: 'Support Ticket · Local Mock',
  workspaceRoot: pluginRoot,
  instanceId: 'support-ticket-preview',
  component: {
    root: componentRoot,
    runtime: 'react'
  },
  hostContext: {
    manifest: { key: 'support_ticket__workbench' },
    payload: {},
    initialQuery: { page: 1, pageSize: 50, parameters: {} },
    locale: 'zh-Hans',
    theme: { mode: 'light' },
    debug: { enabled: false, production: true }
  },
  state: {
    tickets: [
      withTriage(
        makeTicket(
          {
            requestId: 'preview-seed-1',
            customerName: '宁波启明医疗器械有限公司',
            channel: 'im',
            originalMessage: '结算页面提示支付成功，但订单一直是待付款，客户已经重复支付两次，订单号 SO-20260921-1188。'
          },
          '2026-09-21T02:10:00.000Z'
        ),
        '2026-09-21T02:11:00.000Z'
      ),
      {
        ...makeTicket(
          {
            requestId: 'preview-seed-2',
            customerName: '杭州云启智能设备有限公司',
            channel: 'email',
            originalMessage: '设备开机后频繁重启，产线停工两小时，需要尽快安排工程师。'
          },
          '2026-09-21T01:40:00.000Z'
        ),
        status: 'failed',
        revision: 2,
        attemptCount: 1,
        failure: { reason: 'preview mock: 模型未在规定时间内返回结果', code: 'ai_timeout', at: '2026-09-21T01:42:00.000Z' },
        events: [
          { action: 'submitted', at: '2026-09-21T01:40:00.000Z' },
          { action: 'ai_failed', at: '2026-09-21T01:42:00.000Z', detail: 'preview mock timeout' }
        ]
      }
    ],
    actions: [],
    clientCommands: []
  },
  async handleRequest(message, { state }) {
    const now = new Date().toISOString()
    if (message.type === 'requestData') {
      return { data: buildViewData(state.tickets, message.query) }
    }
    if (message.type === 'invokeClientCommand') {
      if (message.commandKey !== 'assistant.chat.send_message') {
        throw new Error(`Unsupported preview client command '${message.commandKey}'.`)
      }
      const text = typeof message.payload?.text === 'string' ? message.payload.text : ''
      const ticket = state.tickets.find((item) => text.includes(item.id) && text.includes(item.ticketNo))
      if (!ticket) {
        throw new Error('Assistant request does not carry the exact ticketId and ticketNo.')
      }
      state.clientCommands.push({ commandKey: message.commandKey, ticketId: ticket.id, at: now })
      const next = ticket.originalMessage.includes(FAILURE_MARKER)
        ? {
            ...ticket,
            status: 'failed',
            revision: ticket.revision + 1,
            failure: { reason: 'preview mock: 模型调用失败（由「模拟失败」触发）', code: 'ai_timeout', at: now },
            events: [...ticket.events, { action: 'ai_failed', at: now, detail: 'preview mock failure switch' }]
          }
        : withTriage({ ...ticket, attemptCount: ticket.attemptCount + 1 }, now)
      state.tickets.splice(state.tickets.indexOf(ticket), 1, next)
      return { result: { success: true, status: 'sent', clientMessageId: message.payload?.clientMessageId } }
    }
    if (message.type === 'executeAction') {
      const input = message.input ?? {}
      state.actions.push({ actionKey: message.actionKey, ticketId: message.targetId, at: now })
      if (message.actionKey === 'submit_ticket') {
        const duplicate = state.tickets.find((ticket) => ticket.requestId === input.requestId)
        const ticket = duplicate ?? makeTicket(input, now)
        if (!duplicate) {
          state.tickets.unshift(ticket)
        }
        return {
          result: {
            success: true,
            message: { en_US: 'Ticket submitted', zh_Hans: '工单已提交' },
            refresh: true,
            data: {
              ticketId: ticket.id,
              ticketNo: ticket.ticketNo,
              duplicated: Boolean(duplicate),
              clientCommand: {
                commandKey: 'assistant.chat.send_message',
                payload: { text: `请处理工单 ${ticket.ticketNo}（ticketId：${ticket.id}）` }
              }
            }
          }
        }
      }
      const ticket = state.tickets.find((item) => item.id === message.targetId)
      if (!ticket) {
        return { result: { success: false, message: { zh_Hans: '找不到工单' }, data: { code: 'ticket_not_found' } } }
      }
      if (ticket.status === 'confirmed' && message.actionKey !== 'refresh') {
        return {
          result: {
            success: false,
            message: { zh_Hans: '工单已确认归档' },
            data: { code: 'already_confirmed' }
          }
        }
      }
      if (message.actionKey === 'retry_ticket' || message.actionKey === 'mark_ticket_failed') {
        const failed = message.actionKey === 'mark_ticket_failed'
        const next = {
          ...ticket,
          status: failed ? 'failed' : 'processing',
          revision: ticket.revision + 1,
          attemptCount: ticket.attemptCount + 1,
          failure: failed ? { reason: input.reason, code: input.code, at: now } : undefined,
          events: [
            ...ticket.events,
            { action: failed ? 'ai_failed' : 'retry_requested', at: now, detail: input.reason ?? 'preview retry' }
          ]
        }
        state.tickets.splice(state.tickets.indexOf(ticket), 1, next)
        return {
          result: {
            success: true,
            message: { zh_Hans: failed ? '已标记失败' : '已重新提交' },
            refresh: true,
            data: failed
              ? {}
              : {
                  ticketId: ticket.id,
                  ticketNo: ticket.ticketNo,
                  attemptCount: next.attemptCount,
                  clientCommand: {
                    commandKey: 'assistant.chat.send_message',
                    payload: { text: `请重试处理工单 ${ticket.ticketNo}（ticketId：${ticket.id}）` }
                  }
                }
          }
        }
      }
      if (message.actionKey === 'save_draft' || message.actionKey === 'confirm_ticket') {
        if (ticket.revision !== input.expectedRevision) {
          return {
            result: {
              success: false,
              message: { zh_Hans: '工单已被其他人修改' },
              data: { code: 'revision_conflict' }
            }
          }
        }
        if (!String(input.draftReply ?? '').trim()) {
          return { result: { success: false, message: { zh_Hans: '草稿不能为空' }, data: { code: 'invalid_input' } } }
        }
        const confirming = message.actionKey === 'confirm_ticket'
        const next = {
          ...ticket,
          status: confirming ? 'confirmed' : 'pending_review',
          revision: ticket.revision + 1,
          confirmed: {
            category: input.category,
            priority: input.priority,
            draftReply: input.draftReply,
            reviewedAt: confirming ? now : undefined
          },
          events: [...ticket.events, { action: confirming ? 'confirmed' : 'draft_saved', at: now }]
        }
        state.tickets.splice(state.tickets.indexOf(ticket), 1, next)
        return {
          result: {
            success: true,
            message: { zh_Hans: confirming ? '工单已确认归档' : '草稿已保存' },
            refresh: true,
            data: { revision: next.revision }
          }
        }
      }
      if (message.actionKey === 'refresh') {
        return { result: { success: true, message: { zh_Hans: '已刷新' }, refresh: true, data: {} } }
      }
      throw new Error(`Unsupported preview action '${message.actionKey}'.`)
    }
    throw new Error(`Unsupported preview request '${message.type}'.`)
  }
}
