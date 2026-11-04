import { z } from 'zod/v3'
import { boardSchema } from '../domain/contracts.js'
import type { TicketBoard, TicketView } from '../domain/contracts.js'
import { ACTIONS } from '../constants.js'
import type { HostBridge } from './bridge.js'

const copy = {
  zh: {
    loadDemo: '载入演示工单', refresh: '刷新', total: '全部', pending: '待处理', proposed: '待确认',
    confirmed: '已确认', failed: '需重试', empty: '还没有工单。点“载入演示工单”开始。',
    select: '在左侧选择一张工单。', proposal: 'AI 分诊建议', noProposal: '这张工单还没有分诊建议。让助手先给出一张工单的分诊。',
    priority: '优先级', team: '承接团队', rationale: '判断依据', draft: '回复草稿', note: '审核备注',
    history: '尝试次数', failureCode: '失败原因', confirm: '确认分诊', reject: '退回重做', retry: '重试分诊',
    confirmedHint: '已确认，无需再操作。', pendingHint: '这张工单在等助手给出分诊建议。',
    failedHint: '上次分诊失败，可重试。', saved: '已保存，人工确认后视为完成。',
    seedDone: '演示工单已载入。', conflict: '工单已被修改，已刷新，请重新操作。',
    invalidState: '这张工单状态已变化，已刷新。', genericError: '操作失败，请重试。'
  },
  en: {
    loadDemo: 'Load demo tickets', refresh: 'Refresh', total: 'All', pending: 'Pending', proposed: 'Needs review',
    confirmed: 'Confirmed', failed: 'Needs retry', empty: 'No tickets yet. Load the demo tickets to start.',
    select: 'Pick a ticket on the left.', proposal: 'AI triage proposal', noProposal: 'No proposal yet. Ask the assistant to triage this ticket.',
    priority: 'Priority', team: 'Team', rationale: 'Rationale', draft: 'Draft reply', note: 'Review note',
    history: 'Attempts', failureCode: 'Failure', confirm: 'Confirm triage', reject: 'Reject', retry: 'Retry triage',
    confirmedHint: 'Confirmed. Nothing left to do.', pendingHint: 'Waiting for the assistant to propose a triage.',
    failedHint: 'The last attempt failed. You can retry.', saved: 'Saved. The human confirmation is what closes it.',
    seedDone: 'Demo tickets loaded.', conflict: 'The ticket changed. Refreshed, please retry.',
    invalidState: 'This ticket already moved on. Refreshed.', genericError: 'Action failed. Please retry.'
  }
} as const

type Copy = typeof copy.zh

const TEAM_LABEL: Record<string, { zh: string; en: string }> = {
  technical_support: { zh: '技术支持', en: 'Technical support' },
  billing: { zh: '账务', en: 'Billing' },
  logistics: { zh: '物流', en: 'Logistics' },
  product: { zh: '产品', en: 'Product' },
  customer_success: { zh: '客户成功', en: 'Customer success' }
}

const STATUS_LABEL: Record<TicketView['status'], keyof Pick<Copy, 'pending' | 'proposed' | 'confirmed' | 'failed'>> = {
  pending: 'pending', proposed: 'proposed', confirmed: 'confirmed', failed: 'failed'
}

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
  const node = document.createElement(tag)
  if (text !== undefined) node.textContent = text
  return node
}

export function mountBoard(bridge: HostBridge, locale: string) {
  const zh = !locale.toLowerCase().startsWith('en')
  const t = (zh ? copy.zh : copy.en) as Copy
  const list = document.querySelector<HTMLElement>('#list')!
  const summary = document.querySelector<HTMLElement>('#summary')!
  const detail = document.querySelector<HTMLElement>('#detail')!
  const toast = document.querySelector<HTMLElement>('#toast')!
  const seedButton = document.querySelector<HTMLButtonElement>('#btn-seed')!
  const refreshButton = document.querySelector<HTMLButtonElement>('#btn-refresh')!

  let board: TicketBoard | null = null
  let selected: string | null = null
  let busy = false
  let toastTimer: ReturnType<typeof setTimeout> | null = null

  const notify = (message: string, error = false) => {
    toast.textContent = message
    toast.classList.toggle('error', error)
    toast.classList.add('show')
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200)
  }

  const describeError = (error: unknown) => {
    const code = error instanceof Error ? error.message : 'action_failed'
    if (code === 'conflict') return notify(t.conflict, true)
    if (code === 'invalid_state') return notify(t.invalidState, true)
    return notify(t.genericError, true)
  }

  const setBusy = (value: boolean) => {
    busy = value
    for (const button of document.querySelectorAll('button')) button.disabled = value
    render()
  }

  const load = async () => {
    board = await bridge.query(boardSchema)
    if (!selected || !board.items.some(item => item.ticketCode === selected)) {
      selected = board.items[0]?.ticketCode ?? null
    }
    render()
  }

  const act = async (actionKey: string, input: Record<string, unknown>) => {
    if (busy) return
    setBusy(true)
    try {
      await bridge.action(actionKey, input as never, z.unknown())
      if (actionKey === ACTIONS.seed) notify(t.seedDone)
      else notify(t.saved)
      await load()
    } catch (error) {
      describeError(error)
      try { await load() } catch { /* keep the last good board */ }
    } finally {
      setBusy(false)
    }
  }

  const field = (label: string, value: string | null, className?: string) => {
    const wrapper = element('div')
    wrapper.className = 'field'
    const term = element('dt', label)
    const description = element('dd', value ?? '—')
    if (className) description.className = className
    const list_ = element('dl')
    list_.style.margin = '0'
    list_.append(term, description)
    wrapper.append(list_)
    return wrapper
  }

  const renderSummary = () => {
    summary.replaceChildren()
    if (!board) return
    const chips: [string, number][] = [
      [t.total, board.summary.total], [t.pending, board.summary.pending],
      [t.proposed, board.summary.proposed], [t.confirmed, board.summary.confirmed],
      [t.failed, board.summary.failed]
    ]
    for (const [label, value] of chips) {
      const chip = element('span')
      chip.className = 'chip'
      chip.append(document.createTextNode(`${label} `))
      const strong = element('b', String(value))
      chip.append(strong)
      summary.append(chip)
    }
  }

  const renderList = () => {
    list.replaceChildren()
    if (!board) return
    if (!board.items.length) {
      const empty = element('div', t.empty)
      empty.className = 'empty'
      list.append(empty)
      return
    }
    const table = element('table')
    const head = element('thead')
    const headRow = element('tr')
    for (const label of [zh ? '工单' : 'Ticket', zh ? '主题' : 'Subject', zh ? '状态' : 'Status', zh ? '团队' : 'Team']) {
      headRow.append(element('th', label))
    }
    head.append(headRow)
    const body = element('tbody')
    for (const item of board.items) {
      const row = element('tr')
      if (item.ticketCode === selected) row.classList.add('selected')
      row.tabIndex = 0
      row.addEventListener('click', () => { selected = item.ticketCode; render() })
      row.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selected = item.ticketCode; render() }
      })
      const code = element('td')
      const codeText = element('span', item.ticketCode)
      codeText.className = 'code'
      code.append(codeText)
      const subject = element('td', item.subject)
      const status = element('td')
      const statusBadge = element('span', t[STATUS_LABEL[item.status]])
      statusBadge.className = `badge ${item.status}`
      status.append(statusBadge)
      if (item.priority) {
        const priority = element('span', ` ${item.priority}`)
        priority.className = 'badge priority'
        priority.style.marginLeft = '6px'
        status.append(priority)
      }
      const team = element('td', item.team ? TEAM_LABEL[item.team][zh ? 'zh' : 'en'] : '—')
      if (!item.team) team.className = 'muted'
      row.append(code, subject, status, team)
      body.append(row)
    }
    table.append(head, body)
    list.append(table)
  }

  const renderDetail = () => {
    detail.replaceChildren()
    const item = board?.items.find(entry => entry.ticketCode === selected) ?? null
    if (!item) {
      const empty = element('div', t.select)
      empty.className = 'empty'
      detail.append(empty)
      return
    }
    const title = element('h2', t.proposal)
    const head = element('div')
    head.className = 'detail-head'
    const code = element('strong', item.ticketCode)
    code.className = 'code'
    const subject = element('span', item.subject)
    subject.className = 'muted'
    head.append(code, subject)
    detail.append(title, head)

    if (item.status === 'pending' || !item.priority) {
      const hint = element('p', item.status === 'failed' ? t.failedHint : t.pendingHint)
      hint.className = 'muted'
      detail.append(hint)
    } else {
      detail.append(
        field(t.priority, item.priority),
        field(t.team, TEAM_LABEL[item.team ?? '']?.[zh ? 'zh' : 'en'] ?? item.team),
        field(t.rationale, item.rationale, 'rationale'),
        field(t.draft, item.draftReply, 'rationale')
      )
    }
    if (item.reviewNote) detail.append(field(t.note, item.reviewNote))
    detail.append(field(t.history, String(item.attemptCount)))
    if (item.lastErrorCode) detail.append(field(t.failureCode, item.lastErrorCode))

    const actions = element('div')
    actions.className = 'actions'
    const revision = item.revision
    if (item.status === 'proposed') {
      const confirm = element('button', t.confirm)
      confirm.className = 'primary'
      confirm.addEventListener('click', () => void act(ACTIONS.confirm, { ticketCode: item.ticketCode, expectedRevision: revision }))
      const reject = element('button', t.reject)
      reject.className = 'reject'
      reject.addEventListener('click', () => void act(ACTIONS.reject, { ticketCode: item.ticketCode, expectedRevision: revision, reason: zh ? '人工判断需要重新分诊' : 'Needs another pass' }))
      actions.append(confirm, reject)
    } else if (item.status === 'failed') {
      const retry = element('button', t.retry)
      retry.className = 'primary'
      retry.addEventListener('click', () => void act(ACTIONS.reset, { ticketCode: item.ticketCode, expectedRevision: revision }))
      actions.append(retry)
    } else if (item.status === 'confirmed') {
      const hint = element('p', t.confirmedHint)
      hint.className = 'muted'
      actions.append(hint)
    }
    if (actions.childElementCount) detail.append(actions)
  }

  let rendered: { board: TicketBoard | null; selected: string | null } = { board: null, selected: null }
  function render() {
    rendered = { board, selected }
    renderSummary()
    renderList()
    renderDetail()
  }

  seedButton.textContent = t.loadDemo
  refreshButton.textContent = t.refresh
  seedButton.addEventListener('click', () => void act(ACTIONS.seed, {}))
  refreshButton.addEventListener('click', () => { void load().catch(describeError) })

  return {
    async start() {
      await load()
      bridge.resize(document.documentElement.scrollHeight)
      bridge.onHostEvent(() => { void load().catch(() => undefined) })
      return rendered
    }
  }
}
