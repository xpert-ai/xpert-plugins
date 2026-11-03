import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
const root = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const { createSchema, saveSchema, emptyReport, ensureConfirmable } = require('./dist/shared/contracts.js')

/** Simulated host only; installed-platform persistence is verified separately. */
export default {
  title: '缺陷受理 · Simulated host', workspaceRoot: root, instanceId: 'defect-intake-preview',
  component: { root: join(root, 'dist/remote'), runtime: 'react', sandbox: 'allow-scripts', viewportBound: true },
  hostContext: { manifest: { key: 'defect_intake.intake' }, payload: {}, initialQuery: { parameters: {} }, locale: 'zh-Hans', theme: { mode: 'light', tokens: {} }, debug: { enabled: false, production: true } },
  /** @type {{ records: import('./dist/shared/contracts').IntakeRecord[], requestIds: Record<string, string>, failNextSave: boolean }} */
  state: { records: [], requestIds: {}, failNextSave: false },
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
          record = { id: randomUUID(), originalFeedback: input.originalFeedback, supplement: '', report: emptyReport(), revision: 1, status: 'draft', confirmed: null, createdAt: now, updatedAt: now }
          state.records.unshift(record); state.requestIds[input.requestId] = record.id
        }
      } else {
        if (!record) throw new Error('not_found')
        if (record.revision !== message.input.revision) throw new Error('revision_conflict')
        if (message.actionKey === 'save') {
          if (state.failNextSave) { state.failNextSave = false; throw new Error('storage_unavailable') }
          const input = saveSchema.parse(message.input)
          Object.assign(record, { report: input.report, supplement: input.supplement, status: 'draft', revision: record.revision + 1, updatedAt: new Date().toISOString() })
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
