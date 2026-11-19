// Preview fixture for the Supplier Delivery Workbench, run by tools/remote-view-preview.
// It answers the same envelopes as the production view provider, enforces the same transitions
// (validation, revisions, idempotent confirmation) and simulates the assistant after a parse request.
// Preview-only: never imported by components, never copied into dist. All data is fictional.
//
//   PREVIEW_SCENARIO=demo|empty   PREVIEW_LOCALE=zh-Hans|en   PREVIEW_THEME=light|dark
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const componentRoot = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(componentRoot, '../../../..')
const demoDataPath = resolve(pluginRoot, 'dist/lib/demo-data.js')
if (!existsSync(demoDataPath))
  throw new Error('Build the plugin first (tsc -p tsconfig.lib.json) so dist/lib/demo-data.js exists.')
const { DEMO_ORDER_LINES, DEMO_REPLIES } = createRequire(import.meta.url)(demoDataPath)
// The same command text as the production provider.
const { parseCommandText } = createRequire(import.meta.url)(resolve(pluginRoot, 'dist/lib/domain-utils.js'))

const scenario = process.env.PREVIEW_SCENARIO ?? 'demo'
const locale = process.env.PREVIEW_LOCALE ?? 'zh-Hans'
const TIMEOUT_MINUTES = 5
const SIMULATED_AGENT_DELAY_MS = 2500
const BUYER = locale === 'en' ? 'Demo buyer' : '演示跟单员'
const MAX_REPLY_LENGTH = 5000

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString()
const hash = (text) => createHash('sha256').update(text.trim()).digest('hex')
const replyText = (kind) => DEMO_REPLIES.find((reply) => reply.kind === kind).rawText
let sequence = 0
const nextId = (prefix) => `${prefix}-${(++sequence).toString().padStart(3, '0')}`

/** What the simulated assistant extracts for each sample reply. Quotes must be substrings of the text. */
const EXTRACTIONS = {
  single_delay: [
    {
      po: 'DEMO-001',
      line: 1,
      changeType: 'delay',
      proposedDate: '2026-11-28',
      reason: '设备检修',
      confidence: 0.94,
      evidence: { poNumber: 'DEMO-001 第1行', proposedDate: '延期到2026-11-28', reason: '因设备检修' }
    }
  ],
  multiple_lines: [
    {
      po: 'DEMO-001',
      line: 2,
      changeType: 'delay',
      proposedDate: '2026-11-26',
      reason: '排产调整',
      confidence: 0.91,
      evidence: { poNumber: 'DEMO-001 第2行', proposedDate: '改为2026-11-26', reason: '原因均为排产调整' }
    },
    {
      po: 'DEMO-002',
      line: 1,
      changeType: 'delay',
      proposedDate: '2026-11-29',
      reason: '排产调整',
      confidence: 0.9,
      evidence: { poNumber: 'DEMO-002 第1行', proposedDate: '改为2026-11-29', reason: '原因均为排产调整' }
    }
  ],
  missing_order: [
    {
      po: 'DEMO-001',
      line: 1,
      changeType: 'delay',
      proposedDate: '2026-11-30',
      reason: null,
      confidence: 0.58,
      evidence: { proposedDate: '预计2026-11-30到货', proposedQuantity: '定位环100件' }
    }
  ],
  partial: [
    {
      po: 'DEMO-003',
      line: 1,
      changeType: 'partial',
      batches: [
        { quantity: 100, date: '2026-11-24' },
        { quantity: 200, date: '2026-12-02' }
      ],
      reason: '原料分批入库',
      confidence: 0.88,
      evidence: {
        poNumber: 'DEMO-003 第1行',
        batches: '100片于2026-11-24到货，200片于2026-12-02到货',
        reason: '因原料分批入库'
      }
    }
  ],
  advance: [
    {
      po: 'DEMO-005',
      line: 1,
      changeType: 'advance',
      proposedDate: '2026-11-19',
      reason: '已完成生产',
      confidence: 0.92,
      evidence: { poNumber: 'DEMO-005 第1行', proposedDate: '交期提前到2026-11-19', reason: '已完成' }
    }
  ],
  no_date: { failure: 'no_delivery_info', message: '供应商只说「尽快安排」，没有给出具体日期。' }
}

function createOrders() {
  return DEMO_ORDER_LINES.map((line) => ({
    ...line,
    id: nextId('line'),
    promisedDate: line.originalDate,
    revision: 1,
    lastAppliedProposalId: null
  }))
}

function createReply(state, rawText, createdAt = new Date().toISOString()) {
  const reply = {
    id: nextId('reply'),
    rawText,
    contentHash: hash(rawText),
    status: 'received',
    revision: 1,
    parseAttempt: 0,
    parseRequestedAt: null,
    failureCode: null,
    failureMessage: null,
    createdAt,
    updatedAt: createdAt,
    confirmedAt: null,
    confirmedBy: null,
    confirmedByName: null
  }
  state.replies.push(reply)
  return reply
}

function findOrder(state, po, line) {
  return state.orders.find((order) => order.poNumber === po && order.lineNo === line)
}

/** Apply the simulated assistant result for one parse attempt (replaces earlier attempts per order line). */
function completeParse(state, reply, at = new Date().toISOString()) {
  const kind = DEMO_REPLIES.find((sample) => sample.rawText === reply.rawText.trim())?.kind
  const extraction = (kind ? EXTRACTIONS[kind] : undefined) ?? {
    failure: 'ambiguous_order',
    message: '没能把这段文字对应到示例订单。'
  }
  state.proposals = state.proposals.filter((proposal) => proposal.replyId !== reply.id)
  if (!Array.isArray(extraction)) {
    Object.assign(reply, {
      status: 'needs_followup',
      failureCode: extraction.failure,
      failureMessage: extraction.message
    })
  } else {
    for (const item of extraction) {
      const order = findOrder(state, item.po, item.line)
      if (!order) continue
      const batches = item.batches ?? []
      state.proposals.push({
        id: nextId('proposal'),
        replyId: reply.id,
        orderLineId: order.id,
        orderLineRevision: order.revision,
        baseDate: order.promisedDate,
        parseAttempt: reply.parseAttempt,
        changeType: item.changeType,
        proposedDate: item.proposedDate ?? batches.at(-1)?.date ?? null,
        proposedQuantity: item.proposedQuantity ?? null,
        batches,
        reason: item.reason,
        confidence: item.confidence,
        decision: 'pending',
        finalDate: null,
        finalQuantity: null,
        evidence: Object.entries(item.evidence).map(([field, quote]) => {
          const start = reply.rawText.indexOf(quote)
          return { field, quote, start, end: start + quote.length }
        })
      })
    }
    Object.assign(reply, { status: 'pending_review', failureCode: null, failureMessage: null })
  }
  reply.revision += 1
  reply.updatedAt = at
}

function applyConfirmation(state, reply, confirmedAt) {
  let applied = 0
  for (const proposal of state.proposals.filter(
    (item) => item.replyId === reply.id && ['accepted', 'edited'].includes(item.decision)
  )) {
    const order = state.orders.find((line) => line.id === proposal.orderLineId)
    if (order.lastAppliedProposalId === proposal.id) continue
    const newDate = proposal.finalDate ?? proposal.proposedDate ?? order.promisedDate
    state.logs.push({
      id: nextId('log'),
      orderLineId: order.id,
      proposalId: proposal.id,
      replyId: reply.id,
      oldDate: order.promisedDate,
      newDate,
      aiDate: proposal.proposedDate,
      batches: proposal.batches,
      confirmedBy: BUYER,
      confirmedByName: '演示跟单员',
      confirmedAt
    })
    Object.assign(order, {
      promisedDate: newDate,
      quantity: proposal.finalQuantity ?? order.quantity,
      revision: order.revision + 1,
      lastAppliedProposalId: proposal.id
    })
    applied += 1
  }
  Object.assign(reply, {
    status: 'confirmed',
    confirmedAt,
    confirmedBy: BUYER,
    confirmedByName: '演示跟单员',
    revision: reply.revision + 1,
    updatedAt: confirmedAt
  })
  return applied
}

function seed() {
  const state = { orders: [], replies: [], proposals: [], logs: [], commands: [] }
  if (scenario === 'empty') return state
  state.orders = createOrders()
  // Confirmed earlier: DEMO-001 line 1 moved from 11-20 to 11-28.
  const confirmed = createReply(state, replyText('single_delay'), minutesAgo(180))
  confirmed.parseAttempt = 1
  completeParse(state, confirmed, minutesAgo(170))
  state.proposals.find((proposal) => proposal.replyId === confirmed.id).decision = 'accepted'
  applyConfirmation(state, confirmed, minutesAgo(150))
  // Needs follow-up: no delivery date in the message.
  const followup = createReply(state, replyText('no_date'), minutesAgo(95))
  followup.parseAttempt = 1
  completeParse(state, followup, minutesAgo(90))
  // Parse ran past the timeout: shown as incomplete with a retry.
  const stuck = createReply(state, replyText('advance'), minutesAgo(40))
  Object.assign(stuck, {
    status: 'parsing',
    parseAttempt: 1,
    parseRequestedAt: minutesAgo(TIMEOUT_MINUTES + 2),
    updatedAt: minutesAgo(TIMEOUT_MINUTES + 2)
  })
  // Not parsed yet.
  createReply(state, replyText('partial'), minutesAgo(12))
  // Ready for review: two lines in one message.
  const review = createReply(state, replyText('multiple_lines'), minutesAgo(6))
  review.parseAttempt = 1
  completeParse(state, review, minutesAgo(5))
  return state
}

const timedOut = (reply) =>
  reply.status === 'parsing' &&
  reply.parseRequestedAt !== null &&
  Date.now() - Date.parse(reply.parseRequestedAt) > TIMEOUT_MINUTES * 60_000
const delayDays = (order) =>
  Math.round(
    (Date.parse(`${order.promisedDate}T00:00:00Z`) - Date.parse(`${order.originalDate}T00:00:00Z`)) / 86_400_000
  )

function orderSummary(order) {
  const { id, poNumber, lineNo, supplierName, materialCode, materialName, quantity, unit, originalDate, promisedDate } =
    order
  return {
    id,
    poNumber,
    lineNo,
    supplierName,
    materialCode,
    materialName,
    quantity,
    unit,
    originalDate,
    promisedDate,
    delayDays: delayDays(order)
  }
}

function proposalDto(state, proposal) {
  const order = state.orders.find((line) => line.id === proposal.orderLineId)
  return {
    id: proposal.id,
    orderLineId: order.id,
    poNumber: order.poNumber,
    lineNo: order.lineNo,
    supplierName: order.supplierName,
    materialName: order.materialName,
    unit: order.unit,
    orderedQuantity: order.quantity,
    originalDate: order.originalDate,
    baseDate: proposal.baseDate,
    currentDate: order.promisedDate,
    changeType: proposal.changeType,
    proposedDate: proposal.proposedDate,
    proposedQuantity: proposal.proposedQuantity,
    batches: proposal.batches,
    reason: proposal.reason,
    evidence: proposal.evidence,
    confidence: proposal.confidence,
    decision: proposal.decision,
    finalDate: proposal.finalDate,
    finalQuantity: proposal.finalQuantity,
    // Confirmation here is all at once, so a confirmed reply's proposals are already written and never stale.
    stale:
      state.replies.find((reply) => reply.id === proposal.replyId)?.status !== 'confirmed' &&
      order.revision !== proposal.orderLineRevision &&
      order.lastAppliedProposalId !== proposal.id
  }
}

function replyProposals(state, reply) {
  return state.proposals.filter((proposal) => proposal.replyId === reply.id)
}

function replySummary(state, reply) {
  const proposals = replyProposals(state, reply)
  const firstOrder = proposals
    .map((proposal) => state.orders.find((line) => line.id === proposal.orderLineId))
    .sort((a, b) => a.poNumber.localeCompare(b.poNumber) || a.lineNo - b.lineNo)[0]
  return {
    id: reply.id,
    preview: reply.rawText.trim().slice(0, 80),
    supplierName: firstOrder?.supplierName ?? null,
    status: reply.status,
    parseTimedOut: timedOut(reply),
    proposalCount: proposals.length,
    createdAt: reply.createdAt,
    updatedAt: reply.updatedAt
  }
}

function replyDetail(state, reply) {
  const {
    id,
    revision,
    rawText,
    status,
    parseAttempt,
    parseRequestedAt,
    failureCode,
    failureMessage,
    createdAt,
    confirmedAt,
    confirmedBy,
    confirmedByName
  } = reply
  // The preview confirms in one step, so it never shows a confirmation stopped part-way.
  return {
    id,
    revision,
    rawText,
    status,
    confirmationInProgress: false,
    parseTimedOut: timedOut(reply),
    parseAttempt,
    parseRequestedAt,
    failureCode,
    failureMessage,
    createdAt,
    confirmedAt,
    confirmedBy,
    confirmedByName,
    proposals: replyProposals(state, reply).map((proposal) => proposalDto(state, proposal))
  }
}

function page(items, query) {
  const pageNumber = Number(query.page ?? 1)
  const pageSize = Number(query.pageSize ?? 100)
  return {
    items: items.slice((pageNumber - 1) * pageSize, pageNumber * pageSize),
    total: items.length,
    page: pageNumber,
    pageSize
  }
}

function readData(state, query) {
  const parameters = query.parameters ?? {}
  switch (parameters.table) {
    case 'overview': {
      const replyCounts = { received: 0, parsing: 0, pending_review: 0, confirmed: 0, needs_followup: 0, failed: 0 }
      for (const reply of state.replies) replyCounts[reply.status] += 1
      return {
        orderLineCount: state.orders.length,
        delayedLineCount: state.orders.filter((order) => delayDays(order) > 0).length,
        replyCounts,
        parseTimeoutMinutes: TIMEOUT_MINUTES
      }
    }
    case 'replies':
      return page(
        [...state.replies]
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
          .map((reply) => replySummary(state, reply)),
        query
      )
    case 'reply': {
      const reply = state.replies.find((item) => item.id === parameters.id)
      if (!reply) throw new Error('reply_not_found')
      return replyDetail(state, reply)
    }
    case 'orderLines': {
      const needle = String(query.search ?? '')
        .trim()
        .toLowerCase()
      const items = state.orders.filter(
        (order) =>
          !needle ||
          [order.poNumber, order.materialName, order.supplierName].some((value) => value.toLowerCase().includes(needle))
      )
      return page(items.map(orderSummary), query)
    }
    case 'orderLine': {
      const order = state.orders.find((item) => item.id === parameters.id)
      if (!order) throw new Error('order_line_not_found')
      return {
        ...orderSummary(order),
        revision: order.revision,
        changes: state.logs.filter((log) => log.orderLineId === order.id)
      }
    }
    default:
      throw new Error(`Unsupported table '${parameters.table}'.`)
  }
}

const fail = (code, params) => ({ success: false, code, ...(params ? { params } : {}) })
const isCalendarDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value

function parseCommand(reply, requestedLocale) {
  return {
    commandKey: 'assistant.chat.send_message',
    payload: { text: parseCommandText(reply, requestedLocale), newThread: true }
  }
}

function runAction(state, { actionKey, targetId, input = {} }) {
  const reply = state.replies.find((item) => item.id === targetId)
  switch (actionKey) {
    case 'import_demo_data': {
      let created = 0
      for (const line of createOrders()) {
        if (findOrder(state, line.poNumber, line.lineNo)) continue
        state.orders.push(line)
        created += 1
      }
      return { success: true, data: { created, skipped: DEMO_ORDER_LINES.length - created } }
    }
    case 'create_reply': {
      const text = String(input.rawText ?? '').trim()
      if (!text) return fail('reply_empty')
      if (text.length > MAX_REPLY_LENGTH) return fail('reply_too_long', { max: MAX_REPLY_LENGTH })
      const existing = state.replies.find((item) => item.contentHash === hash(text))
      if (existing) return { success: true, data: { replyId: existing.id, created: false } }
      return { success: true, data: { replyId: createReply(state, text).id, created: true } }
    }
    case 'resend_parse': {
      if (!reply) return fail('reply_not_found')
      if (reply.status !== 'parsing') return fail('invalid_reply_state')
      const now = new Date().toISOString()
      Object.assign(reply, { parseRequestedAt: now, revision: reply.revision + 1, updatedAt: now })
      return {
        success: true,
        data: { replyId: reply.id, parseAttempt: reply.parseAttempt },
        command: parseCommand(reply, input.locale)
      }
    }
    case 'request_parse':
    case 'retry_parse': {
      if (!reply) return fail('reply_not_found')
      if (reply.status === 'confirmed') return fail('reply_locked')
      const allowed =
        actionKey === 'request_parse'
          ? reply.status !== 'parsing' || timedOut(reply)
          : ['failed', 'needs_followup'].includes(reply.status) || timedOut(reply)
      if (!allowed) return fail('parse_not_retryable')
      Object.assign(reply, {
        status: 'parsing',
        parseAttempt: reply.parseAttempt + 1,
        parseRequestedAt: new Date().toISOString(),
        failureCode: null,
        failureMessage: null,
        revision: reply.revision + 1,
        updatedAt: new Date().toISOString()
      })
      return {
        success: true,
        data: { replyId: reply.id, parseAttempt: reply.parseAttempt },
        command: parseCommand(reply, input.locale)
      }
    }
    case 'decide_proposal': {
      const proposal = state.proposals.find((item) => item.id === targetId)
      if (!proposal) return fail('proposal_not_found')
      const owner = state.replies.find((item) => item.id === proposal.replyId)
      if (owner.status === 'confirmed') return fail('reply_locked')
      if (owner.status !== 'pending_review') return fail('invalid_reply_state')
      if (!['accepted', 'edited', 'rejected'].includes(input.decision)) return fail('invalid_decision')
      if (input.decision === 'edited' && !isCalendarDate(input.finalDate)) return fail('invalid_date')
      Object.assign(proposal, {
        decision: input.decision,
        finalDate: input.decision === 'edited' ? input.finalDate : null,
        finalQuantity: input.decision === 'edited' && input.finalQuantity ? Number(input.finalQuantity) : null
      })
      owner.revision += 1
      owner.updatedAt = new Date().toISOString()
      return { success: true, data: { proposalId: proposal.id, replyId: owner.id } }
    }
    case 'confirm_reply': {
      if (!reply) return fail('reply_not_found')
      if (reply.status === 'confirmed') return { success: true, data: { replyId: reply.id, appliedCount: 0 } }
      if (reply.status !== 'pending_review') return fail('reply_locked')
      if (input.expectedRevision !== reply.revision) return fail('concurrent_change')
      const proposals = replyProposals(state, reply)
      if (proposals.some((proposal) => proposal.decision === 'pending')) return fail('review_incomplete')
      const stale = proposals.find((proposal) => proposal.decision !== 'rejected' && proposalDto(state, proposal).stale)
      if (stale) return fail('order_line_changed', { orderLineId: stale.orderLineId })
      return {
        success: true,
        data: { replyId: reply.id, appliedCount: applyConfirmation(state, reply, new Date().toISOString()) }
      }
    }
    default:
      return fail('unsupported_action', { actionKey })
  }
}

export default {
  title: 'Supplier Delivery Workbench · Remote View Preview',
  workspaceRoot: pluginRoot,
  instanceId: 'supplier-delivery-preview',
  component: { root: componentRoot, runtime: 'react' },
  hostContext: {
    manifest: { key: 'supplier_delivery.workbench' },
    payload: {},
    initialQuery: { page: 1, pageSize: 100, parameters: {} },
    locale,
    theme: { mode: process.env.PREVIEW_THEME === 'dark' ? 'dark' : 'light', density: 'compact', tokens: {} },
    debug: { enabled: false, production: true }
  },
  state: seed(),
  async handleRequest(message, { state }) {
    if (message.type === 'requestData') {
      try {
        return { data: { meta: readData(state, message.query ?? {}) } }
      } catch (error) {
        return { data: { error: { code: error.message } } }
      }
    }
    if (message.type === 'executeAction') return { result: runAction(state, message) }
    if (message.type === 'invokeClientCommand') {
      state.commands.push({ commandKey: message.commandKey, payload: message.payload })
      // Stand-in for the assistant: it reads the reply id from the chat message and finishes later.
      const replyId = /reply:(\S+)/.exec(String(message.payload?.text ?? ''))?.[1]
      const reply = state.replies.find((item) => item.id === replyId)
      if (reply) setTimeout(() => reply.status === 'parsing' && completeParse(state, reply), SIMULATED_AGENT_DELAY_MS)
      return { result: { success: true } }
    }
    throw new Error(`Unsupported preview request '${message.type}'.`)
  }
}
