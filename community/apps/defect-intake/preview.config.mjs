import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
const root = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const { createSchema, saveSchema, emptyReport, ensureConfirmable, recordSchema, reportKeys } = require('./dist/shared/contracts.js')
const { buildAnalysisInput, mergeAnalysisReport, mergeAnswers, protectedFields, validateAnalysisOutput } = require('./dist/lib/analysis/domain.js')

/** Simulated host only; installed-platform persistence is verified separately. */
export default {
  title: '缺陷受理 · Simulated host', workspaceRoot: root, instanceId: 'defect-intake-preview',
  component: { root: join(root, 'dist/remote'), runtime: 'react', sandbox: 'allow-scripts', viewportBound: true },
  hostContext: { manifest: { key: 'defect_intake.intake' }, payload: {}, initialQuery: { parameters: {} }, locale: 'zh-Hans', theme: { mode: 'light', tokens: {} }, debug: { enabled: false, production: true } },
  /** @type {{ records: import('./dist/shared/contracts').IntakeRecord[], requestIds: Record<string, string>, failNextSave: boolean, failNextAnalysis: boolean, analysisDelayMs: number }} */
  state: { records: [], requestIds: {}, failNextSave: false, failNextAnalysis: false, analysisDelayMs: 4000 },
  async handleEvent(message, { state }) {
    if (message.type !== 'preview-test-control') return
    if (typeof message.failNextAnalysis === 'boolean') state.failNextAnalysis = message.failNextAnalysis
    if (Number.isFinite(message.analysisDelayMs)) state.analysisDelayMs = Math.max(0, Math.min(15000, message.analysisDelayMs))
  },
  async handleRequest(message, { state }) {
    if (message.type === 'requestData') {
      const page = message.query.page || 1
      const filtered = state.records.filter(row => `${row.originalFeedback} ${row.report.title}`.includes(message.query.search || ''))
      return { type: 'data', data: { items: filtered.slice((page - 1) * 25, page * 25).map(row => ({ id: row.id, title: row.report.title, preview: row.originalFeedback.slice(0, 90), status: row.status, revision: row.revision, updatedAt: row.updatedAt })), item: state.records.find(row => row.id === message.query.parameters?.recordId) || null, total: filtered.length, meta: { page, pageSize: 25 } } }
    }
    if (message.type !== 'executeAction') throw new Error('Unsupported fixture request')
    try {
      let record = state.records.find(row => row.id === message.targetId)
      if (message.actionKey === 'create') {
        const input = createSchema.parse(message.input)
        record = state.records.find(row => row.id === state.requestIds[input.requestId])
        if (!record) {
          const now = new Date().toISOString()
          record = recordSchema.parse({ id: randomUUID(), originalFeedback: input.originalFeedback, supplement: '', report: emptyReport(), revision: 1, status: 'draft', confirmed: null, createdAt: now, updatedAt: now })
          state.records.unshift(record); state.requestIds[input.requestId] = record.id
        }
      } else {
        if (!record) throw new Error('not_found')
        if (record.revision !== message.input.revision) throw new Error('revision_conflict')
        if (message.actionKey === 'save') {
          if (state.failNextSave) { state.failNextSave = false; throw new Error('storage_unavailable') }
          const input = saveSchema.parse(message.input)
          const manual = [...new Set([...protectedFields(record), ...reportKeys.filter(key => record.report[key] !== input.report[key])])]
          const answers = mergeAnswers(record, input.answers)
          if (record.analysis && ['queued', 'running'].includes(record.analysis.status)) record.analysis.status = 'superseded'
          Object.assign(record, { report: input.report, supplement: input.supplement, answers, protectedFields: manual, status: 'draft', revision: record.revision + 1, updatedAt: new Date().toISOString() })
        } else if (message.actionKey === 'analyze') {
          if (!record.analysis || !['queued', 'running'].includes(record.analysis.status)) {
            const id = randomUUID(); const revision = record.revision
            const snapshot = buildAnalysisInput(record)
            const fail = state.failNextAnalysis; state.failNextAnalysis = false
            record.protectedFields = snapshot.protectedFields
            record.analysis = { id, sourceRevision: revision, status: 'running', createdAt: new Date().toISOString(), completedAt: null, errorCode: null }
            const current = record
            setTimeout(() => {
              if (current.revision !== revision || current.analysis?.id !== id || current.analysis.status === 'superseded') return
              current.analysis.completedAt = new Date().toISOString()
              if (fail) { current.analysis.status = 'failed'; current.analysis.errorCode = 'model_unavailable'; return }
              const text = current.originalFeedback.slice(0, 500)
              const result = validateAnalysisOutput({ fields: [{ field: 'actual', value: text, evidence: [{ sourceId: 'original', quote: text }] }], questions: snapshot.answers.some(answer => answer.text.trim()) ? [] : [{ field: 'frequency', question: '同样条件下每次都会出现吗？', reason: '确认复现频率。' }] }, snapshot, id, revision)
              current.report = mergeAnalysisReport(snapshot, result); current.aiResult = result; current.analysis.status = 'succeeded'; current.status = result.questions.length ? 'needs_information' : 'ready_for_review'; current.revision++
            }, state.analysisDelayMs)
          }
        } else if (message.actionKey === 'confirm') {
          ensureConfirmable(record.report)
          record.confirmed = { report: structuredClone(record.report), supplement: record.supplement, sourceRevision: record.revision, confirmedAt: new Date().toISOString() }
          record.status = 'confirmed'; record.revision++
        } else throw new Error('unsupported_action')
      }
      return { type: 'actionResult', result: { success: true, data: record } }
    } catch (error) { return { type: 'actionResult', result: { success: false, data: { code: error instanceof Error ? error.message : 'storage_unavailable' } } } }
  }
}
