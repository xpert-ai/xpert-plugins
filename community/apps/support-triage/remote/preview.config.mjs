import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = dirname(fileURLToPath(import.meta.url))
const epoch = '2026-09-15T02:30:00.000Z'
const analysis = {
  summary: '客户升级团队版后出现重复扣款，申请核实账单并说明处理进展。',
  category: 'billing', priority: 'normal',
  evidence: ['升级团队版后，我的银行卡连续扣了两笔 299 元。', '现在后台只显示一个订阅。'],
  missingInfo: ['两笔扣款的订单号与交易时间', '相关支付凭证（请遮盖完整卡号等敏感信息）'],
  replyDraft: '您好，已收到您关于升级团队版后重复扣款的反馈。\n\n为便于核实，请提供两笔扣款的订单号、交易时间和已遮盖敏感信息的支付凭证。我们会结合当前订阅状态核查账单，确认原因后向您说明后续处理方案。\n\n感谢您的理解与配合。',
  rationale: '原文明确涉及订阅付款，归类为账单与支付；未描述服务中断或紧急时限，优先级为普通。',
}
function ticket(id, title, customerAlias, status, message, proposal = null) {
  return { id, title, customerAlias, status, message, analysis: proposal, category: proposal?.category ?? null, priority: proposal?.priority ?? null, summary: proposal?.summary ?? null, revision: proposal ? 3 : 1, createdAt: epoch, updatedAt: epoch, failureReason: status === 'failed' ? '演示：上次模型调用未完成，可重试。' : null, attemptId: null, attemptDeadline: null, confirmedReply: null, confirmedAt: null, confirmedBy: null, history: [{ event: 'created', at: epoch, actor: 'human', revision: 1 }, ...(proposal ? [{ event: 'analysis_started', at: epoch, actor: 'human', revision: 2 }, { event: 'analysis_saved', at: epoch, actor: 'agent', revision: 3 }] : [])] }
}
const tickets = [
  ticket('b0915b66-6b5f-4b52-a8d6-3575e799de01', '团队版升级后重复扣款，请协助核实', '客户 A', 'pending_review', '你好，昨天升级团队版后，我的银行卡连续扣了两笔 299 元。\n\n现在后台只显示一个订阅。麻烦帮我查一下是不是重复扣款了，后续应该如何处理？谢谢。', analysis),
  ticket('b0915b66-6b5f-4b52-a8d6-3575e799de02', '成员登录后无法进入项目空间', '客户 B', 'new', '今天上午邀请的同事已经接受邀请，但登录后仍然看不到我们的项目空间。其他成员使用正常。应该怎么处理？'),
  ticket('b0915b66-6b5f-4b52-a8d6-3575e799de03', '导出报表时页面一直加载', '客户 C', 'failed', '我选择最近 30 天导出报表后，页面一直显示加载中，已经等了 10 分钟。换了浏览器还是一样。'),
]
function receipt(item) { return { ticketId: item.id, revision: item.revision, status: item.status } }
function append(item, event, actor) { item.history.push({ event, at: epoch, actor, revision: item.revision }) }
function finishPending(state) {
  for (const job of state.jobs) {
    if (job.done || Date.now() < job.readyAt) continue
    job.done = true
    const item = state.tickets.find(row => row.id === job.ticketId)
    if (!item || item.attemptId !== job.attemptId || item.status !== 'processing') continue
    item.revision++; item.attemptDeadline = null
    if (state.scenario === 'analysis_failure') {
      item.status = 'failed'; item.failureReason = '演示场景：模型服务暂不可用。'; append(item, 'analysis_failed', 'agent')
    } else {
      // Synthetic fixture output; never imported by the production component.
      item.status = 'pending_review'; item.analysis = { summary: '演示结果：请人工核实客户问题和可用信息。', category: 'technical', priority: 'normal', evidence: [item.message.slice(0, 80)], missingInfo: ['问题发生时间与可复现步骤'], replyDraft: '您好，我们已收到您的反馈。为进一步定位问题，请补充问题发生时间及复现步骤。我们将根据您提供的信息继续核实。', rationale: '这是共享预览主机中的合成示例，并未调用真实模型。' }
      item.summary = item.analysis.summary; item.category = item.analysis.category; item.priority = item.analysis.priority; append(item, 'analysis_saved', 'agent')
    }
  }
}
export default {
  title: '界面预览 · 模拟数据与模拟 AI · 非真实 Xpert 验收',
  workspaceRoot: resolve(directory, '..'), instanceId: 'support-triage-preview',
  component: { root: resolve(directory, 'dist'), runtime: 'react' },
  hostContext: { manifest: { key: 'support_triage.workbench' }, initialQuery: { page: 1, pageSize: 20, parameters: {} }, locale: 'zh-Hans', debug: { enabled: false, production: true }, theme: { mode: 'light', density: 'default', tokens: { '--xui-color-primary': '#4f46e5', '--xui-color-ring': '#6366f1', '--xui-color-border': '#e4e6eb', '--xui-color-input': '#d8dbe2', '--xui-color-muted': '#f5f6f8', '--xui-color-muted-foreground': '#697386', '--xui-radius-md': '8px' } } },
  state: { tickets, requests: {}, jobs: [], scenario: 'populated' },
  async handleRequest(message, { state, events }) {
    events.push({ type: message.type, actionKey: message.actionKey, commandKey: message.commandKey })
    finishPending(state)
    if (message.type === 'requestData') {
      if (message.query?.parameters?.ticketId) {
        const item = state.tickets.find(row => row.id === message.query.parameters.ticketId)
        if (!item) throw new Error('not_found')
        return { data: { item } }
      }
      const query = message.query ?? {}; const page = query.page ?? 1; const pageSize = query.pageSize ?? 20
      const items = state.tickets.filter(row => (!query.parameters?.status || row.status === query.parameters.status) && (!query.search || `${row.title} ${row.customerAlias} ${row.message}`.includes(query.search)))
      return { data: { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize } }
    }
    if (message.type === 'executeAction') {
      const input = message.input
      const fail = code => ({ result: { success: false, data: { code } } })
      if (message.actionKey === 'create_ticket') {
        if (!input.title?.trim() || !input.customerAlias?.trim() || !input.message?.trim()) return fail('invalid_input')
        if (state.requests[input.requestId]) return { result: { success: true, data: receipt(state.tickets.find(row => row.id === state.requests[input.requestId])) } }
        const item = ticket(randomUUID(), input.title, input.customerAlias, 'new', input.message)
        state.tickets.unshift(item); state.requests[input.requestId] = item.id
        return { result: { success: true, data: receipt(item) } }
      }
      const item = state.tickets.find(row => row.id === input.ticketId)
      if (!item) return fail('not_found')
      if (message.actionKey === 'confirm_ticket' && state.scenario === 'conflict_on_confirm') { item.revision++; state.scenario = 'populated' }
      if (item.revision !== input.expectedRevision) return fail('conflict')
      if (message.actionKey === 'analyze_ticket') {
        if (!['new', 'failed'].includes(item.status)) return fail('invalid_state')
        item.status = 'processing'; item.revision++; item.attemptId = randomUUID(); item.failureReason = null; item.attemptDeadline = new Date(Date.now() + 60000).toISOString(); append(item, 'analysis_started', 'human')
        return { result: { success: true, data: { ...receipt(item), attemptId: item.attemptId, commandKey: 'assistant.chat.send_message', payload: { text: JSON.stringify({ ticketId: item.id, attemptId: item.attemptId }) } } } }
      }
      if (message.actionKey === 'abort_analysis') {
        if (item.status !== 'processing' || item.attemptId !== input.attemptId) return fail('stale_attempt')
        item.status = 'failed'; item.revision++; item.failureReason = '演示场景：本次分析已结束，可重新发起。'; append(item, 'analysis_failed', 'human')
        return { result: { success: true, data: receipt(item) } }
      }
      if (message.actionKey === 'confirm_ticket') {
        if (item.status !== 'pending_review' || !input.reply?.trim()) return fail('invalid_state')
        item.status = 'confirmed'; item.revision++; item.category = input.category; item.priority = input.priority; item.confirmedReply = input.reply; item.confirmedAt = epoch; item.confirmedBy = 'preview-reviewer'; append(item, 'confirmed', 'human')
        return { result: { success: true, data: receipt(item) } }
      }
      return fail('invalid_input')
    }
    if (message.type === 'invokeClientCommand') {
      if (message.commandKey !== 'assistant.chat.send_message' || state.scenario === 'dispatcher_unavailable') return { result: { success: false, code: 'unavailable' } }
      const input = JSON.parse(message.payload.text)
      state.jobs.push({ ...input, readyAt: Date.now() + 800, done: false })
      return { result: { success: true } }
    }
    throw new Error(`Unsupported preview request: ${message.type}`)
  },
}
