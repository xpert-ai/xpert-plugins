import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const componentRoot = dirname(fileURLToPath(import.meta.url))
const platformRoot = resolve(
  process.env.XPERT_PLATFORM_ROOT ?? resolve(componentRoot, '../../../../../../../../xpert')
)
const workspaceRoot = resolve(platformRoot, 'packages/server')
const now = '2026-09-17T12:00:00.000Z'
const pendingId = '10000000-0000-4000-8000-000000000001'
const failedId = '10000000-0000-4000-8000-000000000002'
const confirmedId = '10000000-0000-4000-8000-000000000003'

const triageResult = {
  summary: '客户收到破损商品，并在两次联系后仍未获得换货安排。',
  category: '商品破损 / 售后处理',
  urgency: 'high',
  customerIntent: '尽快完成换货并获得明确的配送时间。',
  riskFlags: ['重复投诉', '潜在升级'],
  suggestedAction: '核验订单后优先安排换货，并由客服主管在当天回访。',
  replyDraft: '很抱歉商品在运输中受损。我们将立即核验订单并优先安排换货，今天内向您同步新的配送时间。'
}

export default {
  title: 'Complaint Triage Workbench - Remote View Preview',
  frameTitle: 'Complaint Triage Workbench',
  workspaceRoot,
  instanceId: 'complaint-triage-preview',
  component: { root: componentRoot, runtime: 'esm', title: 'Complaint Triage Workbench' },
  hostContext: {
    manifest: { key: 'complaint_triage__workbench' },
    payload: {},
    initialQuery: { page: 1, pageSize: 30, selectionId: pendingId },
    locale: 'zh-Hans',
    theme: {
      mode: 'light',
      tokens: {
        colorBackground: '#f7f8f8',
        colorForeground: '#18181b',
        colorCard: '#ffffff',
        colorMuted: '#f4f4f5',
        colorMutedForeground: '#71717a',
        colorPrimary: '#0f766e',
        colorPrimaryForeground: '#ffffff',
        colorBorder: '#e4e4e7',
        colorInput: '#d4d4d8',
        colorRing: '#0f766e',
        colorSuccess: '#047857',
        colorWarning: '#a16207',
        radiusMd: '0.375rem'
      }
    },
    debug: { enabled: false, production: true }
  },
  state: {
    cases: [
      complaintCase(pendingId, '华东零售客户', 'ORDER-2026-0917', 'PENDING_REVIEW', {
        aiOriginalResult: triageResult,
        humanDraftResult: triageResult,
        attemptCount: 1
      }),
      complaintCase(failedId, '北区渠道客户', 'ORDER-2026-0916', 'FAILED', {
        attemptCount: 1,
        errorCode: 'assistant_task_failed',
        errorMessage: '模型服务暂时不可用，请稍后重试。'
      }),
      complaintCase(confirmedId, '在线商城客户', 'ORDER-2026-0915', 'CONFIRMED', {
        aiOriginalResult: triageResult,
        humanDraftResult: triageResult,
        humanConfirmedResult: { ...triageResult, urgency: 'medium' },
        attemptCount: 1,
        confirmedAt: now
      })
    ],
    actions: [],
    notifications: []
  },
  async handleRequest(message, { state }) {
    if (message.type === 'requestData') {
      const selected =
        state.cases.find((item) => item.id === message.query?.selectionId) ?? state.cases[0] ?? null
      return {
        data: {
          tableKey: 'complaintCases',
          table: {
            key: 'complaintCases',
            items: state.cases,
            total: state.cases.length,
            page: 1,
            pageSize: 30
          },
          selectedCase: selected,
          empty: state.cases.length === 0
        }
      }
    }
    if (message.type !== 'executeAction') {
      throw new Error(`Unsupported preview request '${message.type}'.`)
    }
    state.actions.push({ actionKey: message.actionKey, input: structuredClone(message.input) })
    if (message.actionKey === 'create_case') {
      const created = complaintCase(
        crypto.randomUUID(),
        message.input.customerName,
        message.input.customerReference || null,
        'DRAFT',
        { complaintContent: message.input.complaintContent, attemptCount: 0 }
      )
      state.cases.unshift(created)
      return actionResult('投诉工单已创建。', created)
    }
    const item = state.cases.find((entry) => entry.id === message.input?.caseId)
    if (!item) return { result: { success: false, message: { zh_Hans: '未找到投诉工单。' } } }
    if (message.actionKey === 'analyze_case' || message.actionKey === 'retry_case') {
      item.status = 'PROCESSING'
      item.attemptCount += 1
      item.attemptId = crypto.randomUUID()
      item.errorCode = null
      item.errorMessage = null
      item.updatedAt = new Date().toISOString()
      return actionResult('AI 分析已开始。', { case: item })
    }
    if (message.actionKey === 'check_analysis') {
      item.status = 'PENDING_REVIEW'
      item.aiOriginalResult = structuredClone(triageResult)
      item.humanDraftResult = structuredClone(triageResult)
      item.updatedAt = new Date().toISOString()
      return actionResult('AI 分析结果已生成。', { case: item })
    }
    if (message.actionKey === 'save_review' || message.actionKey === 'confirm_case') {
      item.humanDraftResult = structuredClone(message.input.result)
      if (message.actionKey === 'confirm_case') {
        item.status = 'CONFIRMED'
        item.humanConfirmedResult = structuredClone(message.input.result)
        item.confirmedAt = new Date().toISOString()
      }
      item.updatedAt = new Date().toISOString()
      return actionResult(message.actionKey === 'confirm_case' ? '投诉结果已确认。' : '审核草稿已保存。', item)
    }
    throw new Error(`Unsupported preview action '${message.actionKey}'.`)
  },
  async handleEvent(message, { state }) {
    if (message.type === 'notify') {
      state.notifications.push({ level: message.level, message: message.message })
    }
    return {}
  }
}

function complaintCase(id, customerName, customerReference, status, overrides = {}) {
  return {
    id,
    tenantId: 'preview-tenant',
    organizationId: 'preview-organization',
    scopeKey: 'tenant:preview-tenant:organization:preview-organization',
    createdById: 'preview-user',
    customerName,
    customerReference,
    complaintContent:
      overrides.complaintContent ?? '收到的商品外包装完好，但内部商品已破损。此前两次联系客服仍未得到明确处理时间。',
    status,
    aiOriginalResult: null,
    humanDraftResult: null,
    humanConfirmedResult: null,
    attemptId: null,
    attemptCount: 0,
    assistantTaskId: null,
    executionId: null,
    conversationId: null,
    threadId: null,
    errorCode: null,
    errorMessage: null,
    confirmedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  }
}

function actionResult(message, data) {
  return {
    result: {
      success: true,
      message: { en_US: message, zh_Hans: message },
      refresh: true,
      data
    }
  }
}
