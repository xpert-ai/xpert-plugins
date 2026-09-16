import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { segmentSource } from '../../dist/domain/source.js'
import { actionSchemas } from '../../dist/view.provider.js'
import { makeEditable, confirmationProblems } from '../../dist/domain/policy.js'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export default {
  title: 'ReqTrace synthetic acceptance', workspaceRoot: root, instanceId: 'reqtrace-preview', component: { root: resolve(root, 'dist/remote'), runtime: 'react' },
  hostContext: { manifest: { key: 'reqtrace.workbench' }, initialQuery: { page: 1, parameters: {} }, locale: 'zh-CN', theme: { mode: 'light', tokens: { colorBackground: '#ffffff', colorForeground: '#171717', colorPrimary: '#2563eb', colorPrimaryForeground: '#ffffff', colorBorder: '#e5e5e5' } } },
  state: { reviews: [], failNext: true, emptyNext: false, conflictNextRevision: true },
  async handleRequest(message, { state }) {
    if (message.type === 'requestData') {
      const detail = state.reviews.find(item => item.id === message.query?.parameters?.reviewId) ?? null
      const items = state.reviews.map(item => ({ id: item.id, title: item.title, status: item.status, version: item.version, updatedAt: item.updatedAt, requirementCount: item.editableDraft?.requirements.length ?? 0 }))
      return { data: { items, total: items.length, meta: { items, total: items.length, page: 1, pageSize: 20, detail, sendCommand: 'assistant.chat.send_message' } } }
    }
    if (message.type === 'invokeClientCommand') {
      const review = state.reviews.find(item => item.status === 'ANALYZING')
      if (!review) return { result: { success: false, handled: true } }
      if (state.failNext) { state.failNext = false; review.status = 'FAILED'; review.attempt.status = 'FAILED'; review.attempt.errorCode = 'model_failed' }
      else if (state.emptyNext) {
        state.emptyNext = false
        review.aiDraft = { summary: 'Synthetic empty result', requirements: [] }
        review.editableDraft = makeEditable(review.aiDraft)
        review.status = 'EMPTY'
        review.attempt.status = 'SUCCEEDED'
        review.blockers = []
      }
      else {
        review.aiDraft = { summary: 'Synthetic fixture only', requirements: [{ title: '按项目筛选需求', description: '按照项目筛选需求列表。', evidence: [{ segmentId: 'S01', quote: review.sourceSegments[0].text }], acceptance: [{ text: '仅展示选定项目的需求。', basis: 'proposal' }], openQuestions: ['需要默认选择项目吗？'] }] }
        review.editableDraft = makeEditable(review.aiDraft); review.status = 'REVIEWING'; review.attempt.status = 'SUCCEEDED'; review.blockers = confirmationProblems(review.editableDraft)
      }
      review.version++; return { result: { success: true, handled: true } }
    }
    if (message.type !== 'executeAction') throw new Error('Unsupported fixture message')
    const schema = actionSchemas[message.actionKey]; const parsed = schema?.safeParse(message.input)
    if (!parsed?.success) return { result: { success: false, data: { code: 'invalid_input' } } }
    const input = parsed.data
    if (message.actionKey === 'create') {
      const id = randomUUID(); state.reviews.push({ id, title: input.title, sourceText: input.sourceText, sourceSegments: segmentSource(input.sourceText), status: 'READY', version: 1, inputVersion: 1, aiDraft: null, editableDraft: null, confirmedSnapshot: null, confirmedAt: null, updatedAt: new Date().toISOString(), blockers: [], attempt: null })
      return { result: { success: true, data: { reviewId: id } } }
    }
    const review = state.reviews.find(item => item.id === input.reviewId)
    const failure = code => ({ result: { success: false, data: { code } } })
    if (!review) return failure('not_found')
    if (input.expectedVersion !== review.version) return failure('version_conflict')
    if (message.actionKey === 'revise') {
      if (!['READY', 'FAILED', 'EMPTY'].includes(review.status)) return failure('invalid_state')
      if (state.conflictNextRevision) {
        state.conflictNextRevision = false
        review.title = `${review.title}（已在其他页面更新）`
        review.version++
        review.updatedAt = new Date().toISOString()
        return failure('version_conflict')
      }
      review.title = input.title
      review.sourceText = input.sourceText
      review.sourceSegments = segmentSource(input.sourceText)
      review.inputVersion++
      review.aiDraft = null
      review.editableDraft = null
      review.blockers = []
      review.attempt = null
      review.status = 'READY'
      state.emptyNext = true
      review.version++
      review.updatedAt = new Date().toISOString()
      return { result: { success: true, data: { reviewId: review.id } } }
    }
    if (message.actionKey === 'start') {
      review.status = 'ANALYZING'; review.version++; review.attempt = { id: randomUUID(), status: 'RUNNING', errorCode: null, deadlineAt: new Date(Date.now() + 90000).toISOString() }
      return { result: { success: true, data: { reviewId: review.id, attemptId: review.attempt.id, clientCommand: { commandKey: 'assistant.chat.send_message', payload: { text: 'Synthetic analysis request' } } } } }
    }
    if (message.actionKey === 'save') { review.editableDraft = input.draft; review.blockers = confirmationProblems(input.draft) }
    else if (message.actionKey === 'confirm') {
      if (confirmationProblems(review.editableDraft).length) return failure('confirmation_blocked')
      review.confirmedAt = new Date().toISOString(); review.confirmedSnapshot = { draft: { requirements: review.editableDraft.requirements.filter(item => item.included) }, confirmedAt: review.confirmedAt, sourceVersion: review.inputVersion }; review.status = 'CONFIRMED'
    } else return failure('invalid_state')
    review.version++; return { result: { success: true, data: { reviewId: review.id } } }
  }
}
