import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const pluginRoot = dirname(fileURLToPath(import.meta.url))
const now = '2026-09-22T08:30:00.000Z'
const initialId = 'b7860ec1-a355-4ec0-b03c-77d2f504db38'

function fixtureAssessment() {
  return {
    model: 'jev-fixture-for-ui-preview', evaluatedAt: now,
    category: 'miniapp', categoryConfidence: 0.91,
    categoryProbabilities: { miniapp: 0.91, website: 0.02, internal_system: 0.02, automation: 0.02, other: 0.01, unclear: 0.02 },
    nextStep: 'discovery', nextStepConfidence: 0.86,
    nextStepProbabilities: { clarify: 0.05, discovery: 0.86, solution_review: 0.07, defer: 0.02 },
    urgency: 2.15, urgencyConfidence: 0.82,
    completeness: { goal: 0.92, budget: 0.12, timeline: 0.94, decisionMaker: 0.68 },
    priority: 'high', reviewRequired: false, inputTokens: 0, outputTokens: 0
  }
}

function record(overrides = {}) {
  return {
    id: initialId, customer: '合成示例 · 汽配连锁', title: '维修厂库存询价小程序',
    source: '我们有三家汽配门店，需要微信小程序让维修厂查库存和询价。预算三万元，希望六周内上线，老板下周可以确认需求。',
    status: 'review', revision: 2, assessment: fixtureAssessment(), decision: null,
    attempts: [{ id: 'fixture-attempt', startedAt: now, finishedAt: now, status: 'succeeded' }],
    errorCode: null, createdAt: now, updatedAt: now, ...overrides
  }
}

export default {
  title: 'Customer Demand Workbench · Xpert Fixture',
  workspaceRoot: pluginRoot,
  instanceId: 'customer-demand-preview',
  component: { root: resolve(pluginRoot, 'dist/ui'), runtime: 'react' },
  hostContext: {
    manifest: { key: 'customer_demand.workbench' },
    initialQuery: { selectionId: initialId }, locale: 'zh-Hans',
    theme: { mode: 'light', density: 'comfortable', tokens: { background: '#ffffff', foreground: '#171717', primary: '#18181b' } },
    debug: { enabled: false, production: true }
  },
  state: { records: [record()] },
  async handleRequest(message, { state }) {
    if (message.type === 'requestData') {
      const search = String(message.query?.search ?? '').toLowerCase()
      const status = message.query?.parameters?.status
      const items = state.records.filter((item) => (!search || `${item.customer} ${item.title}`.toLowerCase().includes(search)) && (!status || item.status === status))
      const item = state.records.find((entry) => entry.id === message.query?.selectionId)
      return { data: { items, item, total: items.length, meta: { page: 1, pageSize: 12 } } }
    }
    if (message.type !== 'executeAction') throw new Error(`Unsupported preview request '${message.type}'`)
    if (message.actionKey === 'create') {
      const created = record({ ...message.input, id: randomUUID(), status: 'draft', revision: 1, assessment: null, attempts: [], createdAt: now, updatedAt: now })
      delete created.requestId
      state.records.unshift(created)
      return { data: { success: true, data: created } }
    }
    const item = state.records.find((entry) => entry.id === message.targetId)
    if (!item) return { data: { success: false, data: { errorCode: 'not_found' } } }
    if (message.actionKey === 'evaluate') Object.assign(item, { status: 'review', revision: item.revision + 1, assessment: fixtureAssessment(), errorCode: null, attempts: [...item.attempts, { id: randomUUID(), startedAt: now, finishedAt: now, status: 'succeeded' }] })
    else if (message.actionKey === 'edit') Object.assign(item, { ...message.input, status: 'draft', revision: item.revision + 1, assessment: null, decision: null, attempts: [], errorCode: null })
    else if (message.actionKey === 'confirm') Object.assign(item, { status: 'confirmed', revision: item.revision + 1, decision: { category: message.input.category, priority: message.input.priority, nextStep: message.input.nextStep, note: message.input.note ?? '', confirmedAt: now, confirmedBy: 'preview-user' } })
    else return { data: { success: false, data: { errorCode: 'operation_failed' } } }
    item.updatedAt = now
    return { data: { success: true, data: item } }
  }
}
