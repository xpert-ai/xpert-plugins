import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const componentRoot = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(componentRoot, '../../../..')
const meeting = {
  id: '50000000-0000-4000-8000-000000000101',
  title: '产品周会 · 9 月 16 日',
  status: 'review_required',
  revision: 5,
  extractionAttempt: 1,
  decisionCount: 2,
  actionItemCount: 2,
  errorCode: null,
  errorMessage: null,
  createdAt: '2026-09-16T02:00:00.000Z',
  updatedAt: '2026-09-16T02:08:00.000Z',
  reviewedAt: null,
  sourceText: '会议决定新版工作台在周五前完成中文验收。\n张敏负责补齐空状态和失败重试，截止 9 月 18 日。\n王磊负责完成本地部署说明。',
  decisions: [
    { id: '60000000-0000-4000-8000-000000000101', itemKey: 'decision_1', statement: '新版工作台在周五前完成中文验收。', evidenceQuote: '会议决定新版工作台在周五前完成中文验收。', confidence: 0.98, reviewStatus: 'pending', sortOrder: 0 },
    { id: '60000000-0000-4000-8000-000000000102', itemKey: 'decision_2', statement: '失败重试必须保留可理解的失败原因。', evidenceQuote: '张敏负责补齐空状态和失败重试', confidence: 0.83, reviewStatus: 'pending', sortOrder: 1 }
  ],
  actionItems: [
    { id: '70000000-0000-4000-8000-000000000101', itemKey: 'action_1', task: '补齐空状态和失败重试', owner: '张敏', dueDate: '2026-09-18', priority: 'high', status: 'pending_confirmation', evidenceQuote: '张敏负责补齐空状态和失败重试，截止 9 月 18 日。', confidence: 0.97, reviewStatus: 'pending', sortOrder: 0 },
    { id: '70000000-0000-4000-8000-000000000102', itemKey: 'action_2', task: '完成本地部署说明', owner: '王磊', dueDate: null, priority: 'medium', status: 'pending_confirmation', evidenceQuote: '王磊负责完成本地部署说明。', confidence: 0.94, reviewStatus: 'pending', sortOrder: 1 }
  ]
}

const executionReview = {
  id: '80000000-0000-4000-8000-000000000101',
  status: 'ready',
  revision: 2,
  focus: 'open_actions',
  summary: '当前有 2 项待跟进，其中 1 项缺少截止日期。',
  followUpBrief: '## 下次会议重点\n\n- 确认张敏负责的失败重试是否按期完成。\n- 为王磊负责的本地部署说明补充截止日期和验收标准。',
  riskCount: 1,
  errorCode: null,
  errorMessage: null,
  createdAt: '2026-09-17T01:00:00.000Z',
  updatedAt: '2026-09-17T01:01:00.000Z',
  completedAt: '2026-09-17T01:01:00.000Z'
}

const agentRisks = [{
  id: '90000000-0000-4000-8000-000000000101',
  reviewId: executionReview.id,
  signalKey: 'ambiguous-deployment-acceptance',
  source: 'agent',
  riskType: 'ambiguous_commitment',
  severity: 'medium',
  title: '本地部署说明缺少明确验收标准',
  rationale: '行动项只说明要完成部署说明，没有定义由谁验收以及完成标准。',
  evidenceQuote: '王磊负责完成本地部署说明。',
  recommendation: '补充文档范围、验收人和完成日期。',
  meetingId: meeting.id,
  actionItemId: meeting.actionItems[1].id,
  confidence: 0.91,
  reviewStatus: 'open',
  createdAt: '2026-09-17T01:00:30.000Z'
}]

export default {
  title: 'Meeting Action Workbench · Local Preview',
  workspaceRoot: pluginRoot,
  instanceId: 'meeting-action-workbench-preview',
  component: { root: componentRoot, runtime: 'react' },
  hostContext: {
    manifest: { key: 'meeting_action_workbench' },
    payload: {},
    initialQuery: { pageSize: 20, parameters: { meetingId: meeting.id } },
    locale: 'zh-Hans',
    theme: { mode: 'light', density: 'compact', tokens: { background: '#f8fafc', foreground: '#17202a', primary: '#0369a1', border: '#e2e8f0' } }
  },
  state: { meeting: structuredClone(meeting), review: structuredClone(executionReview), risks: structuredClone(agentRisks), commands: [] },
  async handleRequest(message, { state }) {
    if (message.type === 'requestData') {
      return { data: { meta: workbench(state.meeting, state.review, state.risks) } }
    }
    if (message.type === 'invokeClientCommand') {
      state.commands.push({ commandKey: message.commandKey, payload: message.payload })
      return { result: { success: true } }
    }
    if (message.type === 'executeFileAction') {
      if (message.actionKey !== 'import_meeting_file') throw new Error('UNSUPPORTED_FILE_ACTION')
      const fileName = message.file?.name || 'meeting-record.txt'
      const sourceText = new TextDecoder().decode(new Uint8Array(message.file?.buffer || [])).trim()
      if (sourceText.length < 20) throw new Error('MEETING_FILE_CONTENT_TOO_SHORT')
      return {
        result: {
          success: true,
          data: {
            fileName,
            mimeType: message.file?.type || 'text/plain',
            title: fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
            sourceText,
            characterCount: sourceText.length
          }
        }
      }
    }
    if (message.type === 'executeAction') {
      if (message.actionKey === 'update_risk_signal_status') {
        if (message.input?.expectedRevision !== state.review.revision) throw new Error('EXECUTION_REVIEW_REVISION_CONFLICT')
      } else if (message.input?.expectedRevision !== state.meeting.revision) {
        throw new Error('MEETING_REVISION_CONFLICT')
      }
      if (message.actionKey === 'update_decision') {
        const item = state.meeting.decisions.find((entry) => entry.id === message.input.decisionId)
        if (!item) throw new Error('DECISION_NOT_FOUND')
        item.statement = message.input.statement
        item.reviewStatus = message.input.reviewStatus
      } else if (message.actionKey === 'update_action_item') {
        const item = state.meeting.actionItems.find((entry) => entry.id === message.input.actionItemId)
        if (!item) throw new Error('ACTION_ITEM_NOT_FOUND')
        Object.assign(item, message.input)
      } else if (message.actionKey === 'confirm_meeting') {
        state.meeting.status = 'confirmed'
        state.meeting.decisions.forEach((item) => { if (item.reviewStatus === 'pending') item.reviewStatus = 'confirmed' })
        state.meeting.actionItems.forEach((item) => {
          if (item.reviewStatus === 'pending') item.reviewStatus = 'confirmed'
          if (item.status === 'pending_confirmation') item.status = 'pending'
        })
      } else if (message.actionKey === 'update_execution_action') {
        const item = state.meeting.actionItems.find((entry) => entry.id === message.input.actionItemId)
        if (!item) throw new Error('ACTION_ITEM_NOT_FOUND')
        item.status = message.input.status
      } else if (message.actionKey === 'update_risk_signal_status') {
        const risk = state.risks.find((entry) => entry.id === message.input.riskSignalId)
        if (!risk) throw new Error('RISK_SIGNAL_NOT_FOUND')
        risk.reviewStatus = message.input.reviewStatus
        state.review.revision += 1
      } else {
        throw new Error('UNSUPPORTED_ACTION')
      }
      if (message.actionKey !== 'update_risk_signal_status') state.meeting.revision += 1
      return { result: { success: true, data: state.meeting } }
    }
    throw new Error('Unsupported preview request: ' + message.type)
  }
}

function workbench(current, review, risks) {
  const trackable = current.actionItems.filter((item) => item.status !== 'pending_confirmation' && item.reviewStatus !== 'rejected')
  const today = '2026-09-17'
  const dueSoon = '2026-09-20'
  const executionActions = trackable.map((item) => ({
    ...item,
    meetingId: current.id,
    meetingTitle: current.title,
    meetingRevision: current.revision,
    ruleFlags: item.status === 'completed' || item.status === 'cancelled' ? [] : [
      ...(!item.owner ? ['missing_owner'] : []),
      ...(!item.dueDate ? ['missing_due_date'] : item.dueDate < today ? ['overdue'] : item.dueDate <= dueSoon ? ['due_soon'] : [])
    ]
  }))
  const ruleSignals = executionActions.flatMap((item) => item.ruleFlags.map((flag) => ({
    id: `rule:${flag}:${item.id}`,
    reviewId: null,
    signalKey: `${flag}-${item.itemKey}`,
    source: 'rule',
    riskType: flag,
    severity: flag === 'overdue' ? 'high' : 'medium',
    title: flag,
    rationale: flag,
    evidenceQuote: item.task,
    recommendation: flag,
    meetingId: current.id,
    actionItemId: item.id,
    confidence: 1,
    reviewStatus: 'open',
    createdAt: '2026-09-17T01:00:00.000Z'
  })))
  return {
    summary: {
      total: 1,
      processing: current.status === 'processing' ? 1 : 0,
      reviewRequired: current.status === 'review_required' ? 1 : 0,
      confirmed: current.status === 'confirmed' ? 1 : 0,
      failed: current.status === 'failed' ? 1 : 0
    },
    meetings: [summary(current)],
    selectedMeeting: current,
    page: 1,
    pageSize: 20,
    total: 1,
    execution: {
      summary: {
        total: trackable.length,
        pending: trackable.filter((item) => item.status === 'pending').length,
        inProgress: trackable.filter((item) => item.status === 'in_progress').length,
        completed: trackable.filter((item) => item.status === 'completed').length,
        cancelled: trackable.filter((item) => item.status === 'cancelled').length,
        overdue: ruleSignals.filter((item) => item.riskType === 'overdue').length,
        dueSoon: ruleSignals.filter((item) => item.riskType === 'due_soon').length,
        missingOwner: ruleSignals.filter((item) => item.riskType === 'missing_owner').length,
        missingDueDate: ruleSignals.filter((item) => item.riskType === 'missing_due_date').length
      },
      actions: executionActions,
      decisions: current.status === 'confirmed' ? current.decisions.map((item) => ({ id: item.id, meetingId: current.id, meetingTitle: current.title, statement: item.statement, evidenceQuote: item.evidenceQuote, confidence: item.confidence })) : [],
      ruleSignals,
      agentSignals: current.status === 'confirmed' ? risks : [],
      latestReview: current.status === 'confirmed' ? review : null,
      page: 1,
      pageSize: 20,
      total: trackable.length,
      hasMore: false
    }
  }
}

function summary(current) {
  const { sourceText, errorMessage, reviewedAt, decisions, actionItems, ...value } = current
  return { ...value, decisionCount: decisions.length, actionItemCount: actionItems.length }
}
